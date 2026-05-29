# Remote state with S3-compatible backend + DynamoDB locking.
#
# Consolidated from infra/terraform/backend.tf (audit finding F2).
# This is the single source of truth for Terraform state storage.
#
# The bucket and lock table must be provisioned before `terraform init`:
#   aws s3api create-bucket --bucket groupsmix-tfstate --region us-east-1
#   aws dynamodb create-table --table-name groupsmix-tflock \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST
#
# Consider migrating to Cloudflare R2 (S3-compatible) to reduce the
# number of cloud providers in the stack (audit finding F3).
terraform {
  backend "s3" {
    bucket         = "groupsmix-tfstate"
    key            = "affilite-mix/prod.tfstate"
    region         = "us-east-1"
    dynamodb_table = "groupsmix-tflock"
    encrypt        = true
  }
}
