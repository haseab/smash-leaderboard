CREATE TABLE "character_rankings" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "player" BIGINT NOT NULL,
    "smash_character" TEXT NOT NULL,
    "elo" BIGINT NOT NULL DEFAULT 1200,
    "total_wins" INTEGER NOT NULL DEFAULT 0,
    "total_losses" INTEGER NOT NULL DEFAULT 0,
    "total_kos" INTEGER NOT NULL DEFAULT 0,
    "total_falls" INTEGER NOT NULL DEFAULT 0,
    "total_sds" INTEGER NOT NULL DEFAULT 0,
    "current_win_streak" INTEGER NOT NULL DEFAULT 0,
    "last_match_date" TIMESTAMP(3),

    CONSTRAINT "character_rankings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "character_rankings_player_smash_character_key" ON "character_rankings"("player", "smash_character");
CREATE INDEX "idx_character_rankings_elo" ON "character_rankings"("elo" DESC);
CREATE INDEX "idx_character_rankings_player_last_match" ON "character_rankings"("player", "last_match_date" DESC);

ALTER TABLE "character_rankings"
ADD CONSTRAINT "character_rankings_player_fkey"
FOREIGN KEY ("player") REFERENCES "players"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
