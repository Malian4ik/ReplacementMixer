import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Interaction,
  REST,
  Routes,
} from "discord.js";
import { slashCommands } from "@/bot/commands";
import { DiscordChannelTransport, parseReadyButtonCustomId } from "@/bot/discord-transport";
import { getSessionsAwaitingWave, getRecentActiveSearchSessions } from "@/services/replacement-search.repository";
import { startReplacementSearch } from "@/services/replacement-search.service";
import { createNextReplacementWave } from "@/services/replacement-search.service";
import { processDueWaves, recoverStaleWaveLocks, registerReadyResponse } from "@/services/wave-orchestrator.service";

const POLL_INTERVAL_MS = 10_000;

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

async function ensureCommandsRegistered(token: string, clientId: string, guildId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: slashCommands.map((command) => command.toJSON()),
  });
}

async function handleInteraction(interaction: Interaction, transport: DiscordChannelTransport, replacementsChannelId: string) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "replacement-search") {
      await interaction.deferReply({ ephemeral: true });

      try {
        const session = await startReplacementSearch(
          {
            teamQuery: interaction.options.getString("team", true),
            replacedPlayerQuery: interaction.options.getString("replaced-player") ?? undefined,
            neededRole: interaction.options.getInteger("role") ?? undefined,
            matchId: interaction.options.getString("match-id") ?? undefined,
            comment: interaction.options.getString("comment") ?? undefined,
            triggeredByDiscordUserId: interaction.user.id,
            triggeredByName: interaction.member && "displayName" in interaction.member
              ? interaction.member.displayName
              : interaction.user.username,
            replacementsChannelId,
          },
          transport
        );

        await interaction.editReply(
          `Поиск замены запущен для команды **${session.teamName}**. Сессия: \`${session.id}\`. Волна отправлена в <#${replacementsChannelId}>.`
        );
      } catch (error) {
        await interaction.editReply(
          `Не удалось запустить поиск замены: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return;
    }

    if (interaction.commandName === "replacement-active") {
      await interaction.deferReply({ ephemeral: true });
      const sessions = await getRecentActiveSearchSessions();
      if (sessions.length === 0) {
        await interaction.editReply("Активных сессий поиска замен нет.");
        return;
      }

      const lines = sessions.map((session) => {
        const latestWave = session.waves[0];
        const wavePart = latestWave
          ? `волна #${latestWave.waveNumber} (${latestWave.status})`
          : "волна ещё не создана";
        return `• ${session.teamName} — сессия \`${session.id}\`, ${wavePart}, старт: ${session.startedAt.toISOString()}`;
      });
      await interaction.editReply(lines.join("\n"));
      return;
    }
  }

  if (interaction.isButton()) {
    const waveId = parseReadyButtonCustomId(interaction.customId);
    if (!waveId) return;

    const result = await registerReadyResponse({
      waveId,
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
      discordGlobalName: interaction.user.globalName,
      discordDisplayName:
        interaction.member && "displayName" in interaction.member
          ? interaction.member.displayName
          : null,
      interactionId: interaction.id,
    });

    if (!result.ok) {
      const messageMap: Record<string, string> = {
        WAVE_NOT_FOUND: "Эта волна уже недоступна.",
        WAVE_NOT_ACTIVE: "Эта волна уже завершена.",
        WAVE_EXPIRED: "Окно ответа уже закрыто.",
        USER_NOT_ELIGIBLE_FOR_WAVE: "Вы не входите в текущую группу вызова.",
        ALREADY_READY: "Ваш ответ уже сохранён.",
      };
      await interaction.reply({
        content: messageMap[result.reason] ?? "Не удалось сохранить ответ.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: "Ответ сохранён. Вы отмечены как готовый в этой волне.",
      ephemeral: true,
    });
  }
}

async function processPendingWebsiteSessions(transport: DiscordChannelTransport) {
  const sessions = await getSessionsAwaitingWave();
  for (const session of sessions) {
    try {
      await createNextReplacementWave(session.id, transport);
    } catch (error) {
      console.error("[discord-bot] failed to create wave for website session", session.id, error);
    }
  }
}

async function main() {
  const token = getRequiredEnv("DISCORD_BOT_TOKEN");
  const clientId = getRequiredEnv("DISCORD_CLIENT_ID");
  const guildId = getRequiredEnv("DISCORD_GUILD_ID");
  const replacementsChannelId = getRequiredEnv("DISCORD_REPLACEMENTS_CHANNEL_ID");

  await ensureCommandsRegistered(token, clientId, guildId);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const transport = new DiscordChannelTransport(client);

  client.once("ready", async () => {
    console.log(`[discord-bot] logged in as ${client.user?.tag}`);
    await recoverStaleWaveLocks();
    await processPendingWebsiteSessions(transport);
    await processDueWaves(transport);
    setInterval(async () => {
      try {
        await recoverStaleWaveLocks();
        await processPendingWebsiteSessions(transport);
        await processDueWaves(transport);
      } catch (error) {
        console.error("[discord-bot] scheduler failed", error);
      }
    }, POLL_INTERVAL_MS);
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      await handleInteraction(interaction, transport, replacementsChannelId);
    } catch (error) {
      console.error("[discord-bot] interaction failed", error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Произошла ошибка при обработке команды.",
          ephemeral: true,
        });
      }
    }
  });

  await client.login(token);
}

main().catch((error) => {
  console.error("[discord-bot] fatal", error);
  process.exit(1);
});
