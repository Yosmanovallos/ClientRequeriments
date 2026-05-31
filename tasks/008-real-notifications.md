# Task 008 — Real notifications (SMTP + Slack)

**Phase:** 6 · **Status:** ✅ DONE (2026-05-29)

## Result
- `SmtpNotifier.ts` (Adapters/Smtp/) — `nodemailer` transport. Works with Resend, SendGrid, Mailgun, plain SMTP. `secure` auto-selected by port (465 → true, else STARTTLS). `sendChannelMessage` is intentional no-op.
- `SlackNotifier.ts` (Adapters/Slack/) — native fetch POST to webhook URL with `{ "text": message }`. No `@slack/web-api` SDK. `sendEmail` is intentional no-op.
- `CompositeNotifier.ts` (Adapters/Composite/) — routes email→delegate.email, channel→delegate.channel. Either can be null (graceful no-op). Lets you run SMTP-only or Slack-only without a new class.
- `AdapterRegistration::buildNotifier()` extended with `smtp` / `slack` / `composite` cases. `composite` builds both from `SMTP_*` + `SLACK_WEBHOOK_URL` env vars; requires at least one to be configured.
- `nodemailer` + `@types/nodemailer` added to package.json
- `.env.example` updated: `NOTIFY_PROVIDER` options now include `composite`

## Best-effort guarantee (the critical invariant)
The `INotifier` port states: *"implementations MUST NOT throw on transient failure"*.
All three adapters honor this — every transport/HTTP/network error is logged via `console.error('… (non-fatal):')` and swallowed. The `sendEmail` / `sendChannelMessage` methods always resolve void.

This is verified by explicit tests:
- `SmtpNotifier`: nodemailer async-reject → does not throw; nodemailer sync-throw → does not throw
- `SlackNotifier`: fetch reject (network) → does not throw; 4xx response → does not throw; 5xx response → does not throw

## Tests added (19 new)
- 7× SmtpNotifier: constructor validation (host/from), payload shape, empty recipient list, async failure, sync failure, channel no-op
- 7× SlackNotifier: constructor validation, POST payload, empty message, 4xx response, network reject, 5xx response, email no-op
- 5× CompositeNotifier: routes email correctly, routes channel correctly, null email no-ops, null channel no-ops, both-null no-ops

## End-to-end smoke verified
Booted backend with `NOTIFY_PROVIDER=composite` + mocked nodemailer + mocked Slack fetch. Single POST /requests triggered:
1. `nodemailer.sendMail({from: noreply@portal.example, to: yosman.ovallos@..., subject: "Request CBLPBR-630 received — …", html: <…>})`
2. `fetch(https://hooks.slack.com/services/T1/B2/X3, {body: {"text": "📋 New request CBLPBR-630: …"}})`

## Verified counts
- `npm test` → **72 passed** (53 prior + 19 new)
- `tsc --noEmit` → exit 0

## Do
1. Use the `add-adapter` skill twice — once for `SmtpNotifier`, once for `SlackNotifier`
2. **SmtpNotifier**: `backend/src/Platform/Adapters/Smtp/SmtpNotifier.ts`
   - Use `nodemailer` (install as dep) — supports Resend, SendGrid, plain SMTP, etc.
   - Constructor: `{ host, port, user, pass, from }`
   - `sendEmail()` → standard SMTP send
   - `sendChannelMessage()` → no-op or throws (channel is Slack's job)
3. **SlackNotifier**: `backend/src/Platform/Adapters/Slack/SlackNotifier.ts`
   - Use native `fetch` (no SDK), POST to `SLACK_WEBHOOK_URL`
   - `sendChannelMessage(text)` → `{ "text": text }`
   - `sendEmail()` → no-op or throws (email is SMTP's job)
4. **Composite pattern**: since `INotifier` covers both email and channel, add `CompositeNotifier.ts` that delegates: emails → SmtpNotifier, channel → SlackNotifier
5. Update `AdapterRegistration::buildNotifier()`:
   - `local` → LocalNotifier (already there)
   - `smtp` → SmtpNotifier (email only; channel is no-op)
   - `slack` → SlackNotifier (channel only; email is no-op)
   - `composite` → both — new env value
6. **Critical**: notifications are best-effort. Adapters MUST log + swallow errors, never throw. The Service callers don't await failure handling.
7. Add `nodemailer` + `@types/nodemailer` to package.json
8. Tests with mocked nodemailer transport + mocked fetch for Slack
9. Smoke test: boot with `NOTIFY_PROVIDER=composite`, create a request, verify SMTP transport receives email + Slack URL receives POST

## Definition of done
- [ ] `npm test` passes (53 prior + new adapter tests)
- [ ] Boot with `NOTIFY_PROVIDER=smtp` works (uses Ethereal/MailHog for local testing)
- [ ] Failed SMTP/Slack call does NOT fail the request submission (best-effort guarantee)
- [ ] No file in `Modules/` touched

## Context to load
- `backend/src/Platform/Ports/INotifier.ts`
- `backend/src/Platform/Adapters/Local/LocalNotifier.ts`
- `backend/src/Platform/AdapterRegistration.ts` (`buildNotifier`)
- `backend/src/Modules/Requests/RequestsService.ts` (see `createTicketAsync` — already has try/catch around notifier calls)

## Out of scope
- Notification preferences per user (Phase 8)
- Email templates beyond inline HTML (Phase 8)
- Microsoft Graph / Teams adapter (Phase 9)
