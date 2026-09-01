variable "aws_profile" {
  description = "AWS CLI profile name (for SSO or access keys)"
  type        = string
}

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "Expected AWS account ID (used to prevent deploying to the wrong account)"
  type        = string
}

variable "project_name" {
  description = "Used as a prefix for all resource names"
  type        = string
  default     = "microservices"
}

variable "environment" {
  description = "Deployment environment (dev / staging / prod)"
  type        = string
  default     = "dev"
}

# ── VPC ──────────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "availability_zones" {
  description = "AZs to deploy subnets into"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# ── EC2 ──────────────────────────────────────────────────────────────────────

variable "ami_id" {
  description = "Ubuntu 22.04 LTS AMI (update per region)"
  type        = string
  default     = "ami-0c7217cdde317cfec" # Ubuntu 22.04 us-east-1
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "key_name" {
  description = "Name of the existing EC2 key pair for SSH access"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "Your IP/CIDR allowed to SSH (e.g. 203.0.113.5/32)"
  type        = string
  default     = "0.0.0.0/0" # Restrict this to your IP in production
}

variable "root_volume_size" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 20
}
