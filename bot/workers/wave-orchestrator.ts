import type { Client, TextChannel } from "discord.js";
import { prisma } from "@/lib/prisma";
import { log } from "@/bot/utils/logger";
import {
  claimWaveForProcessing,
  getNextEligibleBatch,
  createWave,
  setWaveMessageId,
  selectBestResponder,
  markWaveNoResponse,
  getActiveWavesForRecovery,
} from "@/services/wave.service";
import {
  getContactedPlayerIds,
  markSessionCompleted,
  markSessionExhausted,
} from "@/services/search-session.service";
import {
  buildWaveEmbed,
  buildReadyButton,
  buildDisabledReadyButton,
  buildWinnerEmbed,
  buildNoResponseEmbed,
  buildExhaustedEmbed,
} from "@/bot/utils/embeds";

// ── Timer registry ────────────────────────────────────────────────────────────

/** In-memory map of waveId → active setTimeout handle. */
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called once on bot startup to resume any waves that were interrupted by
 * a restart. Each Active wave gets its timer re-scheduled.
 */
export async function recoverActiveWaves(client: Client): Promise<void> {
  const waves = await getActiveWavesForRecovery();
  if (waves.length === 0) return;

  log.info(`Recovering ${waves.length} active wave(s) from DB.`);
  for (const wave of waves) {
    const remaining = Math.max(0, wave.endsAt.getTime() - Date.now());
    log.info(`  Wave ${wave.id} (session ${wave.sessionId}): ${Math.round(remaining / 1000)}s remaining`);
    scheduleWaveTimeout(wave.id, remaining, client);
  }
}

/**
 * Starts a new search wave for the given session.
 * Fetches eligible candidates, posts the Discord message, and schedules the timeout.
 * Returns false if the queue is already exhausted.
 */
export async function startWave(sessionId: string, client: Client): Promise<boolean> {
  const session = await prisma.substitutionSearchSession.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.status !== "Active") return false;

  const contacted = await getContactedPlayerIds(sessionId);
  const batch = await getNextEligibleBatch(contacted);

  if (batch.length === 0) {
    // Queue exhausted
    await markSessionExhausted(sessionId);
    await postExhaustedMessage(session, client);
    return false;
  }

  const waveNumber = session.currentWave + 1;

  const wave = await createWave({
    sessionId,
    waveNumber,
    channelId: session.channelId,
    candidates: batch.map((e, i) => ({
      poolEntryId: e.id,
      playerId: e.playerId,
      discordId: (e.player as { discordId?: string | null }).discordId ?? null,
      queuePosition: i,
    })),
  });

  // Post Discord message
  const messageId = await postWaveMessage(session, wave, batch, client);
  if (messageId) await setWaveMessageId(wave.id, messageId);

  // Schedule timeout
  scheduleWaveTimeout(wave.id, wave.endsAt.getTime() - Date.now(), client);

  return true;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function scheduleWaveTimeout(waveId: string, delayMs: number, client: Client): void {
  if (activeTimers.has(waveId)) {
    log.warn(`Wave ${waveId} already has an active timer — skipping duplicate.`);
    return;
  }
  const timer = setTimeout(() => processWaveCompletion(waveId, client), Math.max(0, delayMs));
  activeTimers.set(waveId, timer);
}

/**
 * Called when a wave's timer fires. Idempotency is guaranteed by `claimWaveForProcessing`
 * which atomically transitions the wave from Active → Processing.
 */
async function processWaveCompletion(waveId: string, client: Client): Promise<void> {
  activeTimers.delete(waveId);

  let wave: Awaited<ReturnType<typeof claimWaveForProcessing>>;
  try {
    wave = await claimWaveForProcessing(waveId);
  } catch (err) {
    log.error(`Failed to claim wave ${waveId}`, err);
    return;
  }

  if (!wave) {
    log.debug(`Wave ${waveId} already processed — skipping.`);
    return;
  }

  const { session } = wave;
  if (session.status !== "Active") {
    log.warn(`Session ${session.id} is no longer Active when wave ${waveId} expired.`);
    return;
  }

  // Disable the "Готов" button on the wave message
  await disableWaveButton(wave, client);

  if (wave.responses.length === 0) {
    log.info(`Wave ${waveId} (session ${session.id}): no responses. Advancing to next wave.`);
    await markWaveNoResponse(waveId);
    await postNoResponseMessage(session, wave.waveNumber, client);
    await startWave(session.id, client);
    return;
  }

  log.info(`Wave ${waveId}: ${wave.responses.length} response(s). Selecting best candidate.`);

  const winner = await selectBestResponder(wave, session);

  if (!winner) {
    // All responders left the pool between click and timeout (edge case)
    log.warn(`Wave ${waveId}: all responders ineligible at processing time. Advancing.`);
    await markWaveNoResponse(waveId);
    await postNoResponseMessage(session, wave.waveNumber, client);
    await startWave(session.id, client);
    return;
  }

  await markSessionCompleted(session.id, winner.playerId, winner.poolEntryId);
  await postWinnerMessage(session, winner, client);

  log.info(
    `Session ${session.id} completed. Winner: ${winner.nick} (subScore=${winner.subScore.toFixed(3)})`
  );
}

// ── Discord message helpers ───────────────────────────────────────────────────

async function getTextChannel(
  channelId: string,
  client: Client
): Promise<TextChannel | null> {
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch?.isTextBased() && "send" in ch) return ch as TextChannel;
  } catch (err) {
    log.error(`Cannot fetch channel ${channelId}`, err);
  }
  return null;
}

async function postWaveMessage(
  session: { channelId: string; teamName: string; neededRole: number },
  wave: { id: string; endsAt: Date; waveNumber: number },
  batch: Array<{ player: { discordId?: string | null; nick: string } }>,
  client: Client
): Promise<string | null> {
  const channel = await getTextChannel(session.channelId, client);
  if (!channel) return null;

  // Build mentions for players who have a linked Discord account
  const mentions = batch
    .map((e) => (e.player as { discordId?: string | null }).discordId)
    .filter((id): id is string => !!id)
    .map((id) => `<@${id}>`)
    .join(" ");

  const unlinked = batch.filter(
    (e) => !(e.player as { discordId?: string | null }).discordId
  ).length;

  const embed = buildWaveEmbed({
    teamName: session.teamName,
    neededRole: session.neededRole,
    waveNumber: wave.waveNumber,
    totalPinged: batch.length,
    waveId: wave.id,
    endsAt: wave.endsAt,
  });

  const row = buildReadyButton(wave.id);

  try {
    const content = [
      mentions,
      unlinked > 0
        ? `*(${unlinked} игроков без привязки Discord — свяжитесь с администратором)*`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const msg = await channel.send({ content, embeds: [embed], components: [row] });
    return msg.id;
  } catch (err) {
    log.error("Failed to send wave message", err);
    return null;
  }
}

async function postWinnerMessage(
  session: {
    channelId: string;
    teamName: string;
    id: string;
    neededRole: number;
  },
  winner: {
    nick: string;
    mmr: number;
    subScore: number;
    roleFit: number;
    poolEntryId: string;
    discordId: string | null;
  },
  client: Client
): Promise<void> {
  const channel = await getTextChannel(session.channelId, client);
  if (!channel) return;

  const embed = buildWinnerEmbed({
    teamName: session.teamName,
    nick: winner.nick,
    mmr: winner.mmr,
    subScore: winner.subScore,
    roleFit: winner.roleFit,
    poolEntryId: winner.poolEntryId,
    discordId: winner.discordId,
  });

  // Ping the winner in the message content so they get a notification
  const mention = winner.discordId ? `<@${winner.discordId}>` : `**${winner.nick}**`;

  try {
    await channel.send({ content: mention, embeds: [embed] });
  } catch (err) {
    log.error("Failed to send winner message", err);
  }
}

async function postNoResponseMessage(
  session: { channelId: string; teamName: string },
  waveNumber: number,
  client: Client
): Promise<void> {
  const channel = await getTextChannel(session.channelId, client);
  if (!channel) return;

  try {
    await channel.send({ embeds: [buildNoResponseEmbed(session.teamName, waveNumber)] });
  } catch (err) {
    log.error("Failed to send no-response message", err);
  }
}

async function postExhaustedMessage(
  session: { channelId: string; teamName: string },
  client: Client
): Promise<void> {
  const channel = await getTextChannel(session.channelId, client);
  if (!channel) return;

  try {
    await channel.send({ embeds: [buildExhaustedEmbed(session.teamName)] });
  } catch (err) {
    log.error("Failed to send exhausted message", err);
  }
}

async function disableWaveButton(
  wave: { messageId: string | null; channelId: string },
  client: Client
): Promise<void> {
  if (!wave.messageId) return;

  const channel = await getTextChannel(wave.channelId, client);
  if (!channel) return;

  try {
    const msg = await channel.messages.fetch(wave.messageId);
    await msg.edit({ components: [buildDisabledReadyButton()] });
  } catch {
    // Message may have been deleted — not critical
    log.debug(`Could not disable button on message ${wave.messageId}`);
  }
}

/** Cancels the in-memory timer for a wave (called when session is cancelled). */
export function cancelWaveTimer(waveId: string): void {
  const timer = activeTimers.get(waveId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(waveId);
  }
}
