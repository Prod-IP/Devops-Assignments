variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "lambda_invoke_arns" { type = map(string) }
variable "authorizer_invoke_arn" { type = string }
variable "authorizer_function_name" { type = string }
variable "cors_origins" {
  type    = list(string)
  default = ["*"]
}
variable "throttle_burst" {
  type    = number
  default = 200
}
variable "throttle_rate" {
  type    = number
  default = 100
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.name_prefix}-api-${var.environment}"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["authorization", "content-type", "x-request-id", "x-user-id", "x-user-role"]
    allow_methods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    allow_origins = var.cors_origins
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_authorizer" "jwt_lambda" {
  api_id                            = aws_apigatewayv2_api.http.id
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = var.authorizer_invoke_arn
  identity_sources                  = ["$request.header.Authorization"]
  name                              = "lambda-jwt"
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  authorizer_result_ttl_in_seconds  = 300
}

resource "aws_lambda_permission" "authorizer" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = var.authorizer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.jwt_lambda.id}"
}

locals {
  routes = {
    "POST /v1/auth/register"           = { fn = "auth", auth = false }
    "POST /v1/auth/login"              = { fn = "auth", auth = false }
    "GET /v1/auth/me"                  = { fn = "auth", auth = true }
    "GET /v1/health"                   = { fn = "auth", auth = false }
    "ANY /v1/products"                 = { fn = "products", auth = false }
    "ANY /v1/products/{proxy+}"        = { fn = "products", auth = false }
    "ANY /v1/cart"                     = { fn = "cart", auth = true }
    "ANY /v1/cart/{proxy+}"            = { fn = "cart", auth = true }
    "ANY /v1/orders"                   = { fn = "orders", auth = true }
    "ANY /v1/orders/{proxy+}"          = { fn = "orders", auth = true }
    "ANY /v1/admin"                    = { fn = "admin", auth = true }
    "ANY /v1/admin/{proxy+}"           = { fn = "admin", auth = true }
  }
}

resource "aws_apigatewayv2_integration" "fn" {
  for_each               = toset(["auth", "products", "cart", "orders", "admin"])
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_invoke_arns[each.key]
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "this" {
  for_each = local.routes

  api_id    = aws_apigatewayv2_api.http.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.fn[each.value.fn].id}"

  authorization_type = each.value.auth ? "CUSTOM" : "NONE"
  authorizer_id      = each.value.auth ? aws_apigatewayv2_authorizer.jwt_lambda.id : null
}

resource "aws_lambda_permission" "apigw" {
  for_each      = toset(["auth", "products", "cart", "orders", "admin"])
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = split(":", var.lambda_invoke_arns[each.key])[6]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = var.environment
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.throttle_burst
    throttling_rate_limit  = var.throttle_rate
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
    })
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/${var.name_prefix}-${var.environment}"
  retention_in_days = 14
}

output "api_endpoint" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "api_id" {
  value = aws_apigatewayv2_api.http.id
}

output "stage_arn" {
  value = aws_apigatewayv2_stage.default.arn
}
