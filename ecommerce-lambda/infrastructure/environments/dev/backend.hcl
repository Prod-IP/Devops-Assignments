# Example remote backend — create bucket/lock table once via bootstrap
terraform {
  backend "s3" {
    bucket         = "ecommerce-tfstate-ACCOUNT_ID"
    key            = "ecommerce/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ecommerce-tf-locks"
    encrypt        = true
  }
}
