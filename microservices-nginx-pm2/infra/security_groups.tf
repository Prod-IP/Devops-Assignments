# ── EC2 Security Group ────────────────────────────────────────────────────────
#
# Inbound:  22 (SSH from your IP), 80 (HTTP), 443 (HTTPS)
# Outbound: all (needed for apt, npm, Let's Encrypt)
#
# Ports 3001/3002/3003 are intentionally NOT opened — they are
# internal only, reached via Nginx on port 80/443.

resource "aws_security_group" "ec2" {
  name        = "${var.project_name}-ec2-sg"
  description = "Security group for microservices EC2 instance"
  vpc_id      = aws_vpc.main.id

  # SSH — restricted to your IP
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  # HTTP — public
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS — public (for Let's Encrypt bonus)
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound — all traffic allowed
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-ec2-sg"
    Environment = var.environment
    Project     = var.project_name
  }
}
