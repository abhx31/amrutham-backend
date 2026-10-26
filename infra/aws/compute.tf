resource "aws_ecr_repository" "application" {
  name                 = local.name
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_lifecycle_policy" "application" {
  repository = aws_ecr_repository.application.name
  policy = jsonencode({ rules = [{
    rulePriority = 1
    description  = "Keep the latest 30 images"
    selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
    action       = { type = "expire" }
  }] })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name}/worker"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "migration" {
  name              = "/ecs/${local.name}/migration"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "application_secrets" {
  name = "application-secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.application.arn
    }]
  })
}

resource "aws_iam_role" "task" {
  name = "${local.name}-ecs-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "ecs_exec" {
  name = "ecs-exec"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel"
      ]
      Resource = "*"
    }]
  })
}

locals {
  image = "${aws_ecr_repository.application.repository_url}:${var.container_image_tag}"
  environment_variables = concat([
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "3000" },
    { name = "TRUST_PROXY_HOPS", value = "1" },
    { name = "LOG_LEVEL", value = "info" },
    { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379" },
    { name = "EMAIL_TRANSPORT", value = var.email_transport },
    { name = "APP_PUBLIC_URL", value = coalesce(var.app_public_url, var.certificate_arn == null ? "http://${aws_lb.api.dns_name}" : "https://${aws_lb.api.dns_name}") },
    { name = "EMAIL_FROM", value = var.email_from },
    { name = "PAYMENT_GATEWAY_MODE", value = "fake" },
    { name = "OTEL_ENABLED", value = tostring(var.otel_enabled) }
    ], var.otel_traces_endpoint == null ? [] : [
    { name = "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", value = var.otel_traces_endpoint }
  ])
  application_secret_keys = concat([
    "DATABASE_URL",
    "JWT_ACCESS_SECRET",
    "PAYMENT_WEBHOOK_SECRET",
    "MFA_ENCRYPTION_KEY",
    "METRICS_BEARER_TOKEN"
  ], var.email_transport == "smtp" ? ["SMTP_URL"] : [])
  application_secrets = [for key in local.application_secret_keys : {
    name      = key
    valueFrom = "${aws_secretsmanager_secret.application.arn}:${key}::"
  }]
  migration_secrets = [{
    name      = "MIGRATION_DATABASE_URL"
    valueFrom = "${aws_secretsmanager_secret.application.arn}:MIGRATION_DATABASE_URL::"
  }]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name         = "api"
    image        = local.image
    essential    = true
    portMappings = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp" }]
    environment  = local.environment_variables
    secrets      = local.application_secrets
    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"fetch('http://localhost:3000/api/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name        = "worker"
    image       = local.image
    command     = ["node", "dist/src/bootstrap-worker.js"]
    essential   = true
    environment = local.environment_variables
    secrets     = local.application_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "migration" {
  family                   = "${local.name}-migration"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name        = "migration"
    image       = local.image
    command     = ["node", "dist/src/migrate.js"]
    essential   = true
    environment = local.environment_variables
    secrets     = local.migration_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.migration.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "migration"
      }
    }
  }])
}

resource "aws_lb" "api" {
  name                       = substr(local.name, 0, 32)
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = values(aws_subnet.public)[*].id
  enable_deletion_protection = var.deletion_protection
}

resource "aws_lb_target_group" "api" {
  name                 = substr("${local.name}-api", 0, 32)
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/api/v1/health/live"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.certificate_arn == null ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.api.arn
    }
  }
  dynamic "default_action" {
    for_each = var.certificate_arn == null ? [] : [1]
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.certificate_arn == null ? 0 : 1
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_ecs_service" "api" {
  name                               = "${local.name}-api"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.api.arn
  desired_count                      = var.api_desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60
  enable_execute_command             = true

  network_configuration {
    subnets          = values(aws_subnet.private)[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }
  depends_on = [aws_lb_listener.http]

  lifecycle {
    precondition {
      condition     = var.api_desired_count == 0 || (var.certificate_arn != null && var.app_public_url != null)
      error_message = "Running API tasks requires certificate_arn and an HTTPS app_public_url; HTTP is bootstrap-only."
    }
    precondition {
      condition     = !var.otel_enabled || var.otel_traces_endpoint != null
      error_message = "otel_traces_endpoint is required when otel_enabled is true."
    }
  }
}

resource "aws_ecs_service" "worker" {
  name                   = "${local.name}-worker"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.worker.arn
  desired_count          = var.worker_desired_count
  launch_type            = "FARGATE"
  platform_version       = "LATEST"
  enable_execute_command = true

  network_configuration {
    subnets          = values(aws_subnet.private)[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  lifecycle {
    precondition {
      condition     = !var.otel_enabled || var.otel_traces_endpoint != null
      error_message = "otel_traces_endpoint is required when otel_enabled is true."
    }
  }
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = max(var.api_desired_count, 4)
  min_capacity       = var.api_desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}

resource "aws_cloudwatch_dashboard" "operations" {
  dashboard_name = "${local.name}-operations"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title = "ECS CPU utilization", region = var.aws_region, view = "timeSeries", stat = "Average", period = 300
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.api.name, { label = "API" }],
            ["...", aws_ecs_service.worker.name, { label = "Worker" }]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title = "ECS memory utilization", region = var.aws_region, view = "timeSeries", stat = "Average", period = 300
          metrics = [
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.api.name, { label = "API" }],
            ["...", aws_ecs_service.worker.name, { label = "Worker" }]
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title = "ALB requests and 5xx", region = var.aws_region, view = "timeSeries", period = 300
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.api.arn_suffix, { stat = "Sum" }],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", { stat = "Sum", color = "#d62728" }]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title   = "ALB p95 target latency", region = var.aws_region, view = "timeSeries", period = 300
          metrics = [["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.api.arn_suffix, { stat = "p95" }]]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 12, height = 6
        properties = {
          title = "RDS CPU and connections", region = var.aws_region, view = "timeSeries", period = 300
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.postgres.identifier, { stat = "Average" }],
            [".", "DatabaseConnections", ".", ".", { stat = "Average", yAxis = "right" }]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 12, width = 12, height = 6
        properties = {
          title = "Redis CPU and connections", region = var.aws_region, view = "timeSeries", period = 300
          metrics = [
            ["AWS/ElastiCache", "EngineCPUUtilization", "ReplicationGroupId", aws_elasticache_replication_group.redis.id, { stat = "Average" }],
            [".", "CurrConnections", ".", ".", { stat = "Average", yAxis = "right" }]
          ]
        }
      }
    ]
  })
}
