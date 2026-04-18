import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

import * as searchSubstitution from "./search-substitution";
import * as linkPlayer from "./link-player";
import * as unlinkPlayer from "./unlink-player";
import * as cancelSearch from "./cancel-search";

export interface Command {
  data: Pick<SlashCommandBuilder, "name" | "toJSON">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [
  searchSubstitution as Command,
  linkPlayer as Command,
  unlinkPlayer as Command,
  cancelSearch as Command,
];

export const commandMap = new Map<string, Command>(
  commands.map((cmd) => [cmd.data.name, cmd])
);
