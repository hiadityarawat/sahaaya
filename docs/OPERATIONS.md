# Sahaaya operations and incident runbook

Sahaaya coordinates community help but does not replace police, fire, ambulance, or government disaster services. Operators must keep that notice visible and must never present community data as an official emergency dispatch system.

## Service objectives

- Availability target: 99.9% monthly for the authenticated application and APIs.
- API target: 95% of ordinary state reads below 800 ms and writes below 1.5 seconds.
- Active-delivery refresh target: new server state visible within 10–15 seconds while the browser is open.
- Recovery point objective: 24 hours until automated database exports are configured.
- Recovery time objective: 4 hours for a failed deployment or database restore.

## Required production configuration

- `RESEND_API_KEY` (secret): transactional email provider credential.
- `SAHAAYA_EMAIL_FROM`: verified sender, such as `Sahaaya <help@example.org>`.
- `SAHAAYA_PUBLIC_URL`: canonical HTTPS website origin used in account links.
- `SAHAAYA_ROUTING_API_URL` (optional): production-compatible OSRM-style HTTPS routing endpoint. Without it, the UI clearly labels ETA as a straight-line estimate.

Never commit these values to Git. Configure them only in the hosting environment.

## Monitoring

- Check `GET /api/health` every five minutes from an external monitor.
- Alert after two consecutive non-200 responses or sustained latency above two seconds.
- Review Worker error logs for the returned error ID; do not expose stack traces to users.
- Alert on unusual increases in login failures, reports, blocked accounts, upload errors, and delivery-code failures.
- Monitor D1 and R2 usage against plan limits.

## Backup and recovery

1. Export or snapshot D1 before every schema migration and at least daily.
2. Retain daily backups for 30 days and monthly backups for one year, subject to the privacy policy.
3. Keep uploaded-file metadata and R2 objects in the same retention plan.
4. Test a restore into a non-production environment every quarter.
5. After restore, validate login, request ownership, offer acceptance, contact privacy, resource quantities, and delivery confirmation.

## Incident response

1. Confirm the impact using `/api/health` and provider status pages.
2. Preserve logs and note the start time, affected users, actions, and error IDs.
3. Disable only the affected write workflow when possible; keep safety information readable.
4. Roll back the application version for code regressions. Restore data only after confirming database corruption.
5. Notify affected users without exposing private locations, contacts, codes, or credentials.
6. Record the root cause and preventive action after recovery.

## Data lifecycle

- Expired sessions, verification links, reset links, and rate-limit rows are removed opportunistically.
- Ordinary non-admin audit entries older than 180 days are eligible for cleanup.
- Resource listings automatically leave the public feed after expiry.
- Disaster events require an expiry and stop appearing publicly after that time; administrators can still review and delete them.
- Define a legal privacy and deletion policy before collecting production personal data.

## Release checklist

- Run the production build, lint checks, and all workflow tests.
- Inspect every generated migration and confirm a current backup exists.
- Confirm email and routing configuration status through `/api/health`.
- Test registration, verification, recovery, admin recovery, request matching, live tracking, uploads, and delivery confirmation.
- Verify keyboard navigation, 200% zoom, reduced motion, and at least one mobile screen reader.
- Publish, monitor the health endpoint, and retain the previous deployable version for rollback.
