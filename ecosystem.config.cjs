const fs = require('fs');
const path = require('path');

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

      script: 'dist/index.js',
      env,
      autorestart: true,
      watch: false,

      kill_timeout: 15000,
      listen_timeout: 10000,
    },

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
