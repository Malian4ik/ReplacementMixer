# ReplacementMixer

ReplacementMixer is a Next.js tournament substitution platform for MixerCup.

This repository now includes a Discord-assisted replacement search flow with these principles:

- the website is the primary control surface
- Discord is used to ping reserve players and collect `Готов`
- the existing platform `SubScore` stays the only scoring source of truth
- the judge or owner keeps final confirmation before a replacement is assigned

## Stack

- Next.js 16
- React 19
- TypeScript
- Prisma 7
- SQLite / Turso adapter
- Discord.js 14

## Scoring source of truth

The replacement scoring formula already existed in the platform and is still reused as-is:

- [`services/subscore.service.ts`](./services/subscore.service.ts)
- [`services/queue.service.ts`](./services/queue.service.ts)

The Discord flow reuses `scoreCandidates(...)` from `services/queue.service.ts`.
No new formula was introduced.

## Production flow

The main production flow starts from the judge panel on the website:

1. Judge or owner opens `/judge`
2. Selects a team and either:
   - a replaced player
   - or an empty slot role
3. Clicks `Запустить поиск в Discord`
4. The website creates a persisted search session
5. The bot picks up the session and posts the current wave in the Discord replacements channel
6. Reserve players click `Готов`
7. After 3 minutes the bot evaluates only responders from the active wave
8. Responders are ranked using the existing `SubScore`
9. The best responder becomes the current recommendation on the website
10. Judge has final control:
   - `Подтвердить замену`
   - `Следующий кандидат`
   - `Отменить поиск`

If the judge rejects the current recommendation, the next ranked responder is offered.
If a wave has no ready players, the bot continues with the next 15 eligible reserve players.

Slash commands are still available as a backup admin path.

## Data model added for replacement search

New persisted entities:

- `ReplacementSearchSession`
- `ReplacementSearchWave`
- `ReplacementWaveCandidate`
- `ReplacementWaveResponse`

Player mapping was extended with:

- `Player.discordUserId`

This makes the process auditable:

- who was pinged
- which wave they were in
- who clicked ready
- what score they received
- who was offered to the judge
- who was finally selected

## Environment variables

### Web app / DB

- `JWT_SECRET`
- `TURSO_DATABASE_URL` optional, runtime can fall back to local SQLite
- `TURSO_AUTH_TOKEN` optional for Turso
- `DATABASE_URL` optional local fallback

### Discord bot

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_REPLACEMENTS_CHANNEL_ID`

See [`.env.example`](./.env.example).

## Install

```bash
npm install
```

## Prisma

Generate the client:

```bash
npx prisma generate
```

Apply both SQL migrations:

```bash
npx prisma db execute --file prisma/migrations/20260409000100_discord_replacement_search/migration.sql
npx prisma db execute --file prisma/migrations/20260409000200_search_confirmation_flow/migration.sql
```

## Run the web app

```bash
npm run dev
```

## Register Discord slash commands

```bash
npm run bot:discord:register
```

## Run the Discord bot

```bash
npm run bot:discord
```

The bot:

- listens for ready-button interactions
- keeps slash commands as a backup tool
- polls for website-created sessions that still need a wave
- processes expired waves
- recovers stale processing locks after restart

## Discord commands

### `/replacement-search`

Starts a persisted replacement search session directly from Discord.
This is a backup/admin path; the primary production flow should start from `/judge`.

Options:

- `team` required, team ID or exact team name
- `replaced-player` optional, player ID or exact nick from the team
- `role` optional, required when filling an empty slot
- `match-id` optional
- `comment` optional

Behavior:

- if `replaced-player` is provided, the needed role is derived from that player
- if `replaced-player` is omitted, `role` is used for an empty-slot flow
- the bot posts the wave in the configured replacements channel

### `/replacement-active`

Shows active in-progress replacement sessions for admins.

## Architecture

### Discord transport layer

- [`bot/index.ts`](./bot/index.ts)
- [`bot/discord-transport.ts`](./bot/discord-transport.ts)
- [`bot/commands.ts`](./bot/commands.ts)
- [`bot/register-commands.ts`](./bot/register-commands.ts)

Responsibilities:

- connect to Discord
- register slash commands
- publish wave messages with buttons
- receive button clicks
- run the polling scheduler for website-created sessions

### Business logic

- [`services/replacement-search.service.ts`](./services/replacement-search.service.ts)
- [`services/replacement-search-confirmation.service.ts`](./services/replacement-search-confirmation.service.ts)
- [`services/wave-orchestrator.service.ts`](./services/wave-orchestrator.service.ts)
- [`services/replacement-search.helpers.ts`](./services/replacement-search.helpers.ts)

Responsibilities:

- create sessions
- create waves
- enforce no re-ping within a session
- process due waves
- rank responders deterministically
- move recommendations back to the website
- confirm or reject recommendations
- call the existing `assignReplacement(...)` flow only after judge confirmation

### Persistence

- [`services/replacement-search.repository.ts`](./services/replacement-search.repository.ts)
- Prisma schema + migrations

Responsibilities:

- session persistence
- wave persistence
- candidate persistence
- response persistence

### Scoring / queue

- [`services/subscore.service.ts`](./services/subscore.service.ts)
- [`services/queue.service.ts`](./services/queue.service.ts)
- [`services/reserve-queue.service.ts`](./services/reserve-queue.service.ts)
- [`services/team-balance.service.ts`](./services/team-balance.service.ts)

Responsibilities:

- reserve queue ordering
- existing SubScore formula
- target average team MMR reuse

## Deterministic tie-breakers

When multiple responders have the same score, ranking falls back to:

1. Higher `SubScore`
2. Lower queue position
3. Earlier ready click timestamp
4. Stable lexical `playerId`

## Safety rules implemented

- session persistence
- wave persistence
- candidate persistence
- response persistence
- judge confirmation before final assignment
- no duplicate pings in a session
- only active-wave responders are considered
- queue ordering is preserved from the platform
- duplicate click protection
- processing lock per wave
- stale processing lock recovery
- restart-safe due-wave polling
- assignment reuse through the existing platform service

## Tests

Run the minimal test suite:

```bash
npm test
```

Current tests cover:

- wave candidate picking without re-pinging
- deterministic tie-break ranking

## Notes

- Player-to-Discord mapping is stored in `Player.discordUserId`
- The website player API and player management UI were extended to support that field
- The bot only pings players with an active pool entry, who are not in a team, are active in the database, and have a Discord mapping
