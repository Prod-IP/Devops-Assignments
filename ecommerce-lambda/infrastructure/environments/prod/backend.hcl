terraform {
  backend "s3" {
    bucket         = "ecommerce-tfstate-ACCOUNT_ID"
    key            = "ecommerce/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ecommerce-tf-locks"
    encrypt        = true
  }
}
