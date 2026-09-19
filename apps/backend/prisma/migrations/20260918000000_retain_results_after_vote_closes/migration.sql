ALTER TABLE "polls" ADD COLUMN "closes_at" TIMESTAMPTZ(6);

UPDATE "polls"
SET
    "closes_at" = "expires_at",
    "expires_at" = "expires_at" + INTERVAL '7 days'
WHERE "closes_at" IS NULL;

ALTER TABLE "polls" ALTER COLUMN "closes_at" SET NOT NULL;

CREATE INDEX "polls_closes_at_idx" ON "polls"("closes_at");
