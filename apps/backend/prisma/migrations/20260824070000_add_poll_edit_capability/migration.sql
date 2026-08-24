-- Existing polls deliberately receive values that cannot be used as opaque
-- edit tokens. New polls always receive a cryptographically random token.
ALTER TABLE "polls" ADD COLUMN "edit_token_hash" TEXT;

UPDATE "polls"
SET "edit_token_hash" = 'legacy:' || "id"
WHERE "edit_token_hash" IS NULL;

ALTER TABLE "polls" ALTER COLUMN "edit_token_hash" SET NOT NULL;

CREATE UNIQUE INDEX "polls_edit_token_hash_key" ON "polls"("edit_token_hash");
