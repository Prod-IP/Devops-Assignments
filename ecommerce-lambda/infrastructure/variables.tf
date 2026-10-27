variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "name_prefix" {
  type    = string
  default = "ecommerce"
}

variable "environment" {
  type = string
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b"]
}

variable "enable_nat" {
  type    = bool
  default = true
}

variable "lambda_in_vpc" {
  type    = bool
  default = false
}

variable "enable_waf" {
  type    = bool
  default = false
}

variable "provisioned_concurrency" {
  type    = number
  default = 0
}

variable "cors_origins" {
  type    = list(string)
  default = ["*"]
}

variable "cognito_callback_urls" {
  type    = list(string)
  default = ["http://localhost:3000/callback"]
}

variable "ses_from_email" {
  type    = string
  default = "orders@example.com"
}

variable "alert_email" {
  type = string
}

variable "monthly_budget" {
  type    = number
  default = 100
}

variable "throttle_burst" {
  type    = number
  default = 200
}

variable "throttle_rate" {
  type    = number
  default = 100
}

variable "artifact_keys" {
  type = map(string)
  default = {
    auth           = "artifacts/auth.zip"
    products       = "artifacts/products.zip"
    cart           = "artifacts/cart.zip"
    orders         = "artifacts/orders.zip"
    admin          = "artifacts/admin.zip"
    notifications  = "artifacts/notifications.zip"
    authorizer     = "artifacts/authorizer.zip"
  }
}
