import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load root .env for monorepo support (Next.js only reads its own package dir by default)
try {
  const envFile = readFileSync(resolve(__dirname, '../../.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {
  // .env not found, fall back to environment variables already set
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['cdn.discordapp.com', 'discordapp.com'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000',
  },
};

export default nextConfig;
