-- Add icon_url column to projects table (nullable text — stores base64 data URL or external URL)
ALTER TABLE "projects" ADD COLUMN "icon_url" TEXT;
