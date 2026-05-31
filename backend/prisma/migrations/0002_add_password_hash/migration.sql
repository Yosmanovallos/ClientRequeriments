-- Migration: add password_hash to portal_users for local-jwt auth adapter.
-- Column is nullable so existing Supabase/Entra users are unaffected.
ALTER TABLE "portal_users" ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(512);
