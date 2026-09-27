ALTER TABLE "polls" ADD COLUMN "require_voter_name" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "poll_votes" ADD COLUMN "voter_name" VARCHAR(120);
