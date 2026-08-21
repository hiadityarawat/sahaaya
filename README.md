# Sahaaya Disaster Response Network

Sahaaya is a privacy-first coordination platform for residents requesting emergency assistance, volunteers, verified relief organizations, and administrators. It replaces scattered calls and social posts with a single operational view of requests, assignments, resources, progress, and disaster events.

## Product highlights

- Fast, accessible emergency request flow with privacy-safe public areas.
- Role workspaces for residents, volunteers, organizations, and administrators.
- Transaction-safe request acceptance and one-active-assignment database constraint.
- Timestamped request lifecycle from `OPEN` to `RESOLVED` or `CANCELLED`.
- Rule-based matching by need, area, skills, availability, verification, and capacity.
- Resource ledger with database checks that prevent negative inventory.
- In-app notifications designed behind an email/SMS-ready boundary.
- Human-reviewed abuse reports; automated flags never make fraud decisions.
- Responsive live situation dashboard with approximate map visualization.

## Technology

React, JavaScript/TypeScript, CSS, Node.js, Express, PostgreSQL, Docker, GitHub Actions, AWS ECS Fargate, ECR, RDS, S3, CloudFront, and CloudWatch.

## Repository map

- `app/` — responsive React product experience.
- `server/src/` — secured Express REST API and matching logic.
- `server/db/` — PostgreSQL migration and fictional seed data.
- `infra/` — AWS architecture decisions.
- `.github/workflows/` — test, container build, ECR push, and ECS deployment.
- `PLANNING.md` — architecture, flows, data model, API design, and phased delivery plan.

## Local development

1. Copy `server/.env.example` to `server/.env` and replace local-only values.
2. Start PostgreSQL and the API with `docker compose up --build`.
3. Install root dependencies and start the web experience with `npm install` and `npm run dev`.
4. Open the web app at `http://localhost:3000`; the API runs at `http://localhost:4000`.

Never use the example database password or JWT secret outside local development.

## API overview

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Register with a hashed password |
| POST | `/api/auth/login` | Authenticate and receive a short-lived token |
| GET/POST | `/api/requests` | Search or create requests |
| GET | `/api/requests/:publicId` | Public-safe details and status history |
| POST | `/api/requests/:publicId/accept` | Transactional responder acceptance |
| PATCH | `/api/requests/:publicId/status` | Authorized lifecycle update |
| GET | `/api/resources` | Public available inventory |
| PATCH | `/api/resources/:id` | Non-negative transactional adjustment |
| GET | `/api/notifications` | Authenticated inbox |
| GET | `/api/disasters` | Disaster event directory |
| GET | `/api/admin/reports` | Protected moderation queue |
| GET | `/health` and `/ready` | Process and dependency health |

## Data and privacy decisions

Protected contact and exact location fields are separate from the public area and approximate coordinates. Public endpoints never select protected columns. Images belong in S3; PostgreSQL stores only the object key. Passwords use bcrypt and tokens expire after two hours. Helmet, explicit CORS, input validation, role checks, rate limits, constrained upload configuration, and central errors provide baseline defense in depth.

Database constraints enforce positive people counts, non-negative stock, unique public IDs, and one active volunteer assignment. Resource and status changes are append-only history records. Admin actions are designed for audit logging.

## Testing

Run `npm test` in `server/` for API health and deterministic matching tests. The CI workflow blocks deployment until tests pass, then builds the API container, pushes it to ECR, and updates ECS using GitHub OIDC rather than long-lived AWS keys.

## AWS deployment

The target architecture and network/security decisions are documented in `infra/AWS_ARCHITECTURE.md`. Production configuration belongs in Secrets Manager and GitHub environment variables. Frontend assets are served from S3 through CloudFront; the private API tier runs on ECS Fargate behind an ALB; RDS PostgreSQL and the upload bucket are private; logs and alarms flow to CloudWatch.

## Future improvements

- Geospatial/PostGIS matching and travel-time routing.
- Multi-language and offline-capable emergency forms.
- Verified SMS/email providers and delivery receipts.
- WebSocket/SSE updates after load testing the simpler notification polling path.
- Infrastructure as code for repeatable multi-environment AWS deployments.
- Formal threat modeling, disaster recovery exercises, and third-party accessibility review.
