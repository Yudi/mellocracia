-- Results are addressed with the poll's vote token, so they do not need a
-- separate creator-only capability.
DROP INDEX "polls_results_token_hash_key";

ALTER TABLE "polls" DROP COLUMN "results_token_hash";
