import { orderPoolEntries, uniquePoolPlayers } from "../../lib/pool-order";

function entry(id: string, playerId: string, position: number | null, source = "admin_queue", joined = 0) {
  return { id, playerId, source, adminQueuePosition: position, joinTime: new Date(joined), createdAt: new Date(0) };
}

test("a returned player loses imported priority and joins the end of the queue", () => {
  const imported = entry("imported", "reserve", 93);
  const manual = entry("manual", "manual", null, "manual_add", 10);
  const returned = entry("returned", "replaced", 20, "returned", 20);

  expect(orderPoolEntries([returned, manual, imported])).toEqual([imported, manual, returned]);
});

test("duplicate active entries count as one candidate at the player's first queue position", () => {
  const first = entry("first", "same", 3);
  const duplicate = entry("duplicate", "same", 4);
  const second = entry("second", "other", 5);

  expect(uniquePoolPlayers(orderPoolEntries([second, duplicate, first]))).toEqual([first, second]);
});

test("an older return keeps its place behind the imported queue even with a duplicate import", () => {
  const duplicate = entry("duplicate", "replaced", 20);
  const reserve = entry("reserve", "reserve", 93);
  const legacyReturn = entry("returned", "replaced", 20, "admin_queue", 1000);

  expect(uniquePoolPlayers(orderPoolEntries([duplicate, legacyReturn, reserve]))).toEqual([reserve, legacyReturn]);
});
