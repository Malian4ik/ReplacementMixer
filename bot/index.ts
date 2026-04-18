/**
 * Discord bot entry point.
 *
 * Run with:
 *   tsx bot/index.ts          (from the Прога/mixercup directory)
 *   npm run bot               (via package.json script)
 *
 * Required env vars:
 *   DISCORD_TOKEN        — bot token from Discord Developer Portal
 *   DISCORD_CLIENT_ID    — application client ID
 *   DISCORD_GUILD_ID     — (optional) restrict commands to one guild for faster testing
 *   REPLACEMENTS_CHANNEL_ID — default channel for wave announcements
 *   TURSO_DATABASE_URL   — same as Next.js app
 *   TURSO_AUTH_TOKEN     — same as Next.js app (omit for local SQLite)
 */

import {
  Client,
  GatewayIntentBits,
  Events,
  type Interaction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { log } from "./utils/logger";
import { commandMap } from "./commands/index";
import { isReadyButton, handleReadyButton } from "./interactions/ready-button";
import { recoverActiveWaves, startWave } from "./workers/wave-orchestrator";
import { prisma } from "@/lib/prisma";

// ── Environment validation ────────────────────────────────────────────────────

const REQUIRED_ENV = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    log.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ── Client ────────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// ── Ready ─────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, async (readyClient) => {
  log.info(`Logged in as ${readyClient.user.tag}`);

  // Recover any waves that were interrupted by a restart
  try {
    await recoverActiveWaves(readyClient);
  } catch (err) {
    log.error("Failed to recover active waves on startup", err);
  }

  // Poll for web-triggered sessions (created via judge panel)
  setInterval(async () => {
    try {
      const sessions = await prisma.substitutionSearchSession.findMany({
        where: { status: "Active", currentWave: 0 },
      });
      for (const session of sessions) {
        log.info(`Web-triggered session detected: ${session.id} (team: ${session.teamName})`);
        await startWave(session.id, readyClient);
      }
    } catch (err) {
      log.error("Session polling error", err);
    }
  }, 5000);
});

// ── Interactions ──────────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // ── Button: "Готов" ───────────────────────────────────────────────────────
  if (interaction.isButton()) {
    if (isReadyButton(interaction.customId)) {
      await handleReadyButton(interaction);
    }
    return;
  }

  // ── Slash commands ────────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const cmd = commandMap.get(interaction.commandName);
  if (!cmd) {
    log.warn(`Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await cmd.execute(interaction as ChatInputCommandInteraction);
  } catch (err) {
    log.error(`Command error: ${interaction.commandName}`, err);

    const errMsg = "⚠️ Произошла ошибка при выполнении команды.";
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errMsg, ephemeral: true });
      } else {
        await interaction.reply({ content: errMsg, ephemeral: true });
      }
    } catch {
      // Interaction may have already expired
    }
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on("SIGINT", () => {
  log.info("SIGINT received — shutting down bot.");
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log.info("SIGTERM received — shutting down bot.");
  client.destroy();
  process.exit(0);
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled promise rejection", reason);
});

// ── Login ─────────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  log.error("Failed to login to Discord", err);
  process.exit(1);
});
