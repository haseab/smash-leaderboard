CREATE INDEX "idx_matches_archived_created_id"
ON "matches"("archived", "created_at" DESC, "id" DESC);

CREATE INDEX "idx_match_participants_player_cpu_match"
ON "match_participants"("player", "is_cpu", "match_id" DESC);
