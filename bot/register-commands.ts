import "dotenv/config";
import { REST, Routes } from "discord.js";
import { slashCommands } from "@/bot/commands";

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId || !guildId) {
    throw new Error("Missing DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID or DISCORD_GUILD_ID");
  }

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: slashCommands.map((command) => command.toJSON()),
  });

  console.log("Discord slash commands registered");
}

main().catch((error) => {
  console.error("[discord-register]", error);
  process.exit(1);
});
