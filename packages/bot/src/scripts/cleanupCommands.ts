

/**
 * CLI script: find and remove stale slash commands from Discord.
 *
 * Compares what's registered with Discord against the commands that actually
 * exist on disk, and deletes the leftovers (e.g. a command that was renamed or
 * removed). Runs as a DRY RUN by default — pass `--confirm` to actually delete,
 * and `--guild <id>` to also clean a specific guild's commands.
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { config } from '../config.js';
import type { BotCommand } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv    = process.argv.slice(2);
// Safety first: only delete when explicitly confirmed.
const DRY_RUN = !argv.includes('--confirm');

const extraGuildIds: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--guild' && argv[i + 1]) extraGuildIds.push(argv[++i]);
}

const R    = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM  = '\x1b[2m';
const RED  = '\x1b[31m';
const GRN  = '\x1b[32m';
const YLW  = '\x1b[33m';
const CYN  = '\x1b[36m';

const hr   = (len = 58) => '─'.repeat(len);
const bold = (s: string) => `${BOLD}${s}${R}`;
const dim  = (s: string) => `${DIM}${s}${R}`;
const red  = (s: string) => `${RED}${s}${R}`;
const grn  = (s: string) => `${GRN}${s}${R}`;
const ylw  = (s: string) => `${YLW}${s}${R}`;
const cyn  = (s: string) => `${CYN}${s}${R}`;

async function loadLocalCommandNames(): Promise<Set<string>> {
  const names        = new Set<string>();
  const commandsPath = join(__dirname, '..', 'commands');

  const categories = readdirSync(commandsPath).filter(dir =>
    statSync(join(commandsPath, dir)).isDirectory(),
  );

  for (const category of categories) {
    const categoryPath = join(commandsPath, category);
    const files = readdirSync(categoryPath).filter(
      f => f.endsWith('.js') || (f.endsWith('.ts') && !f.endsWith('.d.ts')),
    );

    for (const file of files) {
      try {
        const module = await import(pathToFileURL(join(categoryPath, file)).href);
        const command: BotCommand = module.default ?? module.command;
        if (command?.data) names.add(command.data.name);
      } catch {

      }
    }
  }

  return names;
}

async function loadAddonCommandNames(): Promise<Set<string>> {
  const names     = new Set<string>();
  const addonsDir = join(__dirname, '..', '..', '..', '..', 'addons');

  if (!existsSync(addonsDir)) return names;

  const addonDirs = readdirSync(addonsDir).filter(dir =>
    statSync(join(addonsDir, dir)).isDirectory(),
  );

  for (const addonDir of addonDirs) {
    const distPath = join(addonsDir, addonDir, 'dist', 'index.js');
    try {
      const module   = await import(pathToFileURL(distPath).href);
      const addonDef = module.default;
      if (!addonDef?.commands) continue;
      for (const cmd of addonDef.commands) {
        const name = cmd?.data?.name ?? cmd?.data?.toJSON?.()?.name;
        if (name) names.add(name);
      }
    } catch {

    }
  }

  return names;
}

interface RegisteredCommand {
  id:    string;
  name:  string;
  scope: 'global' | string;
}

async function fetchRegistered(
  rest:     REST,
  clientId: string,
  guildIds: string[],
): Promise<RegisteredCommand[]> {
  const result: RegisteredCommand[] = [];

  const globals = (await rest.get(Routes.applicationCommands(clientId))) as Array<{ id: string; name: string }>;
  for (const cmd of globals) result.push({ id: cmd.id, name: cmd.name, scope: 'global' });

  for (const guildId of guildIds) {
    try {
      const guildCmds = (await rest.get(
        Routes.applicationGuildCommands(clientId, guildId),
      )) as Array<{ id: string; name: string }>;
      for (const cmd of guildCmds) result.push({ id: cmd.id, name: cmd.name, scope: guildId });
    } catch (err) {
      console.log(`  ${ylw('⚠')}  Could not fetch guild ${guildId}: ${(err as Error).message}`);
    }
  }

  return result;
}

async function main() {
  console.log(`\n${bold(hr())}`);
  console.log(`${bold('  ArkenBot — Stale Command Cleanup')}`);
  console.log(`  Mode: ${DRY_RUN ? ylw('DRY RUN') + dim('  (pass --confirm to delete)') : red('LIVE — will delete')}`);
  console.log(`${bold(hr())}\n`);

  console.log(cyn('Scanning command definitions in source...'));
  const localNames = await loadLocalCommandNames();
  const addonNames = await loadAddonCommandNames();
  const knownNames = new Set([...localNames, ...addonNames]);

  console.log(`  Local commands : ${localNames.size}`);
  console.log(`  Addon commands : ${addonNames.size}`);
  console.log(`  Total known    : ${bold(String(knownNames.size))}\n`);

  const guildIds = [
    ...(config.discord.guildId ? [config.discord.guildId] : []),
    ...extraGuildIds,
  ].filter((v, i, a) => a.indexOf(v) === i);

  console.log(cyn('Fetching registered commands from Discord...'));
  const rest       = new REST({ version: '10' }).setToken(config.discord.token);
  const registered = await fetchRegistered(rest, config.discord.clientId, guildIds);

  const globalCount = registered.filter(c => c.scope === 'global').length;
  console.log(`  Global        : ${globalCount} registered`);
  for (const gid of guildIds) {
    const n = registered.filter(c => c.scope === gid).length;
    console.log(`  Guild ${gid}: ${n} registered`);
  }
  if (guildIds.length === 0) {
    console.log(dim('  (no DISCORD_GUILD_ID set — guild commands not checked)'));
  }

  const stale = registered.filter(c => !knownNames.has(c.name));

  console.log(`\n${bold(hr())}`);

  if (stale.length === 0) {
    console.log(`${grn(bold('  ✓ All clean — no stale commands found.'))}`);
    console.log(`${bold(hr())}\n`);
    return;
  }

  console.log(`${red(bold(`  STALE COMMANDS FOUND: ${stale.length}`))}`);
  console.log(`${bold(hr())}\n`);

  const byScope = new Map<string, RegisteredCommand[]>();
  for (const cmd of stale) {
    if (!byScope.has(cmd.scope)) byScope.set(cmd.scope, []);
    byScope.get(cmd.scope)!.push(cmd);
  }

  for (const [scope, cmds] of byScope) {
    const scopeLabel = scope === 'global'
      ? bold('GLOBAL')
      : `${bold('GUILD')}  ${dim(`[${scope}]`)}`;
    console.log(`  ${scopeLabel}`);

    for (const cmd of cmds) {
      const marker = DRY_RUN ? ylw('~') : red('✗');
      console.log(`    ${marker}  /${bold(cmd.name)}  ${dim(`id: ${cmd.id}`)}`);
    }
    console.log();
  }

  console.log(bold(hr()));

  if (DRY_RUN) {
    console.log(`${ylw(bold('  DRY RUN — nothing was changed.'))}`);
    console.log(`  Re-run with ${bold('--confirm')} to permanently delete the ${stale.length} command(s) listed above.`);
    console.log(`${bold(hr())}\n`);
    return;
  }

  console.log(`${red(bold(`  DELETING ${stale.length} stale command(s)...`))}\n`);

  let deleted = 0;
  let failed  = 0;

  for (const cmd of stale) {
    const location = cmd.scope === 'global' ? 'global' : `guild ${cmd.scope}`;
    try {
      if (cmd.scope === 'global') {
        await rest.delete(Routes.applicationCommand(config.discord.clientId, cmd.id));
      } else {
        await rest.delete(
          Routes.applicationGuildCommand(config.discord.clientId, cmd.scope, cmd.id),
        );
      }
      console.log(`  ${grn('✓')}  /${bold(cmd.name)}  ${dim(`(${location})`)}`);
      deleted++;
    } catch (err) {
      console.log(`  ${red('✗')}  /${bold(cmd.name)}  ${dim(`(${location})`)}  — ${red((err as Error).message)}`);
      failed++;
    }
  }

  console.log(`\n${bold(hr())}`);
  if (failed === 0) {
    console.log(`${grn(bold(`  ✓ Done. ${deleted} command(s) deleted.`))}`);
  } else {
    console.log(`${ylw(bold(`  Done. ${deleted} deleted, ${failed} failed.`))}`);
  }
  console.log(`${bold(hr())}\n`);
}

main().catch(err => {
  console.error(`\n${red('Fatal:')} ${err.message}`);
  process.exit(1);
});
