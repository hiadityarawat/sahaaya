# Sahaaya operations and recovery

This runbook covers the deployed Sites application, its D1 database, and its R2 upload bucket. It is intended for the person responsible for operating Sahaaya, not end users.

## Readiness and monitoring

- Monitor GET /api/health from an external uptime service at least once per minute.
- Treat HTTP 200 with status `ok` as healthy and HTTP 503 as an incident.
- Alert when two consecutive checks fail or when response time exceeds five seconds.
- Application failures include an `errorId`. Search platform logs for that value before investigating an individual report.
- Review authentication failures, rate-limit responses, repeated code failures, upload failures, and administrative audit events daily.

## Backup policy

- Export the D1 database every day and retain daily copies for 30 days.
- Retain one monthly database export for 12 months.
- Enable object versioning or a second protected copy for R2 uploads when the hosting plan supports it.
- Encrypt backup exports, restrict them to the smallest operations group, and never place them in the Git repository.
- Test restoration into an isolated non-production project every month.

## Restore procedure

1. Disable new write traffic or place the service in maintenance mode.
2. Record the incident time and the most recent known-good database backup.
3. Restore D1 into an isolated project first and run the application workflow tests.
4. Confirm request ownership, accepted-helper locks, location privacy, delivery-code state, resources, and audit logs.
5. Restore or re-link R2 objects referenced by `uploaded_files`.
6. Promote the verified database, re-enable traffic, and monitor /api/health.
7. Record recovery point and recovery time, then complete a post-incident review.

Target recovery objectives:

- Recovery point objective: 24 hours or less.
- Recovery time objective: 2 hours or less.

## Data retention

- Clear live helper coordinates immediately when a delivery is completed.
- Remove expired delivery-code hashes during routine maintenance.
- Remove rate-limit records older than 24 hours.
- Remove orphaned R2 objects that have no `uploaded_files` record.
- Establish a documented retention period for completed requests, contact data, audit logs, and reports before inviting public emergency use.

## Incident priorities

1. Exposure of exact location or contact data.
2. Unauthorized helper acceptance or administrative action.
3. Incorrect delivery confirmation.
4. Database unavailability or data loss.
5. Map, notification, or upload degradation.

For a suspected privacy or authorization incident, stop the affected workflow, preserve audit evidence, rotate any compromised credentials, notify affected users through an approved channel, and complete the legally required notification process for the operating jurisdiction.

## Release checklist

- All web tests and service tests pass.
- Lint and production build pass.
- New D1 migrations are reviewed and included.
- No fictional requests, events, organizations, or resource quantities are seeded into production.
- Authorization changes have negative tests for ordinary users.
- A rollback point and recent backup exist.
- The health endpoint and external alert are operational.
- The release is verified using at least two different signed-in user accounts.
