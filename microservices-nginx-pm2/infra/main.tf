terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment to store state in S3
  # backend "s3" {
  #   bucket = "your-tf-state-bucket"
  #   key    = "microservices/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region              = var.aws_region
  profile             = var.aws_profile
  allowed_account_ids = [var.aws_account_id]
}
