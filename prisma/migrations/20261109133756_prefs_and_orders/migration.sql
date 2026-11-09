-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "customer" JSONB,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'app';

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "prefs" JSONB NOT NULL DEFAULT '{}';
