CREATE TABLE "team_rankings" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "player_one" BIGINT NOT NULL,
    "player_two" BIGINT NOT NULL,
    "elo" BIGINT NOT NULL DEFAULT 1200,
    "total_wins" INTEGER NOT NULL DEFAULT 0,
    "total_losses" INTEGER NOT NULL DEFAULT 0,
    "total_kos" INTEGER NOT NULL DEFAULT 0,
    "total_falls" INTEGER NOT NULL DEFAULT 0,
    "total_sds" INTEGER NOT NULL DEFAULT 0,
    "current_win_streak" INTEGER NOT NULL DEFAULT 0,
    "last_match_date" TIMESTAMP(3),

    CONSTRAINT "team_rankings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_rankings_player_one_player_two_key" ON "team_rankings"("player_one", "player_two");
CREATE INDEX "idx_team_rankings_elo" ON "team_rankings"("elo" DESC);
CREATE INDEX "idx_team_rankings_player_one_last_match" ON "team_rankings"("player_one", "last_match_date" DESC);
CREATE INDEX "idx_team_rankings_player_two_last_match" ON "team_rankings"("player_two", "last_match_date" DESC);

ALTER TABLE "team_rankings"
ADD CONSTRAINT "team_rankings_player_one_fkey"
FOREIGN KEY ("player_one") REFERENCES "players"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_rankings"
ADD CONSTRAINT "team_rankings_player_two_fkey"
FOREIGN KEY ("player_two") REFERENCES "players"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
