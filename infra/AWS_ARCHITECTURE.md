# AWS deployment architecture

```text
Residents / volunteers / organizations / admins
                        |
                 Route 53 + WAF
                        |
                   CloudFront
                 /            \
        S3 React assets       ALB (HTTPS)
                                  |
                         ECS Fargate service
                          /       |        \
               RDS PostgreSQL  S3 uploads  CloudWatch
                  (private)     (private)   logs/alarms
                                  |
                           presigned uploads
```

- Public subnets contain only the load balancer and NAT gateways; ECS tasks and RDS run in private subnets.
- RDS accepts PostgreSQL traffic only from the ECS task security group.
- S3 blocks public access. CloudFront uses origin access control for frontend assets; uploads use short-lived presigned URLs.
- ECS task and deployment roles follow least privilege. Secrets live in Secrets Manager, never task definitions or source.
- CloudWatch alarms cover API 5xx rate, ALB target response time, unhealthy tasks, CPU, memory, and RDS capacity.
- WAF, ALB rate controls, application rate limits, audit logs, backups, and multi-AZ RDS provide layered resilience.
