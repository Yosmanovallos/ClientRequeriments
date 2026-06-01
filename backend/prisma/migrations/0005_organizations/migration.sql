-- Migration 0005: Add Organizations and OrganizationMembers
-- Adds org-based ticket visibility scoping within projects.

-- CreateTable organizations
CREATE TABLE "organizations" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id"   UUID NOT NULL,
    "project_id"  UUID NOT NULL,
    "name"        VARCHAR(128) NOT NULL,
    "description" TEXT,
    "is_active"   BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable organization_members
CREATE TABLE "organization_members" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id"         UUID NOT NULL,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- Add organizationId column to requests (nullable — existing rows unaffected)
ALTER TABLE "requests" ADD COLUMN "organization_id" UUID;

-- Unique constraints
CREATE UNIQUE INDEX "organizations_project_id_name_key"
    ON "organizations"("project_id", "name");

CREATE UNIQUE INDEX "organization_members_org_user_key"
    ON "organization_members"("organization_id", "user_id");

-- Indexes
CREATE INDEX "organizations_client_id_idx"
    ON "organizations"("client_id");

CREATE INDEX "organization_members_user_id_idx"
    ON "organization_members"("user_id");

CREATE INDEX "requests_organization_id_idx"
    ON "requests"("organization_id");

-- Foreign keys: organizations
ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: organization_members (cascade on org delete)
ALTER TABLE "organization_members"
    ADD CONSTRAINT "organization_members_org_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_members"
    ADD CONSTRAINT "organization_members_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "portal_users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign key: requests → organizations (NULL on org delete to preserve history)
ALTER TABLE "requests"
    ADD CONSTRAINT "requests_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
