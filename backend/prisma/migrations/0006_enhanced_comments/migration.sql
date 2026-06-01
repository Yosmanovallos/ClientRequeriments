-- Migration 0006: Enhanced Comments
-- Adds authorUserId FK to comments for trustworthy attribution,
-- and commentId FK to attachments for comment-scoped file grouping.
-- Both columns are nullable — no data loss for existing rows.

-- Add author_user_id to comments
ALTER TABLE "comments"
  ADD COLUMN "author_user_id" UUID;

ALTER TABLE "comments"
  ADD CONSTRAINT "comments_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "portal_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "comments_author_user_id_idx" ON "comments"("author_user_id");

-- Add comment_id to attachments (allows grouping attachments under a comment)
ALTER TABLE "attachments"
  ADD COLUMN "comment_id" UUID;

CREATE INDEX "attachments_comment_id_idx" ON "attachments"("comment_id");
