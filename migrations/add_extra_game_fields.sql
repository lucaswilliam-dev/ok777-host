-- Migration script to add and backfill new extra fields on Games table
-- Adds: extra_gameName (text), extra_langName (jsonb), extra_imageUrl (text)

ALTER TABLE "Games"
  ADD COLUMN IF NOT EXISTS "extra_gameName" text,
  ADD COLUMN IF NOT EXISTS "extra_langName" jsonb,
  ADD COLUMN IF NOT EXISTS "extra_imageUrl" text;

-- Backfill with current values to keep data in sync
UPDATE "Games"
SET
  "extra_gameName" = "gameName",
  "extra_langName" = "langName",
  "extra_imageUrl" = "imageUrl"
WHERE
  "extra_gameName" IS DISTINCT FROM "gameName"
  OR "extra_langName" IS DISTINCT FROM "langName"
  OR "extra_imageUrl" IS DISTINCT FROM "imageUrl";

-- Verification query
SELECT
  COUNT(*) AS total_games,
  COUNT(*) FILTER (WHERE "extra_gameName" = "gameName") AS synced_names,
  COUNT(*) FILTER (
    WHERE COALESCE("extra_langName"::text, '{}') = COALESCE("langName"::text, '{}')
  ) AS synced_langs,
  COUNT(*) FILTER (WHERE "extra_imageUrl" = "imageUrl") AS synced_images
FROM "Games";

