ALTER TABLE "portal_users"
  ADD COLUMN "password_reset_token"      VARCHAR(255),
  ADD COLUMN "password_reset_expires_at" TIMESTAMP(3);
