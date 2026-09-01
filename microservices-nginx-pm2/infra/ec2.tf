# ── EC2 Instance ──────────────────────────────────────────────────────────────

resource "aws_instance" "app" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  key_name               = var.key_name
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.ec2.id]

  # Runs once on first boot — installs everything and starts services
  user_data = file("${path.module}/user_data.sh")

  # Root block device
  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    delete_on_termination = true
    encrypted             = true

    tags = {
      Name = "${var.project_name}-root-volume"
    }
  }

  tags = {
    Name        = "${var.project_name}-app-server"
    Environment = var.environment
    Project     = var.project_name
  }

  lifecycle {
    # Prevent accidental destruction of the running server
    prevent_destroy = false
  }
}

# ── Elastic IP — stable public address ───────────────────────────────────────

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name        = "${var.project_name}-eip"
    Environment = var.environment
  }

  depends_on = [aws_internet_gateway.main]
}
