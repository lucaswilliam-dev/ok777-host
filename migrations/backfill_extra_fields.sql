-- Migration script to backfill extra_gameType and extra_provider fields
-- This sets extra_gameType = gameType and extra_provider = provider for all existing games

UPDATE "Games"
SET 
  extra_gameType = gameType,
  extra_provider = provider
WHERE 
  extra_gameType IS NULL 
  OR extra_provider IS NULL
  OR extra_gameType != gameType
  OR (extra_provider IS NULL AND provider IS NOT NULL)
  OR (extra_provider IS NOT NULL AND provider IS NOT NULL AND extra_provider != provider);

-- Verify the update
SELECT 
  COUNT(*) as total_games,
  COUNT(CASE WHEN extra_gameType = gameType THEN 1 END) as synced_gameType,
  COUNT(CASE WHEN extra_provider = provider OR (extra_provider IS NULL AND provider IS NULL) THEN 1 END) as synced_provider
FROM "Games";

