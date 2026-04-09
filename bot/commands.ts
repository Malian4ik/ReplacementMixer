import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const replacementSearchCommand = new SlashCommandBuilder()
  .setName("replacement-search")
  .setDescription("Запустить поиск замены для команды")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) =>
    option
      .setName("team")
      .setDescription("ID или точное название команды")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("replaced-player")
      .setDescription("ID или точный ник игрока, которого нужно заменить")
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("role")
      .setDescription("Нужная роль, если нужно заполнить пустой слот")
      .setRequired(false)
      .addChoices(
        { name: "R1", value: 1 },
        { name: "R2", value: 2 },
        { name: "R3", value: 3 },
        { name: "R4", value: 4 },
        { name: "R5", value: 5 }
      )
  )
  .addStringOption((option) =>
    option
      .setName("match-id")
      .setDescription("Необязательный идентификатор матча")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("comment")
      .setDescription("Необязательный комментарий для поиска")
      .setRequired(false)
  );

export const replacementActiveCommand = new SlashCommandBuilder()
  .setName("replacement-active")
  .setDescription("Показать активные сессии поиска замен")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const slashCommands = [replacementSearchCommand, replacementActiveCommand];
