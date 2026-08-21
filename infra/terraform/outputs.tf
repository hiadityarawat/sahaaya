output "api_load_balancer" { value=aws_lb.api.dns_name }
output "ecr_repository" { value=aws_ecr_repository.api.repository_url }
output "uploads_bucket" { value=aws_s3_bucket.uploads.bucket }
output "frontend_bucket" { value=aws_s3_bucket.frontend.bucket }
output "ecs_cluster" { value=aws_ecs_cluster.main.name }
output "ecs_service" { value=aws_ecs_service.api.name }
output "cloudfront_domain" { value=aws_cloudfront_distribution.frontend.domain_name }
