output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}

output "public_ip" {
  description = "Elastic IP — use this to SSH and test endpoints"
  value       = aws_eip.app.public_ip
}

output "public_dns" {
  description = "Public DNS hostname of the instance"
  value       = aws_instance.app.public_dns
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "security_group_id" {
  description = "EC2 security group ID"
  value       = aws_security_group.ec2.id
}

output "ssh_command" {
  description = "SSH command to connect to the server"
  value       = "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${aws_eip.app.public_ip}"
}

output "app_url" {
  description = "Base URL for the API gateway"
  value       = "http://${aws_eip.app.public_ip}"
}
