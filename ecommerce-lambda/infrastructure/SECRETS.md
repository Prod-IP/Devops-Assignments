# SSM Parameter Store layout
#
# Prefix: /ecommerce/{env}/
#
# | Parameter              | Type   | Source                          |
# |------------------------|--------|---------------------------------|
# | users_table            | String | DynamoDB module                 |
# | products_table         | String | DynamoDB module                 |
# | cart_table             | String | DynamoDB module                 |
# | orders_table           | String | DynamoDB module                 |
# | idempotency_table      | String | DynamoDB module                 |
# | cognito_user_pool_id   | String | Cognito module                  |
# | cognito_client_id      | String | Cognito module                  |
# | event_bus_name         | String | EventBridge module              |
# | product_images_bucket  | String | S3 module                       |
# | ses_from_email         | String | tfvars                          |
#
# Optional SecureString (create manually / via Secrets Manager rotation):
#   /ecommerce/{env}/ses_smtp_password
#
# Lambda env vars are wired from Terraform module outputs (same values as SSM)
# so cold paths do not need an extra SSM round-trip. SSM remains the source of
# truth for operators and non-Lambda consumers.
#
# Local (.env.local):
#   AWS_ENDPOINT_URL=http://localhost:4566
#   USERS_TABLE=ecommerce-users-local
#   ... (see .env.example)
