variable "aws_region" {
  type    = string
  default = "ap-south-1"
}
variable "project" {
  type    = string
  default = "amrutam"
}
variable "environment" {
  type    = string
  default = "dev"
}
variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}
variable "container_image_tag" {
  type    = string
  default = "latest"
}
variable "api_desired_count" {
  type    = number
  default = 0
}
variable "worker_desired_count" {
  type    = number
  default = 0
}
variable "api_cpu" {
  type    = number
  default = 512
}
variable "api_memory" {
  type    = number
  default = 1024
}
variable "worker_cpu" {
  type    = number
  default = 512
}
variable "worker_memory" {
  type    = number
  default = 1024
}
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "db_allocated_storage" {
  type    = number
  default = 20
}
variable "db_multi_az" {
  type    = bool
  default = false
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
variable "certificate_arn" {
  type        = string
  default     = null
  nullable    = true
  description = "Optional ACM certificate ARN. When set, HTTP redirects to HTTPS."
}
variable "app_public_url" {
  type        = string
  default     = null
  nullable    = true
  description = "Public HTTPS origin used in notification links. Required when API tasks are enabled."
  validation {
    condition     = var.app_public_url == null || can(regex("^https://[^/]+", var.app_public_url))
    error_message = "app_public_url must be an https:// URL when set."
  }
}
variable "email_transport" {
  type        = string
  default     = "fake"
  description = "Email transport: fake for demos or smtp for delivery. SMTP_URL must then exist in the application secret."
  validation {
    condition     = contains(["fake", "smtp"], var.email_transport)
    error_message = "email_transport must be fake or smtp."
  }
}
variable "email_from" {
  type    = string
  default = "no-reply@amrutam.local"
}
variable "otel_enabled" {
  type    = bool
  default = false
}
variable "otel_traces_endpoint" {
  type        = string
  default     = null
  nullable    = true
  description = "Reachable OTLP/HTTP traces endpoint, for example an ADOT collector URL."
  validation {
    condition     = var.otel_traces_endpoint == null || can(regex("^https?://", var.otel_traces_endpoint))
    error_message = "otel_traces_endpoint must be an HTTP(S) URL when set."
  }
}
variable "deletion_protection" {
  type    = bool
  default = false
}
variable "log_retention_days" {
  type    = number
  default = 30
}

variable "extra_tags" {
  type    = map(string)
  default = {}
}
