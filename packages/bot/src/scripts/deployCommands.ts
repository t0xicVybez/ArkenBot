import "dotenv/config";
import {
  REST,
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from "discord.js";

type AnyCommandJSON =
  | RESTPostAPIChatInputApplicationCommandsJSONBody
  | RESTPostAPIContextMenuApplicationCommandsJSONBody;
import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { config } from "../config.js";
import type { BotCommand } from "../types.js";
import { localizeCommandJSON } from "../i18n/commandLocalizations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadLocalCommands() {
  const commands: AnyCommandJSON[] = [];
  const commandsPath = join(__dirname, "..", "commands");

  const categories = readdirSync(commandsPath).filter((dir) =>
    statSync(join(commandsPath, dir)).isDirectory()
  );

  for (const category of categories) {
    const categoryPath = join(commandsPath, category);
    const commandFiles = readdirSync(categoryPath).filter(
      (f) =>
        f.endsWith(".js") ||
        (f.endsWith(".ts") && !f.endsWith(".d.ts"))
    );

    for (const file of commandFiles) {
      const filePath = join(categoryPath, file);
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);
      const command: BotCommand = module.default ?? module.command;

      if (command?.data) {
        commands.push(localizeCommandJSON(command.data.toJSON()));
        console.log(`Found command: ${command.data.name}`);
      }
    }
  }

  return commands;
}

async function loadAddonCommands() {
  const commands: AnyCommandJSON[] = [];
  const addonsPath = join(__dirname, "../../../../addons");


  const addonDirs = readdirSync(addonsPath).filter((dir) =>
    statSync(join(addonsPath, dir)).isDirectory()
  );

  for (const addon of addonDirs) {
    const distPath = join(addonsPath, addon, "dist", "index.js");

    try {
      const fileUrl = pathToFileURL(distPath).href;
      const module = await import(fileUrl);
      const addonDef = module.default;

      if (!addonDef?.commands) continue;

      for (const cmd of addonDef.commands) {
        if (!cmd.data) continue;

        const json = cmd.data.toJSON();
        commands.push(json);

        console.log(`Found addon command: ${json.name}`);
      }
    } catch {
      // Ignore addons without dist builds
    }
  }

  return commands;
}

async function deployCommands() {
  const localCommands = await loadLocalCommands();
  const addonCommands = await loadAddonCommands();

  const allCommands: AnyCommandJSON[] = [...localCommands, ...addonCommands];

  const rest = new REST({ version: "10" }).setToken(config.discord.token);

  if (config.discord.guildId) {
    console.log(
      `Deploying ${allCommands.length} commands to guild ${config.discord.guildId}...`
    );
    await rest.put(
      Routes.applicationGuildCommands(
        config.discord.clientId,
        config.discord.guildId
      ),
      { body: allCommands }
    );
    console.log("Guild commands deployed!");
  } else {
    console.log(`Deploying ${allCommands.length} commands globally...`);
    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body: allCommands
    });
    console.log("Global commands deployed!");
  }
}

deployCommands().catch(console.error);
