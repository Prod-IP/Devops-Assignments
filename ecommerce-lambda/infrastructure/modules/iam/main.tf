variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "table_arns" { type = map(string) }
variable "product_images_arn" { type = string }
variable "event_bus_arn" { type = string }
variable "notify_queue_arn" { type = string }
variable "inventory_queue_arn" { type = string }

data "aws_iam_policy_document" "assume_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "auth" {
  name               = "${var.name_prefix}-auth-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role" "products" {
  name               = "${var.name_prefix}-products-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role" "cart" {
  name               = "${var.name_prefix}-cart-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role" "orders" {
  name               = "${var.name_prefix}-orders-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role" "notifications" {
  name               = "${var.name_prefix}-notifications-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role" "admin" {
  name               = "${var.name_prefix}-admin-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role" "authorizer" {
  name               = "${var.name_prefix}-authorizer-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

locals {
  basic_managed = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess",
  ]
}

resource "aws_iam_role_policy_attachment" "basic" {
  for_each = {
    auth           = aws_iam_role.auth.name
    products       = aws_iam_role.products.name
    cart           = aws_iam_role.cart.name
    orders         = aws_iam_role.orders.name
    notifications  = aws_iam_role.notifications.name
    admin          = aws_iam_role.admin.name
    authorizer     = aws_iam_role.authorizer.name
  }
  role       = each.value
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "xray" {
  for_each = {
    auth           = aws_iam_role.auth.name
    products       = aws_iam_role.products.name
    cart           = aws_iam_role.cart.name
    orders         = aws_iam_role.orders.name
    notifications  = aws_iam_role.notifications.name
    admin          = aws_iam_role.admin.name
  }
  role       = each.value
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "auth" {
  name = "auth-inline"
  role = aws_iam_role.auth.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:UpdateItem"]
      Resource = [var.table_arns.users, "${var.table_arns.users}/index/*"]
    }]
  })
}

resource "aws_iam_role_policy" "products" {
  name = "products-inline"
  role = aws_iam_role.products.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
        Resource = [var.table_arns.products, "${var.table_arns.products}/index/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${var.product_images_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = var.inventory_queue_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "cart" {
  name = "cart-inline"
  role = aws_iam_role.cart.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:UpdateItem"]
      Resource = [var.table_arns.cart]
    }]
  })
}

resource "aws_iam_role_policy" "orders" {
  name = "orders-inline"
  role = aws_iam_role.orders.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = [
          var.table_arns.orders, "${var.table_arns.orders}/index/*",
          var.table_arns.idempotency
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = var.event_bus_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "notifications" {
  name = "notifications-inline"
  role = aws_iam_role.notifications.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = var.notify_queue_arn
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "admin" {
  name = "admin-inline"
  role = aws_iam_role.admin.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["dynamodb:GetItem", "dynamodb:Query"]
      Resource = [
        var.table_arns.orders, "${var.table_arns.orders}/index/*",
        var.table_arns.products, "${var.table_arns.products}/index/*",
        var.table_arns.users, "${var.table_arns.users}/index/*"
      ]
    }]
  })
}

output "role_arns" {
  value = {
    auth           = aws_iam_role.auth.arn
    products       = aws_iam_role.products.arn
    cart           = aws_iam_role.cart.arn
    orders         = aws_iam_role.orders.arn
    notifications  = aws_iam_role.notifications.arn
    admin          = aws_iam_role.admin.arn
    authorizer     = aws_iam_role.authorizer.arn
  }
}
