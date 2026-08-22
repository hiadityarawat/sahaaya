# Sahaaya — Community Help & Disaster Response Network

Sahaaya is a multi-user community assistance platform for coordinating urgent help during disasters and everyday emergencies. A signed-in user can request food, water, medicine, shelter, rescue, clothing, transportation, or another essential service. Other community members can offer support, the requester selects exactly one helper, and both users can coordinate privately through live location tracking and a delivery confirmation code.

**Live application:** [sahaaya-disaster-response.hi-aditya-rawat.chatgpt.site](https://sahaaya-disaster-response.hi-aditya-rawat.chatgpt.site/)

> Sahaaya supports community coordination; it is not a replacement for police, fire, ambulance, or other official emergency services. In a life-threatening emergency, contact the appropriate local authority first.

## Table of contents

- [Core features](#core-features)
- [How the workflow works](#how-the-workflow-works)
- [Privacy and safety](#privacy-and-safety)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
- [Environment and storage](#environment-and-storage)
- [API routes](#api-routes)
- [Database model](#database-model)
- [Testing and quality checks](#testing-and-quality-checks)
- [Deployment](#deployment)
- [Optional Express and PostgreSQL service](#optional-express-and-postgresql-service)
- [AWS infrastructure foundation](#aws-infrastructure-foundation)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)

## Core features

### Community requests

- User-generated requests only; the production feed does not create fictional requests.
- Categories for food, water, medical help, shelter, rescue, clothing, transport, and other needs.
- Normal, urgent, and critical priority levels.
- Number of people needing help, a short description, an approximate public area, and an optional image.
- Current device location captured only after the user grants permission while submitting.
- Search and filtering by category, status, description, request ID, and area.
- Critical requests are prioritized in the active queue.

### Help offers and matching

- Any signed-in community member can offer help on an open request.
- Helpers describe what they can provide before sharing contact information.
- The requester reviews offers and accepts one helper.
- Server-side conditional updates guarantee that only one helper can be accepted.
- All remaining pending offers are closed when a helper is selected.
- A user cannot offer help on their own request.

### Private coordination

- Contact information is hidden until the requester accepts a helper.
- After matching, only the requester and accepted helper can see each other's contact information.
- The requester's exact coordinates are hidden from unrelated users.
- The helper can voluntarily share a live journey location.
- The requester sees the helper's position, route, last update, and approximate arrival time.
- Maps use Leaflet with OpenStreetMap tiles.

### Delivery confirmation

- The accepted helper generates a six-digit, one-time code only when delivery is ready.
- The readable code is returned once and only a SHA-256 hash is stored.
- Codes expire after 45 minutes, are rate-limited, and lock after repeated incorrect attempts.
- The helper gives the code to the requester after arriving and completing the handoff.
- Only the original requester's account can enter the code.
- A correct code resolves the request and removes it from the active feed.
- Directly marking a matched request as resolved is blocked; confirmation must use the code.

### Real community resources

- The production database contains no generated resource quantities, organizations, or disaster events.
- Signed-in members list only supplies they genuinely have available, including quantity, unit, and a general pickup area.
- Every resource shows the posting member and its latest update time.
- Only the posting member can change or remove a resource listing.
- Quantity changes use a non-negative ledger and zero-stock listings disappear from other users.

### Request control

- The requester can cancel an open request while no helper is accepted.
- The requester can permanently delete their own unclaimed request.
- Deleting a request also removes its offers, timeline updates, reports, and uploaded image.
- Completed and cancelled requests disappear from the public active network.
- Participants retain a private completed/cancelled history.

### Accounts and notifications

- Public landing page with secure sign-in.
- Independent user identity across phones, tablets, and computers.
- Clearly visible logout controls in the header, sidebar, and profile.
- Personal notification inbox for new offers, accepted offers, progress, and delivery confirmation.
- Adaptive refresh pauses in background or offline tabs and reconnects automatically.
- Unsubmitted request text is retained only in the current browser tab.

## How the workflow works

```text
Requester signs in
        │
        ▼
Creates a request + grants location permission
        │
        ▼
Request appears in the active community feed
        │
        ├── Requester may cancel/delete while unclaimed
        │
        ▼
Community members submit help offers
        │
        ▼
Requester accepts exactly one helper
        │
        ├── Other offers close
        ├── Private contact details unlock
        └── No readable delivery code is stored
        │
        ▼
Helper optionally shares live journey location + ETA
        │
        ▼
Helper arrives, generates a short-lived code, and tells requester
        │
        ▼
Requester enters code → delivery confirmed → request resolved
```

## Privacy and safety

Sahaaya follows a privacy-by-default design:

- Authentication is verified on the server for every protected action.
- Anonymous visitors can view the public landing page but cannot create requests or offers.
- Public request results expose an approximate area and reduced-precision coordinates.
- Exact coordinates, live helper coordinates, contact information, and delivery codes are authorization-filtered server-side.
- Delivery codes are never sent to unrelated users or the requester through the state API.
- Stored delivery confirmation values are one-way hashes with expiration and attempt limits.
- Creation, offers, reports, uploads, tracking, resources, and code operations are rate-limited per user.
- Request ownership is checked before cancellation, deletion, or delivery confirmation.
- Helper identity is checked before live-location updates.
- Request acceptance uses `status = 'OPEN' AND accepted_by IS NULL` to prevent double acceptance under concurrent requests.
- Uploaded files are restricted to JPG, PNG, and WebP images up to 5 MB.
- Upload ownership is checked before storage, file signatures are verified, and failed uploads are removed.
- Prepared SQL statements are used for application queries.
- Versioned migrations, reference-validation triggers, cascade cleanup, and query indexes protect data integrity.
- Resource quantities are user-posted and have database and application checks preventing negative inventory.
- Reports are designed for human review rather than automated fraud decisions.

## Technology stack

### Deployed Sites application

- React 19 and TypeScript
- Vinext / Vite
- Cloudflare Workers-compatible server rendering
- Cloudflare D1 (SQLite) for durable application records
- Cloudflare R2 for request image uploads
- Leaflet 1.9 with OpenStreetMap tiles
- CSS responsive design
- ChatGPT/Sites sign-in identity headers

### Included production-service foundation

- Node.js and Express
- PostgreSQL 17
- JSON Web Tokens and bcrypt
- Docker and Docker Compose
- AWS ECS Fargate, ECR, RDS, S3, CloudFront, ALB, CloudWatch, IAM, and Secrets Manager
- Terraform
- GitHub Actions

## Architecture

The deployed application uses a server-rendered React worker with protected API routes:

```text
Browser / mobile device
        │
        ├── Public landing page
        └── Authenticated community workspace
                    │
                    ▼
            Vinext React worker
              ├── /api/state
              ├── /api/actions
              └── /api/uploads
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   Cloudflare D1         Cloudflare R2
  users, requests,       request images
  offers, timelines,
  notifications, codes
```

The repository also contains a separate Express/PostgreSQL API and an AWS/Terraform foundation for teams that want to operate the platform in their own cloud account.

## Repository structure

```text
sahaaya/
├── app/                       # React pages, community workspace, and Sites API routes
│   ├── api/actions/           # Protected request/offer/tracking actions
│   ├── api/state/             # Authorization-filtered application state
│   ├── api/uploads/           # Protected R2 image uploads
│   ├── Landing.tsx            # Public entry page
│   ├── LiveHelpMap.tsx        # Leaflet/OpenStreetMap map component
│   └── Platform.tsx           # Authenticated multi-user experience
├── db/                        # Drizzle D1 schema
├── drizzle/                   # Versioned D1/SQLite migrations
├── lib/site-db.ts             # D1 initialization, identity, and seed reference data
├── server/                    # Optional Express/PostgreSQL service
│   ├── db/                    # PostgreSQL migrations and demo seeds
│   ├── src/                   # API, matching, and authorization policies
│   └── test/                  # Service and policy tests
├── infra/
│   ├── AWS_ARCHITECTURE.md    # AWS architecture and security decisions
│   └── terraform/             # AWS infrastructure as code
├── tests/                     # Deployed-app rendering and safeguard checks
├── .github/workflows/         # CI/CD workflow foundation
├── docker-compose.yml         # Local PostgreSQL + Express stack
└── PLANNING.md                # Product, API, data, and delivery planning
```

## Getting started

### Prerequisites

- Node.js 22.13 or newer
- npm
- Git
- Docker Desktop (only for the optional PostgreSQL/Express service)

### Install the web application

```bash
git clone https://github.com/hiadityarawat/sahaaya.git
cd sahaaya
npm install
```

### Run locally

```bash
npm run dev
```

Open the local URL printed in the terminal, normally `http://localhost:3000`.

The public landing page works locally. The production identity flow is provided by Sites, so authenticated multi-user actions are best exercised through the deployed application. Local D1 and R2 resources are created by the development runtime and must never be treated as production data.

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Run web safeguards

```bash
node --test tests/rendered-html.test.mjs
```

## Environment and storage

The deployed Sites application declares logical storage bindings in `.openai/hosting.json`:

- `DB` — D1 database binding
- `UPLOADS` — R2 object-storage binding

Sites provisions and wires the hosted resources. Do not put credentials or secrets in `.openai/hosting.json`.

The optional Express API uses `server/.env`. Create it from the safe template:

```bash
cp server/.env.example server/.env
```

Important variables include:

| Variable | Purpose |
| --- | --- |
| `PORT` | Express API port |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign API tokens |
| `CORS_ORIGIN` | Allowed frontend origin |
| `AWS_REGION` | AWS deployment region |
| `UPLOAD_BUCKET` | S3 upload bucket |

Never reuse example passwords or JWT secrets outside local development. Environment files are ignored by Git.

## API routes

### Deployed Sites routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/state` | Return user-authorized requests, offers, contacts, tracking, history, and notifications |
| `POST` | `/api/actions` | Create/cancel/delete requests, offer help, accept a helper, track delivery, confirm delivery, and update notifications |
| `POST` | `/api/uploads` | Upload an authorized request image to R2 |
| `GET` | `/api/health` | Check application and D1 readiness |

`/api/actions` uses an `action` field. Important actions include:

- `create_request`
- `offer_help`
- `accept_offer`
- `generate_delivery_code`
- `cancel_request`
- `delete_request`
- `update_delivery_location`
- `confirm_delivery`
- `update_status`
- `read_notifications`
- `add_resource`, `adjust_resource`, and `delete_resource`

All protected routes reject anonymous requests and repeat ownership/participant checks on the server.

### Optional Express routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account with a hashed password |
| `POST` | `/api/auth/login` | Authenticate and issue tokens |
| `POST` | `/api/auth/refresh` | Rotate an authenticated session |
| `POST` | `/api/auth/logout` | Revoke a refresh token |
| `GET/POST` | `/api/requests` | Search or create help requests |
| `GET` | `/api/requests/:publicId` | Return a privacy-safe request projection |
| `POST` | `/api/requests/:publicId/accept` | Transactionally accept a request |
| `PATCH` | `/api/requests/:publicId/status` | Apply an authorized lifecycle transition |
| `GET` | `/api/resources` | List available inventory |
| `PATCH` | `/api/resources/:id` | Apply a non-negative stock adjustment |
| `GET` | `/api/notifications` | Return the signed-in user's inbox |
| `GET` | `/api/disasters` | List disaster events |
| `GET` | `/api/admin/reports` | Return the protected moderation queue |
| `GET` | `/health` | Process health check |
| `GET` | `/ready` | Dependency readiness check |

## Database model

The deployed D1 schema includes:

- `users` — stable signed-in identities and roles
- `disaster_events` — active and historical response events
- `help_requests` — needs, ownership, status, location, accepted helper, ETA, and delivery confirmation
- `help_offers` — helper messages with pending/accepted/declined status
- `request_updates` — timestamped request timeline
- `notifications` — user-specific activity inbox
- `volunteers` — optional skills, areas, availability, and completion totals
- `organizations` — relief partners and verification status
- `resources` and `resource_transactions` — non-negative inventory and its ledger
- `reports` — community concerns and human review status
- `audit_logs` — protected operational actions
- `rate_limits` — per-user abuse and traffic controls
- `uploaded_files` — R2 ownership and cleanup metadata

Migrations are stored in `drizzle/` and must remain committed with schema changes.

## Testing and quality checks

### Web application

```bash
npm run build
npm test
npm run lint
```

The safeguard tests verify that:

- The production worker renders the Sahaaya entry experience.
- Form values are captured before awaiting mobile location permission.
- Contact and tracking privacy rules remain present.
- Single-helper acceptance uses an atomic conditional update.
- Delivery confirmation is requester-only.
- Delivery codes are removed from unauthorized state responses.
- Real multi-user workflows enforce ownership, single-helper locking, hashed codes, upload ownership, and resource ownership against an isolated D1 database.
- Ordinary users are denied privileged event, organization, moderation, and volunteer-assignment actions.

Operational monitoring, backup, restoration, retention, and incident procedures are documented in [OPERATIONS.md](OPERATIONS.md).

### Express service

```bash
cd server
npm install
npm test
```

The service suite covers health, deterministic responder matching, lifecycle transitions, participant permissions, resource permissions, and privacy-safe public projections.

## Deployment

The live web application is deployed with Sites. A production release includes:

1. A successful Vinext build.
2. The exact committed source revision.
3. `.openai/hosting.json`.
4. All D1 migrations under `drizzle/`.
5. The generated Cloudflare Workers-compatible server bundle.

The public site allows anyone with the URL to view the landing page. A user must sign in before accessing the community workspace or performing protected actions.

## Optional Express and PostgreSQL service

Start the API and PostgreSQL locally:

```bash
docker compose up --build
```

Default local endpoints:

- Web application: `http://localhost:3000`
- Express API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`

The Docker Compose credentials are local-development examples only.

## AWS infrastructure foundation

`infra/terraform/` contains a production-oriented AWS foundation with:

- A VPC with public and private subnets
- NAT and routing
- Application Load Balancer
- ECS Fargate service and autoscaling
- ECR container repository
- Private RDS PostgreSQL with deletion protection
- Private S3 buckets
- CloudFront with Origin Access Control
- IAM roles and Secrets Manager integration
- CloudWatch logs and alarms

Review `infra/AWS_ARCHITECTURE.md` before use. Creating AWS resources may incur charges. Supply real domains, ACM certificates, alert destinations, secrets, backup policy, and account-specific values before applying Terraform.

## Known limitations

- Live tracking depends on device GPS permission, HTTPS, connectivity, and the browser remaining able to send updates.
- ETA is an approximation based on straight-line distance and an assumed local travel speed; it is not turn-by-turn routing.
- OpenStreetMap tile availability depends on the user's network.
- In-app polling is used instead of WebSockets for a simpler and more resilient first production version.
- The deployed Sites application and the optional Express/PostgreSQL service are separate runtime paths; the live UI currently uses D1 and R2.
- Email and SMS delivery providers are not configured; signed-in contact sharing and in-app notifications are the current communication paths.
- Formal third-party security testing, load testing, and accessibility certification should be completed before high-scale emergency use.

## Contributing

1. Fork the repository.
2. Create a focused branch: `git checkout -b feature/short-description`.
3. Make the change and add tests for protected workflows.
4. Run the build, web safeguards, lint, and service tests.
5. Open a pull request describing behavior, security implications, and validation performed.

When changing requests, offers, identity, location, contact data, uploads, or delivery confirmation, keep authorization checks server-side and update the associated migration and safeguard tests.

## Project status

Sahaaya is an actively developed demonstration and foundation for privacy-conscious community response coordination. It is suitable for evaluation and continued engineering, but organizations should complete operational governance, moderation staffing, incident-response planning, legal review, security review, and disaster-recovery exercises before relying on it for critical public safety operations.
