# Disaster Help Coordination Platform — Phase 1 Plan

## System architecture

- React web client with role-aware routes and accessible responsive UI.
- Node.js/Express REST API with validation, central errors, authentication, authorization, rate limiting, and audit logging.
- PostgreSQL for transactional data; object storage for request images.
- Matching service ranks eligible volunteers and organizations using category, approximate area, availability, and resource stock.
- Notification service writes in-app notifications behind a provider interface that can later support email and SMS.
- Deployment target: CloudFront and S3 for the frontend; ALB, ECS Fargate, and ECR for the API; private RDS PostgreSQL; S3 uploads; CloudWatch observability.

## User flows

1. A resident registers, verifies their account, and creates a privacy-safe help request.
2. The request receives a unique ID, appears at an approximate map location, and enters `OPEN`.
3. Matching recommends eligible organizations and volunteers.
4. An organization accepts the request and assigns one volunteer transactionally.
5. Authorized participants post updates as the request moves through `ACCEPTED`, `VOLUNTEER_ASSIGNED`, `IN_PROGRESS`, and `RESOLVED`.
6. Resource distributions create immutable transactions and reduce available stock without allowing negative balances.
7. Requesters receive in-app notifications and can follow the full timestamped timeline.
8. Reports enter a human review queue; automated signals assist but never make a fraud determination.

## Feature slices

- Public: landing, live situation dashboard, privacy-safe map, request search, disaster-event pages.
- Resident: request creation, request history, status timeline, safe updates, notifications, profile.
- Volunteer: availability, nearby matches, safe claiming, active and completed tasks.
- Organization: triage queue, volunteer assignment, resource inventory and ledger, map and statistics.
- Admin: users, organization verification, reports, events, activity, resources, abuse controls.
- Platform: authentication, uploads, matching, notifications, audit trail, health checks, seed data, tests, Docker, CI/CD, AWS infrastructure documentation.

## Data model

- `users` owns credentials, role, verification, status, and timestamps.
- `profiles`, `volunteers`, and `organizations` hold role-specific details; `organization_members` joins staff to organizations.
- `disaster_events` groups affected areas, requests, and resources.
- `help_requests` stores safe public location separately from protected contact/location fields.
- `request_assignments`, `request_updates`, and `request_status_history` preserve coordination history.
- `resources` stores current quantities; `resource_transactions` is the append-only stock ledger.
- `notifications`, `reports`, and `audit_logs` support user communication, moderation, and accountability.
- Indexed search fields: event, public area, category, urgency, status, created time, and approximate geospatial coordinates.

## API design

- `/api/auth/*`: register, login, refresh, logout, verification, password reset.
- `/api/requests/*`: create, search, details, accept, assign, status, updates, report.
- `/api/volunteers/*`: directory, skills, availability, matches, task history.
- `/api/organizations/*`: verification-aware dashboard, members, assignments, resources.
- `/api/resources/*`: inventory and transactional adjustments.
- `/api/notifications/*`: list and mark read.
- `/api/disasters/*`: public event views and admin lifecycle management.
- `/api/admin/*`: reports, users, organizations, audit activity, platform statistics.
- `/health` and `/ready`: service and dependency health.

## Folder structure

```text
app/                 React routes and UI
components/          Shared product components
lib/                 API client, auth, validation, utilities
server/
  src/controllers/   HTTP request handlers
  src/services/      Coordination, matching, inventory, notifications
  src/routes/        REST route definitions
  src/middleware/    Auth, authorization, validation, errors, rate limits
  src/db/            Schema, migrations, seed data
  tests/             API and service tests
infra/               AWS architecture and deployment definitions
.github/workflows/   Test, build, ECR, and ECS deployment pipeline
```

## Delivery phases

1. Planning and product architecture (this document).
2. Backend foundations and core workflows.
3. Connected multi-role frontend.
4. Map, filtering, and matching.
5. Docker-based local environment.
6. AWS deployment foundation.
7. CI/CD.
8. End-to-end tests, accessibility, security review, and polish.
