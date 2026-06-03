/*
  Warnings:

  - A unique constraint covering the columns `[client_id,ado_project_id]` on the table `projects` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "comments_author_user_id_idx";

-- AlterTable
ALTER TABLE "organization_members" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "ado_project_id" VARCHAR(64),
ADD COLUMN     "ado_project_name" VARCHAR(256);

-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "ado_assigned_to" VARCHAR(255),
ADD COLUMN     "ado_project_name" VARCHAR(256),
ADD COLUMN     "created_by" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "projects_client_id_ado_project_id_key" ON "projects"("client_id", "ado_project_id");

-- RenameForeignKey
ALTER TABLE "organization_members" RENAME CONSTRAINT "organization_members_org_fkey" TO "organization_members_organization_id_fkey";

-- RenameForeignKey
ALTER TABLE "organization_members" RENAME CONSTRAINT "organization_members_user_fkey" TO "organization_members_user_id_fkey";

-- RenameIndex
ALTER INDEX "organization_members_org_user_key" RENAME TO "organization_members_organization_id_user_id_key";
