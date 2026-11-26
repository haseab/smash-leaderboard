# Agent instructions

## Local development ports

- The development server for **smash-leaderboard** uses **http://localhost:3040**.
- Run `npm run dev` in the normal checkout; its development script sets port **3040** explicitly. Do not use localhost:3000 or silently increment ports.
- Reuse an existing server for this checkout. If the assigned port is occupied by an unrelated process, inspect ownership rather than stopping another project's server.
- Port changes must update the development script, README, environment examples, and local integration/callback URLs together. Keep real credentials in ignored local environment files; never commit them or change production URLs for local development.

On Haseab's BB machine, the shared registry is `~/.bb/dev-ports.json` and
`~/.bb/bin/project-dev smash-leaderboard` uses the same assignment. These personal
files are optional; collaborators can use the repository commands above.

## Restoring missing matches

- Inspect the surrounding match history and check for duplicates. Confirm the players, characters, winner, remaining stocks, self-destructs, and approximate placement in the session. Derive KO and fall counts only when the confirmed result supports them; ask for any details that cannot be established. Record an approximate timestamp as such, convert it to UTC, and place it between the surrounding matches.
- Identify the intended database and verify the capture processor's Supabase configuration points to the same data before writing. The match processor and `recompute_all_player_elos.py` live in the separate `smash-leaderboard-capture` repository. Use its existing configured environment and activated virtual environment when available; otherwise prepare them on the authorized development host. Keep credentials in private runtime configuration, never in commands, logs, or tracked files.
- Before making changes, save a private backup of the affected data: matches, participants, players, character rankings, and team rankings. Check for active capture or other concurrent writes and avoid overwriting changes made during the repair.
- Insert the match and both participants together in a database transaction, with the confirmed characters, winner, KO/fall/self-destruct counts, and historical timestamp. Leave Elo changes for the recomputation. A newly assigned match ID need not be chronological; check the timestamp and surrounding history when verifying placement.
- Run the capture repository's `recompute_all_player_elos.py` after insertion. It recalculates player Elo, participant Elo differences, character rankings, and team rankings across the history, so inspect its current behavior and output, including any errors or skipped work. It may write in multiple steps: if it fails or is interrupted, report the incomplete state and use the private backup to plan recovery rather than assuming the database is consistent. Show ongoing work in the Processes monitor as required by the host's instructions.
- Verify the inserted match and participants, historical placement, Elo differences, and affected rankings against the database. Invalidate the deployed leaderboard's `players` and `matches` cache tags through `/api/revalidate`, using the configured site URL, and verify the response. Report the approximate time, outcome, recomputation result, and any limitations. Remove temporary credentials and disposable setup after completion while retaining the private backup.
