variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "function_names" { type = map(string) }
variable "alert_email" { type = string }
variable "monthly_budget" {
  type    = number
  default = 100
}

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts-${var.environment}"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "errors" {
  for_each = var.function_names

  alarm_name          = "${each.value}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = {
    FunctionName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "throttles" {
  for_each = var.function_names

  alarm_name          = "${each.value}-throttles"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions = {
    FunctionName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "duration_p95" {
  for_each = var.function_names

  alarm_name          = "${each.value}-duration-p95"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 5000
  alarm_actions       = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "e1"
    expression  = "m1"
    label       = "p95"
    return_data = true
  }

  metric_query {
    id = "m1"
    metric {
      metric_name = "Duration"
      namespace   = "AWS/Lambda"
      period      = 60
      stat        = "p95"
      dimensions = {
        FunctionName = each.value
      }
    }
  }
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name_prefix}-${var.environment}"
  dashboard_body = jsonencode({
    widgets = [
      for name, fn in var.function_names : {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 8
        height = 6
        properties = {
          title  = fn
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", fn],
            [".", "Errors", ".", "."],
            [".", "Duration", ".", "."],
            [".", "Throttles", ".", "."],
          ]
        }
      }
    ]
  })
}

resource "aws_xray_group" "ecommerce" {
  group_name        = "${var.name_prefix}-${var.environment}"
  filter_expression = "service(\"${var.name_prefix}\")"
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-${var.environment}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}

data "aws_region" "current" {}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
