// @ts-nocheck
import { defineAddon, AddonContext } from '@arkenbot/addon-sdk';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string; avatar_url: string; html_url: string } | null;
  html_url: string;
}

interface GitHubPR {
  number: number;
  title: string;
  html_url: string;
  user: { login: string; avatar_url: string; html_url: string };
  body: string | null;
  created_at: string;
  draft: boolean;
}

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  user: { login: string; avatar_url: string; html_url: string };
  body: string | null;
  created_at: string;
  labels: Array<{ name: string; color: string }>;
  pull_request?: unknown; // present when the "issue" is actually a PR
}

interface GitHubRepo {
  default_branch: string;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GITHUB_API = 'https://api.github.com';

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function githubFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'ArkenBot-GitHub-Monitor/1.0',
      },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// Resolves the branch to use — if the configured branch yields no commits, falls
// back to the repo's actual default branch and caches it for future polls.
async function resolveDefaultBranch(
  ctx: AddonContext,
  guildId: string,
  owner: string,
  repo: string,
  configuredBranch: string,
): Promise<string> {
  const cacheKey = `default_branch:${owner}/${repo}`;
  const cached = await ctx.storage.get<string>(cacheKey, guildId);
  if (cached) return cached;

  const probe = await githubFetch<GitHubCommit[]>(
    `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(configuredBranch)}&per_page=1`,
  );
  if (probe && probe.length > 0) return configuredBranch;

  const repoInfo = await githubFetch<GitHubRepo>(`/repos/${owner}/${repo}`);
  const resolved = repoInfo?.default_branch ?? configuredBranch;
  if (resolved !== configuredBranch) {
    ctx.logger.info(`GitHub Monitor: branch "${configuredBranch}" not found for ${owner}/${repo}, using "${resolved}"`);
    await ctx.storage.set(cacheKey, resolved, guildId);
  }
  return resolved;
}

async function checkCommits(
  ctx: AddonContext,
  guildId: string,
  owner: string,
  repo: string,
  configuredBranch: string,
  channelId: string,
  force: boolean,
): Promise<void> {
  const branch = await resolveDefaultBranch(ctx, guildId, owner, repo, configuredBranch);
  const storageKey = `commits:${owner}/${repo}:${branch}`;
  const commits = await githubFetch<GitHubCommit[]>(
    `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=10`,
  );
  if (!commits || commits.length === 0) return;

  const lastSha = await ctx.storage.get<string>(storageKey, guildId);
  await ctx.storage.set(storageKey, commits[0].sha, guildId);

  if (lastSha === null && !force) {
    ctx.logger.info(`GitHub Monitor: initialized commit tracking for ${owner}/${repo}@${branch}`);
    return;
  }

  const newCommits: GitHubCommit[] = [];
  for (const commit of commits) {
    if (!force && commit.sha === lastSha) break;
    newCommits.push(commit);
  }
  if (newCommits.length === 0) return;

  const channel = ctx.client.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const toPost = newCommits.slice(0, force ? 3 : 5).reverse();
  for (const commit of toPost) {
    const [firstLine, ...bodyLines] = commit.commit.message.split('\n');
    const title = firstLine.slice(0, 100);
    const body = bodyLines.join('\n').trim().slice(0, 500);
    const authorName = commit.author?.login ?? commit.commit.author.name;
    const embed = new EmbedBuilder()
      .setTitle(`New commit: ${title}`)
      .setURL(commit.html_url)
      .setColor(0x2da44e)
      .addFields(
        { name: 'Repository', value: `[${owner}/${repo}](https://github.com/${owner}/${repo})`, inline: true },
        { name: 'Branch', value: branch, inline: true },
        { name: 'Author', value: authorName, inline: true },
        { name: 'SHA', value: `\`${commit.sha.slice(0, 7)}\``, inline: true },
      )
      .setTimestamp(new Date(commit.commit.author.date));
    if (body) embed.setDescription(body);
    if (commit.author?.avatar_url) embed.setThumbnail(commit.author.avatar_url);
    await channel.send({ embeds: [embed] }).catch(() => null);
  }

  if (newCommits.length > 5) {
    await channel
      .send(`...and ${newCommits.length - 5} more commit(s). [View all](https://github.com/${owner}/${repo}/commits/${branch})`)
      .catch(() => null);
  }
}

async function checkPRs(
  ctx: AddonContext,
  guildId: string,
  owner: string,
  repo: string,
  channelId: string,
  force: boolean,
): Promise<void> {
  const storageKey = `prs:${owner}/${repo}`;
  const prs = await githubFetch<GitHubPR[]>(
    `/repos/${owner}/${repo}/pulls?state=open&sort=created&direction=desc&per_page=10`,
  );
  if (!prs) return;

  const highestNum = prs.length > 0 ? prs[0].number : 0;
  const lastPRNum = await ctx.storage.get<number>(storageKey, guildId);
  await ctx.storage.set(storageKey, highestNum, guildId);

  if (lastPRNum === null && !force) {
    ctx.logger.info(`GitHub Monitor: initialized PR tracking for ${owner}/${repo}`);
    return;
  }

  const toPost = force
    ? prs.slice(0, 5).reverse()
    : prs.filter((pr) => pr.number > lastPRNum).slice(0, 5).reverse();
  if (toPost.length === 0) return;

  const channel = ctx.client.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  for (const pr of toPost) {
    const embed = new EmbedBuilder()
      .setTitle(`PR #${pr.number}: ${pr.title}`)
      .setURL(pr.html_url)
      .setColor(0x6e40c9)
      .addFields(
        { name: 'Repository', value: `[${owner}/${repo}](https://github.com/${owner}/${repo})`, inline: true },
        { name: 'Author', value: `[${pr.user.login}](${pr.user.html_url})`, inline: true },
        { name: 'Status', value: pr.draft ? 'Draft' : 'Open', inline: true },
      )
      .setTimestamp(new Date(pr.created_at))
      .setThumbnail(pr.user.avatar_url);
    if (pr.body) embed.setDescription(pr.body.slice(0, 300));
    await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

async function checkIssues(
  ctx: AddonContext,
  guildId: string,
  owner: string,
  repo: string,
  channelId: string,
  force: boolean,
): Promise<void> {
  const storageKey = `issues:${owner}/${repo}`;
  const items = await githubFetch<GitHubIssue[]>(
    `/repos/${owner}/${repo}/issues?state=open&sort=created&direction=desc&per_page=20`,
  );
  if (!items) return;

  // The issues endpoint returns PRs too — filter them out
  const issues = items.filter((i) => !i.pull_request);

  const highestNum = issues.length > 0 ? issues[0].number : 0;
  const lastIssueNum = await ctx.storage.get<number>(storageKey, guildId);
  await ctx.storage.set(storageKey, highestNum, guildId);

  if (lastIssueNum === null && !force) {
    ctx.logger.info(`GitHub Monitor: initialized issue tracking for ${owner}/${repo}`);
    return;
  }

  const toPost = force
    ? issues.slice(0, 5).reverse()
    : issues.filter((i) => i.number > lastIssueNum).slice(0, 5).reverse();
  if (toPost.length === 0) return;

  const channel = ctx.client.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  for (const issue of toPost) {
    const labelText = issue.labels.length
      ? issue.labels.map((l) => `\`${l.name}\``).join(' ')
      : null;
    const embed = new EmbedBuilder()
      .setTitle(`Issue #${issue.number}: ${issue.title}`)
      .setURL(issue.html_url)
      .setColor(0xe06c00)
      .addFields(
        { name: 'Repository', value: `[${owner}/${repo}](https://github.com/${owner}/${repo})`, inline: true },
        { name: 'Author', value: `[${issue.user.login}](${issue.user.html_url})`, inline: true },
      )
      .setTimestamp(new Date(issue.created_at))
      .setThumbnail(issue.user.avatar_url);
    if (labelText) embed.addFields({ name: 'Labels', value: labelText, inline: true });
    if (issue.body) embed.setDescription(issue.body.slice(0, 300));
    await channel.send({ embeds: [embed] }).catch(() => null);
  }
}

async function checkGuild(ctx: AddonContext, guildId: string, force = false): Promise<void> {
  const settings = await ctx.getSettings(guildId);
  const repos = (settings.repos as string) ?? '';
  const channelId = (settings.channelId as string) ?? '';
  const monitorCommits = (settings.monitorCommits as boolean) ?? true;
  const monitorPRs = (settings.monitorPRs as boolean) ?? true;
  const monitorIssues = (settings.monitorIssues as boolean) ?? true;
  const branch = (settings.branch as string) || 'main';

  if (!repos || !channelId) return;

  const repoList = repos
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.includes('/'));

  for (const repoPath of repoList) {
    const slashIdx = repoPath.indexOf('/');
    const owner = repoPath.slice(0, slashIdx);
    const repoName = repoPath.slice(slashIdx + 1);
    if (!owner || !repoName) continue;

    if (monitorCommits) {
      await checkCommits(ctx, guildId, owner, repoName, branch, channelId, force).catch((err) =>
        ctx.logger.error(`GitHub Monitor: commit check error for ${repoPath}: ${String(err)}`),
      );
    }
    if (monitorPRs) {
      await checkPRs(ctx, guildId, owner, repoName, channelId, force).catch((err) =>
        ctx.logger.error(`GitHub Monitor: PR check error for ${repoPath}: ${String(err)}`),
      );
    }
    if (monitorIssues) {
      await checkIssues(ctx, guildId, owner, repoName, channelId, force).catch((err) =>
        ctx.logger.error(`GitHub Monitor: issue check error for ${repoPath}: ${String(err)}`),
      );
    }
  }
}

async function pollAllGuilds(ctx: AddonContext): Promise<void> {
  for (const [guildId] of ctx.client.guilds.cache) {
    await checkGuild(ctx, guildId, false).catch((err) =>
      ctx.logger.error(`GitHub Monitor: error polling guild ${guildId}: ${String(err)}`),
    );
  }
}

export default defineAddon({
  manifest: {
    name: 'github-monitor',
    displayName: 'GitHub Monitor',
    version: '1.0.0',
    description:
      'Monitor public GitHub repositories for new commits, pull requests, and issues — no GitHub account, OAuth, or webhook access required. Uses polling via the public GitHub API.',
    author: 'ArkenBot',
    commands: ['github'],
    settings: [
      {
        key: 'repos',
        type: 'string',
        label: 'Repositories',
        description: 'Comma-separated list of public repos to monitor (e.g. torvalds/linux, microsoft/vscode)',
        required: false,
        default: '',
      },
      {
        key: 'channelId',
        type: 'channel',
        label: 'Notification Channel',
        description: 'Channel where notifications will be posted',
        required: true,
      },
      {
        key: 'monitorCommits',
        type: 'boolean',
        label: 'Monitor Commits',
        description: 'Post a notification when new commits are pushed',
        default: true,
      },
      {
        key: 'monitorPRs',
        type: 'boolean',
        label: 'Monitor Pull Requests',
        description: 'Post a notification when new pull requests are opened',
        default: true,
      },
      {
        key: 'monitorIssues',
        type: 'boolean',
        label: 'Monitor Issues',
        description: 'Post a notification when new issues are opened',
        default: true,
      },
      {
        key: 'branch',
        type: 'string',
        label: 'Branch',
        description: 'Branch to watch for commits (default: main — auto-detects if not found)',
        default: 'main',
        required: false,
      },
    ],
  },

  commands: [
    {
      data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('GitHub Monitor commands')
        .addSubcommand((sub) =>
          sub.setName('status').setDescription('Show the current GitHub Monitor configuration for this server'),
        )
        .addSubcommand((sub) =>
          sub.setName('check').setDescription('Show current open PRs, issues, and recent commits right now'),
        ),

      async execute(interaction, ctx) {
        if (!interaction.isChatInputCommand() || !interaction.guildId) return;
        const sub = interaction.options.getSubcommand();

        if (sub === 'status') {
          const repos = await ctx.getSetting<string>(interaction.guildId, 'repos', '');
          const channelId = await ctx.getSetting<string>(interaction.guildId, 'channelId', '');
          const monitorCommits = await ctx.getSetting<boolean>(interaction.guildId, 'monitorCommits', true);
          const monitorPRs = await ctx.getSetting<boolean>(interaction.guildId, 'monitorPRs', true);
          const monitorIssues = await ctx.getSetting<boolean>(interaction.guildId, 'monitorIssues', true);
          const branch = await ctx.getSetting<string>(interaction.guildId, 'branch', 'main');

          const repoList = repos.split(',').map((r) => r.trim()).filter(Boolean);
          const monitoring = [
            monitorCommits && 'Commits',
            monitorPRs && 'Pull Requests',
            monitorIssues && 'Issues',
          ].filter(Boolean).join(', ');

          const embed = new EmbedBuilder()
            .setTitle('GitHub Monitor — Status')
            .setColor(0x24292e)
            .addFields(
              {
                name: 'Repositories',
                value: repoList.length ? repoList.map((r) => `\`${r}\``).join('\n') : '_None configured_',
              },
              { name: 'Notification Channel', value: channelId ? `<#${channelId}>` : '_Not set_', inline: true },
              { name: 'Branch', value: branch, inline: true },
              { name: 'Monitoring', value: monitoring || '_Nothing_', inline: true },
              { name: 'Poll Interval', value: '5 minutes', inline: true },
            );

          await interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (sub === 'check') {
          await interaction.deferReply({ ephemeral: true });
          await checkGuild(ctx, interaction.guildId, true);
          await interaction.editReply('Done — current commits, open PRs, and open issues have been posted to the notification channel.');
        }
      },
    },
  ],

  hooks: {
    async onLoad(ctx) {
      ctx.logger.info('GitHub Monitor: loaded, starting 5-minute poll loop');
      setTimeout(() => pollAllGuilds(ctx), 15_000);
      pollTimer = setInterval(() => pollAllGuilds(ctx), POLL_INTERVAL_MS);
    },

    async onUnload(ctx) {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      ctx.logger.info('GitHub Monitor: unloaded, poll loop stopped');
    },

    async onSettingsUpdate(ctx, guildId, settings) {
      ctx.logger.info(`GitHub Monitor: settings updated for guild ${guildId} — next poll will apply new config`);
    },
  },
});
