# Organization Management — Design Spec

**Status:** Ready for review — not yet implemented  
**Proposed phase:** 8e (after enhanced-comments 8d; before Phase 9 / Microsoft migration)  
**Estimated tasks:** 3 task files (021-a backend, 021-b frontend, 021-c visibility integration + tests)

> **Terminology note:** In this codebase, `Client` is the tenant root. `Organization` is a project-level grouping that controls ticket visibility. This differs from industry norms where "org" often means "tenant" — keep this distinction in mind when reading.

---

## 1. Current Architecture Analysis

### Existing hierarchy

```
Client (tenant root)
└── Project
    ├── ProjectMember  (who has access to the project)
    ├── FormTemplate   (request forms enabled per project)
    └── Request        (tickets scoped to project)
        ├── Comment
        └── Attachment
```

### Current visibility model

Visibility is controlled **entirely at the project level**:

| Role | Can see |
|------|---------|
| SUPER_ADMIN | All requests across all clients |
| ADMIN | All requests in their tenant |
| AGENT | Requests in projects where they are a `ProjectMember` (strict project scope) |
| CLIENT | Only requests they created, filtered to their member projects |

The filter in `RequestsRepository.list()` uses `req.user.projectIds` (populated by auth middleware from `ProjectMember` rows). No sub-project visibility layer exists today.

### What is missing

- No sub-project grouping of users
- No organization-level ticket ownership
- No "I'm in Org A, therefore I see all Org A tickets" capability
- No org dropdown on ticket creation
- No organization management UI in projects

---

## 2. Target Architecture

### New hierarchy

```
Client (tenant root)
└── Project
    ├── ProjectMember          (gate: who can access this project at all)
    ├── Organization           (NEW — visibility group inside a project)
    │   └── OrganizationMember (NEW — who belongs to this org)
    └── Request
        └── organizationId FK  (NEW — which org owns this ticket)
```

**Critical design rule:** Organizations are **project-scoped**, not tenant-scoped. A project owns its organizations. Two different projects can each have an "Engineering Org" — they are unrelated rows. `Organization.projectId` is always non-null. There is no `Organization.clientId` direct parent; the tenant chain is `Organization → Project → Client`.

---

## 3. Visibility Rules (Definitive)

### Scenario 1 — User has no org membership

User is a `ProjectMember` of Project X but belongs to no Organization within it.

**Result:** User sees only tickets they created (`request.createdBy = req.user.email`).

### Scenario 2 — User belongs to Organization A

User is a member of Org A (which is inside Project X).

**Result:** User sees all tickets where `request.organizationId = Org A's id`.  
User does **not** see tickets belonging to Org B or tickets created by other users with no org.

### Scenario 3 — Admin (RBAC bypass — recommended approach)

**Recommendation:** ADMIN bypasses the org filter entirely, matching existing behavior where `requireProjectAccess()` always passes for ADMIN in the same tenant.

**Rationale:** Admin today can see all projects in their tenant without being a `ProjectMember`. Requiring Admin to also be an `OrganizationMember` would break existing Admin-of-tenant assumptions and create an inconsistency. The permission boundary for Admin is the `clientId`, not org membership.

**Alternative (stricter):** Admin must be an `OrganizationMember` to see org tickets. More granular but breaks current semantics.

> **Open question for client:** Confirm the recommended Admin bypass approach. If Admin-scoped-to-org is required, this adds `OrganizationMember` rows for all Admin users to the provisioning flow.

### Scenario 4 — AGENT

Recommendation: AGENT follows the same org-visibility filter as CLIENT. An AGENT sees tickets in orgs they belong to, plus tickets they personally created.

> **Open question for client:** Should an AGENT see **all** orgs in their assigned projects (i.e., full project-level visibility like today), or only orgs they're members of? The current AGENT behavior is "all requests in all assigned projects" — adding org filtering is a **breaking change** to their current visibility. Confirm before implementing.

### Combined visibility query shape

For any non-admin user listing requests:

```
request.projectId IN user.projectIds
AND (
  request.organizationId IN user.organizationIds
  OR request.createdBy = user.email
  OR request.organizationId IS NULL AND request.createdBy = user.email  -- legacy tickets
)
```

For SUPER_ADMIN and ADMIN (same tenant): no org filter, existing behavior preserved.

---

## 4. Open Questions (Needs Client Confirmation)

1. **Admin visibility (Scenario 3):** Bypass org filter (recommended), or require org membership?
2. **Agent visibility (Scenario 4):** Keep current full-project visibility, or apply org filter?
3. **Org deletion with existing tickets:** Soft-delete (archive) recommended, matching `Project.archive()` pattern. Block hard-delete if org has tickets?
4. **Ticket org reassignment:** Immutable after creation (recommended), or editable by Admin?
5. **Multi-org membership:** Can a user belong to multiple orgs in the same project? Implied yes by the visibility rules — confirm.
6. **Org-less ticket creation:** If a project has no organizations yet, is the org field hidden or shown as empty/optional? Recommendation: field is hidden/optional when no orgs exist (to preserve backwards compatibility).

---

## 5. Security Impact Assessment

### Existing attack surfaces affected

| Surface | Current | After org feature |
|---------|---------|------------------|
| Request list endpoint | Filtered by `projectIds` | Filtered by `projectIds + organizationIds` — additional filter, never removes existing check |
| Request detail endpoint | Project access check | Project access + org ownership check |
| Org membership manipulation | N/A | New `POST/DELETE /organizations/:id/members` — must require ADMIN, validate `clientId` tenant match |
| Cross-tenant org access | N/A | `Organization.clientId` denormalized — always validated in repo `findById(id, clientId)` |

### New threats

- **Privilege escalation via org creation:** An ADMIN could create an org in another tenant's project if `clientId` validation is missing. Mitigation: `ProjectsRepository.findById` already enforces `clientId`; org creation goes through the same project-access check first.
- **Visibility bypass via crafted `organizationId` on create:** A user could POST a ticket with an `organizationId` belonging to a different project. Mitigation: service validates `organization.projectId === request.projectId` before saving.
- **Org member enumeration:** `GET /projects/:id/organizations/:orgId/members` must require ADMIN or org membership. Regular users should not enumerate members of orgs they don't belong to.
- **AGENT sees cross-org tickets:** If AGENT doesn't receive org filter, the org feature is silently bypassed. Mitigation: visibility query must include AGENT in the filtered path.

---

## 6. RBAC Integration Strategy

### New permissions

Add to `backend/src/Modules/IAM/Role.ts`:

```typescript
'organizations.create'         → minimum role: ADMIN
'organizations.update'         → minimum role: ADMIN
'organizations.delete'         → minimum role: SUPER_ADMIN   // tighter than projects.archive
'organizations.read'           → minimum role: CLIENT
'organizations.list'           → minimum role: CLIENT
'organizations.members.add'    → minimum role: ADMIN
'organizations.members.remove' → minimum role: ADMIN
```

Note: `organizations.delete` is SUPER_ADMIN-only per spec. This is intentionally tighter than `projects.archive` (ADMIN). Flag this asymmetry in code comments.

### New access guard

Add to `backend/src/Shared/auth.ts`:

```typescript
function requireOrganizationAccess(
  user: UserIdentity,
  orgClientId: string,
  orgProjectId: string
): void
```

Rules:
- SUPER_ADMIN → always passes
- ADMIN with matching `clientId` → always passes (org bypass)
- AGENT/CLIENT → must have `organizationId` in `user.organizationIds`
- Throws `403 Forbidden` otherwise

### Auth middleware enrichment

Extend the auth enrichment pipeline to load `organizationIds`:

```typescript
// After loading projectIds from ProjectMember table:
const organizationIds = await userRepo.listOrgIdsForUser(userId);
req.user = { ...base, projectIds, organizationIds };
```

Adds one query per authenticated request. This query must be indexed: `(user_id)` on `organization_members`.

### `UserIdentity` update

```typescript
interface UserIdentity {
  // ...existing fields...
  organizationIds: string[];   // NEW — org IDs user belongs to (all projects)
}
```

---

## 7. Database Design

### New tables

```prisma
// backend/prisma/schema.prisma

model Organization {
  id          String   @id @default(uuid()) @db.Uuid
  projectId   String   @map("project_id") @db.Uuid
  clientId    String   @map("client_id") @db.Uuid       // denormalized for tenant guard
  name        String   @db.VarChar(128)
  slug        String   @db.VarChar(64)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  project  Project              @relation(fields: [projectId], references: [id])
  client   Client               @relation(fields: [clientId], references: [id])
  members  OrganizationMember[]
  requests Request[]

  @@unique([projectId, slug])
  @@map("organizations")
}

model OrganizationMember {
  id             String       @id @default(uuid()) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  userId         String       @map("user_id") @db.Uuid
  createdAt      DateTime     @default(now()) @map("created_at")

  organization Organization @relation(fields: [organizationId], references: [id])
  user         PortalUser   @relation(fields: [userId], references: [id])

  @@unique([organizationId, userId])
  @@map("organization_members")
}
```

### Updated `Request` model

```prisma
model Request {
  // ...all existing fields unchanged...
  organizationId String? @map("organization_id") @db.Uuid  // NEW — nullable for legacy rows

  organization Organization? @relation(fields: [organizationId], references: [id])
}
```

Nullable: legacy tickets (created before this feature) keep `organizationId = NULL`. Visibility logic treats `NULL` as "visible to creator only."

New tickets require `organizationId` **only when** the project has at least one organization. When a project has no organizations, the field is omitted/optional.

### Migration: `0003_organizations`

```sql
-- organizations table
CREATE TABLE organizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id),
  client_id    UUID NOT NULL REFERENCES clients(id),
  name         VARCHAR(128) NOT NULL,
  slug         VARCHAR(64) NOT NULL,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, slug)
);

-- organization_members table
CREATE TABLE organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES portal_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- add organizationId to requests (nullable for legacy)
ALTER TABLE requests ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- indexes
CREATE INDEX idx_organizations_project_id   ON organizations(project_id);
CREATE INDEX idx_org_members_user_id        ON organization_members(user_id);
CREATE INDEX idx_requests_organization_id   ON requests(organization_id);
```

All changes are additive. No existing data modified. Safe for zero-downtime deploy.

### SQL Server compatibility (Phase 9)

- All types use portable equivalents (`UUID`, `TEXT`, `VARCHAR`, `BOOLEAN`, `TIMESTAMPTZ`)
- No Postgres-only constructs (no `gen_random_uuid()` in application code — Prisma uses `@default(uuid())`)
- `description TEXT` maps to `nvarchar(max)` in SQL Server via Prisma's `@db.Text`

---

## 8. API Changes

### New endpoints — Organization CRUD

```
POST   /projects/:projectId/organizations
  → requirePermission('organizations.create') + requireProjectAccess
  → Body: { name, slug?, description? }
  → Returns: Organization (201)

GET    /projects/:projectId/organizations
  → requirePermission('organizations.list') + requireProjectAccess
  → ADMIN+ → all orgs in project; CLIENT/AGENT → only orgs they belong to
  → Returns: { data: Organization[]; count: number }

GET    /projects/:projectId/organizations/:orgId
  → requirePermission('organizations.read') + requireOrganizationAccess
  → Returns: Organization with member count

PATCH  /projects/:projectId/organizations/:orgId
  → requirePermission('organizations.update') + requireOrganizationAccess
  → Body: { name?, description?, isActive? }
  → Returns: Organization

DELETE /projects/:projectId/organizations/:orgId
  → requirePermission('organizations.delete')  ← SUPER_ADMIN only
  → Soft-delete (sets isActive=false, does NOT delete rows)
  → Reject with 409 if org has active requests and caller wants hard-delete
  → Returns: 204

GET    /projects/:projectId/organizations/:orgId/members
  → requirePermission('organizations.members.add') + requireProjectAccess
  → Returns: { data: PortalUser[]; count: number }

POST   /projects/:projectId/organizations/:orgId/members
  → requirePermission('organizations.members.add') + requireProjectAccess
  → Body: { userId }
  → Validates userId is a ProjectMember first (can't add to org if not in project)
  → Idempotent upsert
  → Returns: 201

DELETE /projects/:projectId/organizations/:orgId/members/:userId
  → requirePermission('organizations.members.remove') + requireProjectAccess
  → Returns: 204
```

### Updated `POST /requests` — organization field

Add `organizationId` to the request body:

```typescript
// Zod schema change
{
  // ...existing fields...
  organizationId: z.string().uuid().optional()
}
```

**Service validation:**
1. If project has ≥1 active organization → `organizationId` is required (reject 400 if absent)
2. If project has 0 active organizations → `organizationId` ignored/null
3. Validate `organization.projectId === request.projectId` (org belongs to this project)
4. Validate `organization.clientId === req.user.clientId` (tenant guard)

### Updated `GET /requests` — visibility filter

```typescript
// RequestsRepository.list() filter change
interface ListRequestsFilters {
  // ...existing fields...
  organizationIds?: string[];   // NEW — for CLIENT/AGENT org visibility
  bypassOrgFilter?: boolean;    // true for ADMIN/SUPER_ADMIN
}
```

Filter logic change in repository:

```typescript
// Previously (project-only filter):
where: { clientId, projectId: { in: filters.projectIds } }

// New (project + org filter for non-admin):
where: {
  clientId,
  projectId: { in: filters.projectIds },
  ...(filters.bypassOrgFilter ? {} : {
    OR: [
      { organizationId: { in: filters.organizationIds ?? [] } },
      { createdBy: userEmail },
    ]
  })
}
```

### Updated `GET /requests/:id` — org access check

After loading the request, add:

```typescript
if (!canBypassOrgFilter(user)) {
  const org = request.organizationId
    ? await orgRepo.findById(request.organizationId, user.clientId)
    : null;
  const userInOrg = org && user.organizationIds.includes(org.id);
  const isCreator = request.createdBy === user.email;
  if (!userInOrg && !isCreator) throw new ForbiddenError();
}
```

---

## 9. Frontend Changes

### 9.1 Updated `UserSession`

```typescript
interface UserSession {
  // ...existing fields...
  organizations: {
    organizationId: string;
    projectId: string;
    name: string;
  }[];   // NEW — all org memberships across all projects
}
```

Populated by `/users/me` response (which the backend enriches from `organization_members`).

### 9.2 Updated `GET /users/me` response

Add `organizations` array:

```typescript
{
  ...currentFields,
  organizations: [
    { organizationId: "...", projectId: "...", name: "Engineering" },
    ...
  ]
}
```

### 9.3 New: `OrganizationsTab` in project management

Location: `frontend/src/components/admin/OrganizationsTab.tsx`

UI capabilities:
- List all organizations in the active project (with member count)
- **Create Organization** button (ADMIN+) → `CreateOrgModal`
- Per-org row actions:
  - Edit (name, description) → `EditOrgModal` (ADMIN+)
  - Manage Members → `OrgMembersModal` (ADMIN+)
  - Archive/Delete (SUPER_ADMIN only — show disabled button for ADMIN with tooltip)

**`OrgMembersModal`:**
- List current members with "Remove" button
- "Add Member" selector — dropdown of current `ProjectMember`s not yet in this org
- Confirmation on removal

### 9.4 New: Organization tab in project details page

Where the current project detail / control panel view shows tabs (Members, Form Config, etc.), add:
- **Organizations** tab (shown to ADMIN+ only)

### 9.5 Updated: Ticket creation form

Location: `frontend/src/views/ViewRequestCreate.tsx` (or equivalent dynamic form view)

Add `organizationId` field:
- Hidden when the selected project has no organizations
- Required dropdown when project has ≥1 org
- Dropdown options: all active organizations in the selected project (fetched from `GET /projects/:id/organizations`)
- When the project changes (project picker), re-fetch orgs and reset the org selector

### 9.6 Updated: `ViewMyRequests`

The frontend `ViewMyRequests` fetches `GET /requests` and filters by project. After this feature:
- Backend applies org filter automatically based on `user.organizationIds`
- Frontend change: display `organizationName` column in the request list table
- ADMIN+ sees an optional "Organization" filter dropdown

### 9.7 Updated `frontend/src/api/`

New file: `frontend/src/api/organizations.ts`

```typescript
const organizationsApi = {
  list(projectId: string)                    → { data: Organization[]; count: number }
  create(projectId: string, data)            → Organization
  update(projectId: string, orgId, data)     → Organization
  archive(projectId: string, orgId: string)  → void
  members(projectId: string, orgId: string)  → { data: PortalUser[]; count: number }
  addMember(projectId, orgId, userId)        → void
  removeMember(projectId, orgId, userId)     → void
}
```

---

## 10. Backend Module Structure

### New module: `Organizations`

Following the existing pattern exactly:

```
backend/src/Modules/Organizations/
├── Organization.ts              (entity + command types)
├── IOrganizationRepository.ts  (port interface)
├── OrganizationsService.ts     (business logic + access checks)
├── OrganizationsEndpoints.ts   (Fastify route handlers)
└── OrganizationsService.test.ts
```

### New repository implementations

```
backend/src/Platform/Adapters/Prisma/PrismaOrganizationsRepository.ts
backend/src/Platform/Adapters/InMemory/InMemoryOrganizationsRepository.ts
```

### `IOrganizationRepository` interface

```typescript
interface IOrganizationRepository {
  create(cmd: CreateOrganizationCmd): Promise<Organization>;
  findById(id: string, clientId: string): Promise<Organization | null>;
  findBySlug(projectId: string, slug: string): Promise<Organization | null>;
  list(projectId: string): Promise<Organization[]>;
  listWithMemberCount(projectId: string): Promise<OrganizationSummary[]>;
  update(id: string, patch: Partial<Organization>): Promise<Organization>;
  archive(id: string): Promise<void>;
  addMember(orgId: string, userId: string): Promise<OrganizationMember>;
  removeMember(orgId: string, userId: string): Promise<void>;
  listMembers(orgId: string): Promise<OrganizationMember[]>;
  hasActiveRequests(orgId: string): Promise<boolean>;
}
```

### `IUserRepository` additions

Add to existing interface:

```typescript
listOrgIdsForUser(userId: string): Promise<string[]>;
```

Called by auth middleware alongside `listProjectIdsForUser`.

---

## 11. Migration Plan

### Zero-downtime deployment order

1. **Deploy migration `0003_organizations`** (additive SQL only — no existing data touched)
2. **Deploy backend** (new endpoints added; existing endpoints get org-filter, but `organizationId IS NULL` rows remain visible to creators via `OR createdBy = email`)
3. **Deploy frontend** (org management UI becomes active; ticket creation form shows org selector when orgs exist)
4. **Admin creates organizations in each project** (via new UI)
5. **Admin assigns members to organizations**
6. **Existing tickets remain visible** — `organizationId = NULL` rows treated as "creator-only" (backward compatible)
7. **New tickets have `organizationId` required** (once project has ≥1 org)

### Rollback

All DB changes are additive. To rollback:
- Remove nullable `organization_id` column from `requests` (no data loss if all values are NULL before rollback; wait until no new tickets reference orgs)
- Drop `organization_members` and `organizations` tables

---

## 12. Edge Cases

| Case | Handling |
|------|---------|
| Project has no orgs, user creates ticket | `organizationId` field hidden in UI; stored as NULL; visible to creator only |
| User removed from org, has existing tickets | Tickets remain in DB assigned to that org; user loses visibility to them (unless they're the creator) |
| User removed from project but still in org | `requireProjectAccess` fails first; org check never reached — consistent |
| Org archived (soft-deleted), has tickets | Tickets retain `organizationId` FK (isActive=false org); visibility rules still apply; archived org hidden from new-ticket dropdown |
| Org archived, new ticket creation | `list()` query filters `isActive=true` orgs — archived orgs don't appear in dropdown |
| User in multiple orgs in same project | `organizationIds` array includes all — user sees union of all orgs' tickets |
| `organizationId` on ticket points to org in different project | Service validation rejects at creation time (org.projectId ≠ request.projectId → 400) |
| Admin creates org in another tenant's project | Service reads project via `findById(projectId, req.user.clientId)` — 404 if client mismatch |
| Slug collision within project | DB unique constraint on `(project_id, slug)` → service catches and returns 409 |
| Auto-generated slug | Service generates slug from name (lowercase, spaces→hyphens, truncate to 64 chars); deduplicates with suffix if collision |

---

## 13. Scalability Considerations

| Concern | Assessment |
|---------|-----------|
| Auth middleware extra query (`listOrgIdsForUser`) | One indexed query (`WHERE user_id = ?` on `organization_members`) per request. Negligible at typical portal scale. Could be batched with `listProjectIdsForUser` in a single JOIN query if needed. |
| Request list query complexity | OR condition (`organizationId IN (...)` OR `createdBy = ?`) requires both indexed. `idx_requests_organization_id` added; `createdBy` (email) should also be indexed if not already. |
| Org membership data in `UserIdentity` | Org IDs are small (UUIDs), and users typically belong to ≤5 orgs. No concern. |
| Phase 9 (Azure DevOps) — ticket sync | `CommentsService` syncs portal comments to ADO. `Request.organizationId` is an internal portal concept; no change needed to ADO sync. Org name could optionally be appended to ticket metadata. |
| SQL Server migration (Phase 9) | All schema types portable (see §7). `@db.Text` for description. No Postgres-specific SQL. |
| Large projects (1000+ requests) | Org filter adds an indexed join — query plan stays O(index scan), not O(table scan). |

---

## 14. Recommended Libraries / Packages

No new dependencies needed. The Organizations module uses:

- **Backend:** Prisma (already present), Zod (already present for validation), existing auth guards
- **Frontend:** React state / API client (existing patterns), no new UI libraries — org management UI follows the same component patterns as `ProjectsTab` / `MembersModal`

---

## 15. Step-by-Step Implementation Roadmap

### Task 021-a — Backend (Organizations module)

1. Add `Organization` and `OrganizationMember` entities + `IOrganizationRepository` interface
2. Add `listOrgIdsForUser` to `IUserRepository` interface
3. Implement `PrismaOrganizationsRepository` + `InMemoryOrganizationsRepository`
4. Implement `PrismaUserRepository.listOrgIdsForUser` + InMemory equivalent
5. Write Prisma migration `0003_organizations`
6. Regenerate Prisma client
7. Implement `OrganizationsService` (CRUD + member management + validation)
8. Implement `OrganizationsEndpoints` (all 8 routes above)
9. Register in `app.ts`
10. Update auth middleware to enrich `req.user.organizationIds`
11. Add `requireOrganizationAccess` guard to `Shared/auth.ts`
12. Add new permissions to `Role.ts`
13. Write `OrganizationsService.test.ts` (mirrors `AttachmentsService.test.ts` pattern)

### Task 021-b — Request visibility integration

1. Update `ListRequestsFilters` in `IRequestsRepository` (add `organizationIds`, `bypassOrgFilter`)
2. Update `PrismaRequestsRepository.list()` with new filter logic
3. Update `InMemoryRequestsRepository.list()` equivalently (test coverage)
4. Update `RequestsService.list()` to pass `organizationIds` and `bypassOrgFilter` based on role
5. Update `RequestsEndpoints` POST handler: validate `organizationId` field on create
6. Update `RequestsService.create()`: org validation (project match, tenant match)
7. Update `GET /requests/:id` detail access check: add org-ownership check
8. Update `GET /users/me` response to include org memberships
9. Write integration tests for all 4 visibility scenarios

### Task 021-c — Frontend

1. Add `organizations` to `UserSession` type; update `auth.getSession()` to populate it
2. Create `frontend/src/api/organizations.ts`
3. Create `OrganizationsTab.tsx` (list, create, edit, archive)
4. Create `CreateOrgModal.tsx` + `EditOrgModal.tsx`
5. Create `OrgMembersModal.tsx` (list members, add from project members, remove)
6. Wire `OrganizationsTab` into the project management control panel view
7. Update ticket creation form: fetch orgs per project, show/hide org selector, make required when orgs exist
8. Update `ViewMyRequests`: display `organizationName` column; add org filter for ADMIN+
9. Type-check: `npm run typecheck`
10. Update `docs/architecture.md`
11. Run `session-recap` skill

---

## 16. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| AGENT visibility regression (org filter breaks existing AGENT queries) | High if not explicit | Open question §4 must be answered before Task 021-b; flag in PR |
| Legacy tickets become invisible to admins | Low | `bypassOrgFilter=true` for ADMIN; NULL org tickets visible to creator always |
| Org slug collision causes noisy 500s | Low | Service catches DB unique constraint error → returns 409 with clear message |
| Auth middleware latency spike from extra query | Low | Indexed; batch with projectIds in single JOIN if needed |
| `file-type` ESM / `organization_id` column conflict during rollback | Low | Nullable column — set all to NULL before dropping |
| Scope creep: org-level form templates, org-level notifications | Medium | Explicitly out of scope for 021 — add to backlog |
