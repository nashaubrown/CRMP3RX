-- Provenance for curated rewards, so an AI refresh knows what it may replace:
-- untouched STARTER/AI ideas are fair game; anything a rep picked (LIBRARY)
-- or wrote (CUSTOM) is not.

CREATE TYPE "CuratedRewardSource" AS ENUM ('STARTER', 'LIBRARY', 'CUSTOM', 'AI');
ALTER TABLE "CuratedReward" ADD COLUMN "source" "CuratedRewardSource" NOT NULL DEFAULT 'CUSTOM';

-- Existing template-linked rows are the starter backfill (the library picker
-- shipped in the same release, so rep-picked rows are the rare exception and
-- being replaceable-while-untouched is the right behaviour for them anyway).
UPDATE "CuratedReward" SET "source" = 'STARTER' WHERE "templateId" IS NOT NULL;
