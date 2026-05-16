const fs = require('fs');
const path = require('path');

// Parse root .env into an object for pm2 env injection
function loadEnv(envPath) {
  try {
    return Object.fromEntries(
      fs.readFileSync(envPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const idx = l.indexOf('=');
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const env = loadEnv(path.join(__dirname, '.env'));

module.exports = {
  apps: [
    {
      name: 'api',
      cwd: `${__dirname}/packages/api`,
      script: 'dist/index.js',
      env,
      autorestart: true,
      watch: false,
    },
    {
      name: 'bot',
      cwd: `${__dirname}/packages/bot`,
      // Use dist/index.js for single-process mode.
      // Switch to dist/shard.js (and set SHARD_COUNT env var) to enable sharding.
      script: 'dist/index.js',
      env,
      autorestart: true,
      watch: false,
      // Give the bot 15 s to release its Redis lock and disconnect cleanly before
      // PM2 force-kills it. Without this, PM2's default 1.6 s timeout kills the
      // process before the shutdown handler runs, leaving the lock held until its
      // 30 s TTL expires and potentially leaving a zombie if the signal is ignored.
      kill_timeout: 15000,
      listen_timeout: 10000,
    },
    // Uncomment below (and comment out the 'bot' entry above) to run in sharded mode:
    // {
    //   name: 'bot-sharded',
    //   cwd: `${__dirname}/packages/bot`,
    //   script: 'dist/shard.js',
    //   env: { ...env, SHARD_COUNT: 'auto' },
    //   autorestart: true,
    //   watch: false,
    // },
    {
      name: 'web',
      cwd: `${__dirname}/packages/web`,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env,
      autorestart: true,
      watch: false,
    },
  ],
};
