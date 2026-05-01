# OF-36: remote state with locking. Fill once an S3/R2+DDB pair exists.
terraform {
  backend "s3" {
    bucket         = "groupsmix-tfstate"
    key            = "affilite-mix/prod.tfstate"
    region         = "us-east-1"
    dynamodb_table = "groupsmix-tflock"
    encrypt        = true
  }
}
