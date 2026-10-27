variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "role_arns" { type = map(string) }
variable "artifacts_bucket" { type = string }
variable "artifact_keys" { type = map(string) }
variable "env_vars" { type = map(map(string)) }
variable "notify_queue_arn" { type = string }
variable "inventory_queue_arn" { type = string }
variable "subnet_ids" {
  type    = list(string)
  default = []
}
variable "security_group_ids" {
  type    = list(string)
  default = []
}
variable "provisioned_concurrency" {
  type    = number
  default = 0
}

locals {
  http_functions = ["auth", "products", "cart", "orders", "admin"]
}

resource "aws_lambda_function" "http" {
  for_each = toset(local.http_functions)

  function_name = "${var.name_prefix}-${each.key}-${var.environment}"
  role          = var.role_arns[each.key]
  handler       = "lambda.handler"
  runtime       = "nodejs20.x"
  architectures = ["arm64"]
  timeout       = 29
  memory_size   = 512
  s3_bucket     = var.artifacts_bucket
  s3_key        = var.artifact_keys[each.key]
  publish       = true

  environment {
    variables = merge(
      {
        NODE_OPTIONS     = "--enable-source-maps"
        POWERTOOLS_SERVICE_NAME = each.key
        ENVIRONMENT      = var.environment
      },
      lookup(var.env_vars, each.key, {})
    )
  }

  tracing_config {
    mode = "Active"
  }

  dynamic "vpc_config" {
    for_each = length(var.subnet_ids) > 0 ? [1] : []
    content {
      subnet_ids         = var.subnet_ids
      security_group_ids = var.security_group_ids
    }
  }

  tags = { Env = var.environment, Service = each.key }
}

resource "aws_lambda_alias" "live" {
  for_each         = aws_lambda_function.http
  name             = "live"
  function_name    = each.value.function_name
  function_version = each.value.version
}

resource "aws_lambda_provisioned_concurrency_config" "hot" {
  for_each = var.provisioned_concurrency > 0 ? toset(["products", "orders"]) : toset([])

  function_name                     = aws_lambda_alias.live[each.key].function_name
  qualifier                         = aws_lambda_alias.live[each.key].name
  provisioned_concurrent_executions = var.provisioned_concurrency
}

resource "aws_lambda_function" "authorizer" {
  function_name = "${var.name_prefix}-authorizer-${var.environment}"
  role          = var.role_arns.authorizer
  handler       = "authorizer.authorizer"
  runtime       = "nodejs20.x"
  architectures = ["arm64"]
  timeout       = 10
  memory_size   = 256
  s3_bucket     = var.artifacts_bucket
  s3_key        = var.artifact_keys.authorizer
  publish       = true

  environment {
    variables = lookup(var.env_vars, "authorizer", {})
  }

  tracing_config { mode = "Active" }
}

resource "aws_lambda_function" "notifications" {
  function_name = "${var.name_prefix}-notifications-${var.environment}"
  role          = var.role_arns.notifications
  handler       = "handler.handler"
  runtime       = "nodejs20.x"
  architectures = ["arm64"]
  timeout       = 30
  memory_size   = 256
  s3_bucket     = var.artifacts_bucket
  s3_key        = var.artifact_keys.notifications

  environment {
    variables = lookup(var.env_vars, "notifications", {})
  }

  tracing_config { mode = "Active" }
}

resource "aws_lambda_event_source_mapping" "notify" {
  event_source_arn = var.notify_queue_arn
  function_name    = aws_lambda_function.notifications.arn
  batch_size       = 5
  enabled          = true
}

resource "aws_lambda_function" "inventory" {
  function_name = "${var.name_prefix}-inventory-${var.environment}"
  role          = var.role_arns.products
  handler       = "inventory.handler.inventoryHandler"
  runtime       = "nodejs20.x"
  architectures = ["arm64"]
  timeout       = 30
  memory_size   = 256
  s3_bucket     = var.artifacts_bucket
  s3_key        = var.artifact_keys.products

  environment {
    variables = lookup(var.env_vars, "products", {})
  }

  tracing_config { mode = "Active" }
}

resource "aws_lambda_event_source_mapping" "inventory" {
  event_source_arn = var.inventory_queue_arn
  function_name    = aws_lambda_function.inventory.arn
  batch_size       = 5
  enabled          = true
}

output "http_function_arns" {
  value = { for k, f in aws_lambda_function.http : k => aws_lambda_alias.live[k].arn }
}

output "http_function_names" {
  value = { for k, f in aws_lambda_function.http : k => f.function_name }
}

output "authorizer_invoke_arn" {
  value = aws_lambda_function.authorizer.invoke_arn
}

output "authorizer_function_name" {
  value = aws_lambda_function.authorizer.function_name
}
