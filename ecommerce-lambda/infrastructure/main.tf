terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = var.name_prefix
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "vpc" {
  source       = "./modules/vpc"
  name_prefix  = var.name_prefix
  environment  = var.environment
  enable_nat   = var.enable_nat
  azs          = var.availability_zones
}

module "dynamodb" {
  source      = "./modules/dynamodb"
  name_prefix = var.name_prefix
  environment = var.environment
  enable_pitr = var.environment == "prod"
}

module "cognito" {
  source        = "./modules/cognito"
  name_prefix   = var.name_prefix
  environment   = var.environment
  callback_urls = var.cognito_callback_urls
}

module "s3" {
  source      = "./modules/s3"
  name_prefix = var.name_prefix
  environment = var.environment
}

module "sqs" {
  source      = "./modules/sqs"
  name_prefix = var.name_prefix
  environment = var.environment
}

module "eventbridge" {
  source              = "./modules/eventbridge"
  name_prefix         = var.name_prefix
  environment         = var.environment
  notify_queue_arn    = module.sqs.notify_queue_arn
  inventory_queue_arn = module.sqs.inventory_queue_arn
  notify_queue_url    = module.sqs.notify_queue_url
  inventory_queue_url = module.sqs.inventory_queue_url
}

module "iam" {
  source             = "./modules/iam"
  name_prefix        = var.name_prefix
  environment        = var.environment
  table_arns         = module.dynamodb.table_arns
  product_images_arn = module.s3.product_images_arn
  event_bus_arn      = module.eventbridge.event_bus_arn
  notify_queue_arn   = module.sqs.notify_queue_arn
  inventory_queue_arn = module.sqs.inventory_queue_arn
}

# SSM Parameter Store — secrets & config paths
resource "aws_ssm_parameter" "config" {
  for_each = {
    "users_table"          = module.dynamodb.table_names.users
    "products_table"       = module.dynamodb.table_names.products
    "cart_table"           = module.dynamodb.table_names.cart
    "orders_table"         = module.dynamodb.table_names.orders
    "idempotency_table"    = module.dynamodb.table_names.idempotency
    "cognito_user_pool_id" = module.cognito.user_pool_id
    "cognito_client_id"    = module.cognito.client_id
    "event_bus_name"       = module.eventbridge.event_bus_name
    "product_images_bucket"= module.s3.product_images_bucket
    "ses_from_email"       = var.ses_from_email
  }

  name  = "/${var.name_prefix}/${var.environment}/${each.key}"
  type  = "String"
  value = each.value
}

resource "aws_s3_bucket" "artifacts" {
  bucket = "${var.name_prefix}-artifacts-${var.environment}-${data.aws_caller_identity.current.account_id}"
}

data "aws_caller_identity" "current" {}

locals {
  common_env = {
    USERS_TABLE          = module.dynamodb.table_names.users
    PRODUCTS_TABLE       = module.dynamodb.table_names.products
    CART_TABLE           = module.dynamodb.table_names.cart
    ORDERS_TABLE         = module.dynamodb.table_names.orders
    IDEMPOTENCY_TABLE    = module.dynamodb.table_names.idempotency
    COGNITO_USER_POOL_ID = module.cognito.user_pool_id
    COGNITO_CLIENT_ID    = module.cognito.client_id
    EVENT_BUS_NAME       = module.eventbridge.event_bus_name
    PRODUCT_IMAGES_BUCKET= module.s3.product_images_bucket
    SES_FROM_EMAIL       = var.ses_from_email
  }
}

module "lambda" {
  source               = "./modules/lambda"
  name_prefix          = var.name_prefix
  environment          = var.environment
  role_arns            = module.iam.role_arns
  artifacts_bucket     = aws_s3_bucket.artifacts.bucket
  artifact_keys        = var.artifact_keys
  notify_queue_arn     = module.sqs.notify_queue_arn
  inventory_queue_arn  = module.sqs.inventory_queue_arn
  subnet_ids           = var.lambda_in_vpc ? module.vpc.private_subnet_ids : []
  security_group_ids   = var.lambda_in_vpc ? [module.vpc.lambda_security_group_id] : []
  provisioned_concurrency = var.provisioned_concurrency
  env_vars = {
    auth          = local.common_env
    products      = local.common_env
    cart          = local.common_env
    orders        = local.common_env
    admin         = local.common_env
    notifications = { SES_FROM_EMAIL = var.ses_from_email }
    authorizer    = {
      COGNITO_USER_POOL_ID = module.cognito.user_pool_id
    }
  }
}

module "api_gateway" {
  source                   = "./modules/api-gateway"
  name_prefix              = var.name_prefix
  environment              = var.environment
  lambda_invoke_arns       = module.lambda.http_function_arns
  authorizer_invoke_arn    = module.lambda.authorizer_invoke_arn
  authorizer_function_name = module.lambda.authorizer_function_name
  cors_origins             = var.cors_origins
  throttle_burst           = var.throttle_burst
  throttle_rate            = var.throttle_rate
}

module "waf" {
  source      = "./modules/waf"
  name_prefix = var.name_prefix
  environment = var.environment
  api_arn     = module.api_gateway.stage_arn
  enabled     = var.enable_waf
}

module "monitoring" {
  source         = "./modules/monitoring"
  name_prefix    = var.name_prefix
  environment    = var.environment
  function_names = module.lambda.http_function_names
  alert_email    = var.alert_email
  monthly_budget = var.monthly_budget
}

output "api_endpoint" {
  value = module.api_gateway.api_endpoint
}

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_client_id" {
  value = module.cognito.client_id
}

output "ssm_prefix" {
  value = "/${var.name_prefix}/${var.environment}"
}

output "table_names" {
  value = module.dynamodb.table_names
}
