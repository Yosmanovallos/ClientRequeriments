-- Add per-project reference prefix (e.g. CFGMBR, CSNDBR, CBLGBR)
ALTER TABLE "projects" ADD COLUMN "prefix" VARCHAR(16);

-- Per-project counter table (replaces per-client counter for new requests)
CREATE TABLE "project_ref_counters" (
  "project_id" UUID    NOT NULL,
  "last_value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "project_ref_counters_pkey"            PRIMARY KEY ("project_id"),
  CONSTRAINT "project_ref_counters_project_id_fkey" FOREIGN KEY ("project_id")
    REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
