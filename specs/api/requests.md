# API Spec — Requests

Base path: `/requests`
Auth: Bearer token (resolved by `IIdentityProvider`; clientId extracted from token claims)

## POST /requests
Create a new request.

**Body**
```json
{
  "requestType": "new_report | new_page | new_feature | fix_issue | view_request",
  "title":       "string (1–255)",
  "priority":    "Highest | High | Medium | Low | Lowest",
  "dueDate":     "ISO 8601 datetime | null",
  "payload":     { "<field>": "<value>" },
  "idempotencyKey": "string (≤64) | null"
}
```

**Success:** `201 Created` — returns `RequestSummary`

**Errors**
- `400 BAD_REQUEST` — invalid requestType or missing title
- `401 UNAUTHORIZED` — missing/invalid token
- `409 CONFLICT` — idempotencyKey collision (rare; returns existing request instead)

**Side effects (non-blocking)**
- Creates a ticket via `ITicketSystem.create()`
- Sends email + channel notification via `INotifier`
- Writes an `outbox_event` row (Phase 3: the outbox worker picks this up)

## GET /requests
List all requests for the authenticated client.

**Query params:** `?status=IN+REVIEW`
**Success:** `200 OK` — `{ data: RequestSummary[], count: number }`

## GET /requests/:id
Get a single request with full status history.

**Success:** `200 OK` — `RequestSummary & { history: StatusHistoryEntry[] }`
**Errors:** `404 NOT_FOUND`, `403 FORBIDDEN` (different client)

## POST /requests/:id/comments
Add a public comment to a request.

**Body:** `{ "body": "string (1–10000)" }`
**Success:** `201 Created` — returns `Comment`
**Side effect:** mirrors comment to the external ticket via `ITicketSystem.addComment()`

## GET /requests/:id/comments
List public comments on a request.
**Success:** `200 OK` — `{ data: Comment[] }`
