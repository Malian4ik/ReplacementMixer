import {
  ActionRowBuilder,
  AnyThreadChannel,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  TextChannel,
} from "discord.js";
import type { DiscordReplacementTransport, WaveAnnouncementPayload, WaveResultPayload } from "@/services/replacement-search.types";

function getReadyButtonCustomId(waveId: string) {
  return `replacement-ready:${waveId}`;
}

async function resolveTextChannel(client: Client, channelId: string): Promise<TextChannel | AnyThreadChannel> {
  const channel = await client.channels.fetch(channelId);
  if (!channel) {
    throw new Error(`Discord channel ${channelId} not found`);
  }
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.PublicThread &&
    channel.type !== ChannelType.PrivateThread &&
    channel.type !== ChannelType.AnnouncementThread
  ) {
    throw new Error(`Discord channel ${channelId} is not text-based`);
  }
  return channel;
}

function buildWaveMessage(payload: WaveAnnouncementPayload) {
  const mentions = payload.candidates.map((candidate) => `<@${candidate.discordUserId}>`).join(" ");
  const roleLine = `Нужная роль: **R${payload.neededRole}**`;
  const replacedLine = payload.replacedPlayerNick
    ? `Нужно заменить игрока: **${payload.replacedPlayerNick}**`
    : "Нужно заполнить свободный слот";
  const matchLine = payload.matchId ? `Матч: \`${payload.matchId}\`` : null;
  const commentLine = payload.comment ? `Комментарий: ${payload.comment}` : null;

  const lines = [
    `Волна **#${payload.waveNumber}** поиска замены для команды **${payload.teamName}**`,
    replacedLine,
    roleLine,
    "Окно ответа: **3 минуты**",
    matchLine,
    commentLine,
    "",
    mentions,
  ].filter(Boolean);

  return lines.join("\n");
}

export class DiscordChannelTransport implements DiscordReplacementTransport {
  constructor(private readonly client: Client) {}

  async publishWave(payload: WaveAnnouncementPayload): Promise<{ messageId: string }> {
    const channel = await resolveTextChannel(this.client, payload.channelId);
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(getReadyButtonCustomId(payload.waveId))
        .setLabel("Готов")
        .setStyle(ButtonStyle.Success)
    );

    const message = await channel.send({
      content: buildWaveMessage(payload),
      components: [buttonRow],
    });

    return { messageId: message.id };
  }

  async publishWaveResult(payload: WaveResultPayload): Promise<void> {
    const channel = await resolveTextChannel(this.client, payload.channelId);
    await channel.send({ content: payload.message });
  }
}

export function parseReadyButtonCustomId(customId: string): string | null {
  if (!customId.startsWith("replacement-ready:")) return null;
  return customId.slice("replacement-ready:".length) || null;
}
