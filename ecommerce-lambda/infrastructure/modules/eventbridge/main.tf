variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "notify_queue_arn" { type = string }
variable "inventory_queue_arn" { type = string }
variable "notify_queue_url" { type = string }
variable "inventory_queue_url" { type = string }

resource "aws_cloudwatch_event_bus" "orders" {
  name = "${var.name_prefix}-orders-${var.environment}"
}

resource "aws_cloudwatch_event_rule" "order_notify" {
  name           = "${var.name_prefix}-order-notify-${var.environment}"
  event_bus_name = aws_cloudwatch_event_bus.orders.name
  event_pattern = jsonencode({
    source      = ["ecommerce.orders"]
    detail-type = ["ORDER_PLACED", "ORDER_UPDATED"]
  })
}

resource "aws_cloudwatch_event_target" "notify_sqs" {
  rule           = aws_cloudwatch_event_rule.order_notify.name
  event_bus_name = aws_cloudwatch_event_bus.orders.name
  arn            = var.notify_queue_arn
}

resource "aws_cloudwatch_event_rule" "order_inventory" {
  name           = "${var.name_prefix}-order-inventory-${var.environment}"
  event_bus_name = aws_cloudwatch_event_bus.orders.name
  event_pattern = jsonencode({
    source      = ["ecommerce.orders"]
    detail-type = ["ORDER_PLACED"]
  })
}

resource "aws_cloudwatch_event_target" "inventory_sqs" {
  rule           = aws_cloudwatch_event_rule.order_inventory.name
  event_bus_name = aws_cloudwatch_event_bus.orders.name
  arn            = var.inventory_queue_arn
}

resource "aws_sqs_queue_policy" "notify" {
  queue_url = var.notify_queue_url
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = var.notify_queue_arn
      Condition  = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.order_notify.arn } }
    }]
  })
}

resource "aws_sqs_queue_policy" "inventory" {
  queue_url = var.inventory_queue_url
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = var.inventory_queue_arn
      Condition  = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.order_inventory.arn } }
    }]
  })
}

output "event_bus_name" { value = aws_cloudwatch_event_bus.orders.name }
output "event_bus_arn" { value = aws_cloudwatch_event_bus.orders.arn }
