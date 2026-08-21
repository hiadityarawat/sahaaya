variable "aws_region" { type=string; default="ap-south-1" }
variable "environment" { type=string; default="production" }
variable "db_username" { type=string; default="sahaaya" }
variable "db_password" { type=string; sensitive=true; validation { condition=length(var.db_password)>=20; error_message="Use a database password of at least 20 characters." } }
variable "jwt_secret" { type=string; sensitive=true; validation { condition=length(var.jwt_secret)>=32; error_message="Use a JWT secret of at least 32 characters." } }
variable "certificate_arn" { type=string; description="ACM certificate for the API hostname" }
variable "cloudfront_certificate_arn" { type=string; description="ACM certificate in us-east-1 for the frontend hostname" }
variable "api_hostname" { type=string; description="Public API hostname, for example api.sahaaya.example" }
variable "frontend_hostname" { type=string; description="Public frontend hostname" }
