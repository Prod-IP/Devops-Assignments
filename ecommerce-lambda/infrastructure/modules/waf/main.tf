variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "api_arn" { type = string }
variable "enabled" {
  type    = bool
  default = true
}

resource "aws_wafv2_web_acl" "this" {
  count = var.enabled ? 1 : 0

  name  = "${var.name_prefix}-waf-${var.environment}"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "BadInputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-waf"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "api" {
  count        = var.enabled ? 1 : 0
  resource_arn = var.api_arn
  web_acl_arn  = aws_wafv2_web_acl.this[0].arn
}

output "web_acl_arn" {
  value = try(aws_wafv2_web_acl.this[0].arn, null)
}
