/**
 * Registers (or updates) slash commands with Discord's API.
 *
 * Run once after adding / changing commands:
 *   npm run bot:deploy
 *
 * Set DISCORD_GUILD_ID for guild-scoped commands (instant update, good for dev).
 * Leave it unset for global commands (propagate in ~1 hour, use in production).
 */

import { REST, Routes } from "@discordjs/rest";
import { commands } from "./commands/index";
import { log } from "./utils/logger";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  log.error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);
const body = commands.map((cmd) => cmd.data.toJSON());

(async () => {
  try {
    log.info(`Registering ${body.length} slash command(s)…`);

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
      log.info(`Guild commands registered for guild ${guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body });
      log.info("Global commands registered (may take up to 1 hour to propagate).");
    }
  } catch (err) {
    log.error("Failed to register commands", err);
    process.exit(1);
  }
})();
