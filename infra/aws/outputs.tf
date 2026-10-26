output "api_url" {
  value = coalesce(var.app_public_url, "http://${aws_lb.api.dns_name}")
}

output "ecr_repository_url" { value = aws_ecr_repository.application.repository_url }
output "ecr_repository_name" { value = aws_ecr_repository.application.name }
output "ecs_cluster_name" { value = aws_ecs_cluster.main.name }
output "api_service_name" { value = aws_ecs_service.api.name }
output "worker_service_name" { value = aws_ecs_service.worker.name }
output "application_secret_arn" { value = aws_secretsmanager_secret.application.arn }
output "rds_endpoint" { value = aws_db_instance.postgres.address }
output "redis_endpoint" { value = aws_elasticache_replication_group.redis.primary_endpoint_address }
output "cloudwatch_dashboard_name" { value = aws_cloudwatch_dashboard.operations.dashboard_name }
output "api_task_family" { value = aws_ecs_task_definition.api.family }
output "worker_task_family" { value = aws_ecs_task_definition.worker.family }
output "migration_task_family" { value = aws_ecs_task_definition.migration.family }
output "private_subnet_ids" { value = values(aws_subnet.private)[*].id }
output "ecs_security_group_id" { value = aws_security_group.ecs.id }
