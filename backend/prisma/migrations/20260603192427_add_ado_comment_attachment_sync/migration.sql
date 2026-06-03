-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "ado_attachment_id" VARCHAR(64),
ADD COLUMN     "ado_attachment_url" VARCHAR(512);

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "ado_comment_id" VARCHAR(64);
