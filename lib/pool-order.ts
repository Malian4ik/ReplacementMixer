type QueueEntry = {
  id: string;
  playerId: string;
  source: string;
  joinTime: Date;
  createdAt: Date;
  adminQueuePosition: number | null;
};

export function isImportedQueueEntry(entry: QueueEntry): boolean {
  // Older returns moved joinTime forward without clearing the imported source or position.
  return entry.source === "admin_queue" && entry.joinTime <= entry.createdAt;
}

export function orderPoolEntries<T extends QueueEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const positionA = isImportedQueueEntry(a) ? a.adminQueuePosition ?? Infinity : Infinity;
    const positionB = isImportedQueueEntry(b) ? b.adminQueuePosition ?? Infinity : Infinity;
    if (positionA !== positionB) return positionA - positionB;
    return a.joinTime.getTime() - b.joinTime.getTime() || a.id.localeCompare(b.id);
  });
}

export function uniquePoolPlayers<T extends QueueEntry>(entries: T[]): T[] {
  const localPlayers = new Set(entries.filter((entry) => !isImportedQueueEntry(entry)).map((entry) => entry.playerId));
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (localPlayers.has(entry.playerId) && isImportedQueueEntry(entry)) return false;
    if (seen.has(entry.playerId)) return false;
    seen.add(entry.playerId);
    return true;
  });
}
