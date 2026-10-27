variable "name_prefix" { type = string }
variable "environment" { type = string }

resource "aws_s3_bucket" "product_images" {
  bucket = "${var.name_prefix}-product-images-${var.environment}"
  tags   = { Env = var.environment }
}

resource "aws_s3_bucket_public_access_block" "product_images" {
  bucket                  = aws_s3_bucket.product_images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "product_images" {
  bucket = aws_s3_bucket.product_images.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

output "product_images_bucket" {
  value = aws_s3_bucket.product_images.bucket
}

output "product_images_arn" {
  value = aws_s3_bucket.product_images.arn
}
