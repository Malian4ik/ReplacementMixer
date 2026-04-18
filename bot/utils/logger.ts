type Level = "info" | "warn" | "error" | "debug";

function fmt(level: Level, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${msg}`;
  return meta !== undefined ? `${base} ${JSON.stringify(meta)}` : base;
}

export const log = {
  info: (msg: string, meta?: unknown) => console.log(fmt("info", msg, meta)),
  warn: (msg: string, meta?: unknown) => console.warn(fmt("warn", msg, meta)),
  error: (msg: string, meta?: unknown) => console.error(fmt("error", msg, meta)),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.BOT_DEBUG === "1") console.debug(fmt("debug", msg, meta));
  },
};
