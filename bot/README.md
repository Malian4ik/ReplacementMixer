# Discord Bot — Mixer Cup Replacement Search

Automated bot for finding substitute players in the Dota 2 tournament platform.

## How it works

1. Admin runs `/search-replacement` → bot creates a `ReplacementSearchSession`
2. Bot fetches the first 15 eligible players from the reserve queue → creates a `ReplacementWave`
3. Bot posts a message in the replacements channel with `@mentions` and a **"Готов"** button
4. 3-minute timer starts
5. After 3 minutes:
   - **Responses exist** → the bot scores all responders using the existing `SubScore` formula (same as the web app), applies tie-breakers, and announces the winner
   - **No responses** → posts "no response" notice and starts the next wave with the next 15 players
6. This repeats until a player is found or the queue is exhausted
7. All sessions, waves, candidates, and responses are persisted to DB (restart-safe)

### SubScore formula

Identical to `services/subscore.service.ts` used by the web application:

```
BaseScore  = 0.6 × stakeNorm + 0.3 × mmrNorm + 0.1 × roleFit
SubScore   = BaseScore × BalanceFactor
```

Tie-breakers (if SubScore is equal):
1. Lower queue position (joined reserve earlier)
2. Earlier "Готов" click time

---

## Setup

### 1. Install dependencies

```bash
cd Прога/mixercup
npm install
```

### 2. Create a Discord Application

1. Go to https://discord.com/developers/applications
2. Create a new application → Bot → Reset Token → copy the token
3. Enable these **Privileged Gateway Intents**: (none required for this bot)
4. Under OAuth2 → URL Generator: scopes `bot` + `applications.commands`
5. Bot permissions: `Send Messages`, `Embed Links`, `Mention Everyone`
6. Invite the bot to your server

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in:

```env
# Discord
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-client-id
DISCORD_GUILD_ID=your-guild-id          # Optional: for guild-scoped commands (instant update)

# Database (same as Next.js app)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token
# For local dev with SQLite, leave both blank — defaults to file:prisma/dev.db

# Debug
BOT_DEBUG=0   # Set to 1 for verbose debug logs
```

### 4. Apply DB migrations

```bash
npx prisma db push
npx prisma generate
```

This adds the new tables:
- `ReplacementSearchSession`
- `ReplacementWave`
- `WaveCandidate`
- `WaveResponse`

And the `discordId` field to `Player`.

### 5. Register slash commands

```bash
npm run bot:deploy
```

With `DISCORD_GUILD_ID` set: instant (use for dev).
Without: global commands, propagate in ~1 hour (use for prod).

### 6. Run the bot

```bash
npm run bot
```

---

## Commands

| Command | Permission | Description |
|---------|-----------|-------------|
| `/search-replacement team:<name> role:<1-5> [replaced-player:<nick>]` | ManageGuild | Starts replacement search for a team |
| `/cancel-search team:<name>` | ManageGuild | Cancels active search session |
| `/link-player user:@user nick:<player-nick>` | ManageGuild | Links a Discord user to a platform player |
| `/unlink-player user:@user` | ManageGuild | Removes the Discord ↔ player link |

---

## Player linking

Before a player can click **"Готов"**, their Discord account must be linked to their platform profile:

```
/link-player user:@Username nick:PlayerNick
```

Players without a linked account will be mentioned (if their `discordId` is set) but their click will be ignored with an ephemeral error message.

---

## Tests

```bash
npm run bot:test
```

Tests cover:
- All pure SubScore formula functions (`subscore.test.ts`)
- Candidate scoring and tie-breaker ordering (`wave-selection.test.ts`)

---

## Architecture

```
bot/
├── index.ts                    # Entry point, event handlers
├── deploy-commands.ts          # One-shot command registration
├── constants.ts                # WAVE_SIZE, WAVE_DURATION_MS, etc.
├── commands/
│   ├── search-replacement.ts   # /search-replacement
│   ├── link-player.ts          # /link-player
│   ├── unlink-player.ts        # /unlink-player
│   ├── cancel-search.ts        # /cancel-search
│   └── index.ts                # Command registry
├── interactions/
│   └── ready-button.ts         # "Готов" button handler
├── workers/
│   └── wave-orchestrator.ts    # Timer management, wave progression
├── utils/
│   ├── embeds.ts               # Discord embed builders
│   └── logger.ts               # Structured logging
└── __tests__/
    ├── subscore.test.ts         # Pure formula tests
    └── wave-selection.test.ts  # Scoring + tie-breaker tests

services/
├── subscore.service.ts         # ← SHARED: the scoring formula
├── queue.service.ts            # ← SHARED: scoreCandidates()
├── search-session.service.ts   # Session CRUD
└── wave.service.ts             # Wave CRUD, eligibility, selection
```

---

## Reliability

- **Restart recovery**: on startup, bot reads all `Active` waves from DB and re-schedules timers
- **Race condition protection**: `claimWaveForProcessing` uses a DB transaction to atomically transition `Active → Processing`; second call returns `null` (no-op)
- **Duplicate sessions**: `createSearchSession` throws `DUPLICATE_SESSION` if an Active session exists for the same team
- **Duplicate clicks**: `@@unique([waveId, playerId])` on `WaveResponse` + upsert prevents double-counting
- **Expired interactions**: Discord interactions older than 15 minutes are rejected by Discord; bot defers immediately on button click
- **Ineligible responders**: at processing time the bot re-checks `status === "Active"` and `isDisqualified === false`
