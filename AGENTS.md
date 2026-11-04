# Agent instructions

## Local development ports

- The development server for **smash-leaderboard** uses **http://localhost:3040**.
- Run `npm run dev` in the normal checkout; its development script sets port **3040** explicitly. Do not use localhost:3000 or silently increment ports.
- Reuse an existing server for this checkout. If the assigned port is occupied by an unrelated process, inspect ownership rather than stopping another project's server.
- Port changes must update the development script, README, environment examples, and local integration/callback URLs together. Keep real credentials in ignored local environment files; never commit them or change production URLs for local development.

On Haseab's BB machine, the shared registry is `~/.bb/dev-ports.json` and
`~/.bb/bin/project-dev smash-leaderboard` uses the same assignment. These personal
files are optional; collaborators can use the repository commands above.
