resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = values(aws_subnet.private)[*].id
}

resource "aws_db_instance" "postgres" {
  identifier                   = "${local.name}-postgres"
  engine                       = "postgres"
  engine_version               = "17"
  instance_class               = var.db_instance_class
  allocated_storage            = var.db_allocated_storage
  max_allocated_storage        = max(var.db_allocated_storage, 100)
  storage_type                 = "gp3"
  storage_encrypted            = true
  db_name                      = "amrutam"
  username                     = "amrutam_admin"
  manage_master_user_password  = true
  multi_az                     = var.db_multi_az
  publicly_accessible          = false
  db_subnet_group_name         = aws_db_subnet_group.main.name
  vpc_security_group_ids       = [aws_security_group.database.id]
  backup_retention_period      = var.environment == "prod" ? 14 : 3
  deletion_protection          = var.deletion_protection
  skip_final_snapshot          = !var.deletion_protection
  performance_insights_enabled = true
  apply_immediately            = var.environment != "prod"
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = values(aws_subnet.private)[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.name}-redis"
  description                = "Amrutam BullMQ Redis"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  port                       = 6379
  num_cache_clusters         = var.environment == "prod" ? 2 : 1
  automatic_failover_enabled = var.environment == "prod"
  multi_az_enabled           = var.environment == "prod"
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
}

resource "aws_secretsmanager_secret" "application" {
  name                    = "${local.name}/application"
  description             = "Populate JSON keys out-of-band; Terraform does not manage secret values."
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}
