variable "name_prefix" { type = string }
variable "environment" { type = string }

resource "aws_sqs_queue" "notify_dlq" {
  name                      = "${var.name_prefix}-notify-dlq-${var.environment}"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "inventory_dlq" {
  name                      = "${var.name_prefix}-inventory-dlq-${var.environment}"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "notify" {
  name                       = "${var.name_prefix}-notify-${var.environment}"
  visibility_timeout_seconds = 60
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.notify_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "inventory" {
  name                       = "${var.name_prefix}-inventory-${var.environment}"
  visibility_timeout_seconds = 60
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.inventory_dlq.arn
    maxReceiveCount     = 3
  })
}

output "notify_queue_arn" { value = aws_sqs_queue.notify.arn }
output "notify_queue_url" { value = aws_sqs_queue.notify.url }
output "inventory_queue_arn" { value = aws_sqs_queue.inventory.arn }
output "inventory_queue_url" { value = aws_sqs_queue.inventory.url }
output "notify_dlq_arn" { value = aws_sqs_queue.notify_dlq.arn }
output "inventory_dlq_arn" { value = aws_sqs_queue.inventory_dlq.arn }
