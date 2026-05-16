'use client';

import { Download, Gamepad2, FileCode, Terminal } from 'lucide-react';

const FIVEM_FILES = [
  {
    name: 'server.lua',
    description: 'HTTP bridge — handles commands from ArkenBot',
    url: 'https://raw.githubusercontent.com/t0xicVybez1/arkenbot-resources/main/fivem/server.lua',
  },
  {
    name: 'client.lua',
    description: 'Client-side event handlers (weapon equip, inventory sync)',
    url: 'https://raw.githubusercontent.com/t0xicVybez1/arkenbot-resources/main/fivem/client.lua',
  },
  {
    name: 'fxmanifest.lua',
    description: 'FiveM resource manifest',
    url: 'https://raw.githubusercontent.com/t0xicVybez1/arkenbot-resources/main/fivem/fxmanifest.lua',
  },
];

const FIVEM_STEPS = [
  <>Create a folder named <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">arkenbot</code> in your FiveM resources directory</>,
  'Download all three files above into that folder',
  <>Add the lines below to your <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">server.cfg</code></>,
  'Restart your FiveM server',
  <>Run <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">/fivem setup</code> in Discord with your server URL and token</>,
];

const GAME_SERVERS = [
  {
    name: 'Minecraft',
    icon: '⛏️',
    color: 'bg-green-500/20',
    iconColor: 'text-green-400',
    command: '/minecraft',
    framework: 'Java & Bedrock · Source RCON',
    steps: [
      <>Open <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">server.properties</code> and set:</>,
      null,
      <>Restart your Minecraft server, then run <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">/minecraft setup</code> in Discord</>,
    ],
    config: `enable-rcon=true
rcon.port=25575
rcon.password=your-rcon-password`,
  },
  {
    name: 'ARK: Survival Evolved',
    icon: '🦕',
    color: 'bg-yellow-500/20',
    iconColor: 'text-yellow-400',
    command: '/ark',
    framework: 'ARK · Source RCON',
    steps: [
      <>Open <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">GameUserSettings.ini</code> and add under <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">[ServerSettings]</code>:</>,
      null,
      <>Restart your ARK server, then run <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">/ark setup</code> in Discord</>,
    ],
    config: `RCONEnabled=True
RCONPort=27020
ServerAdminPassword=your-admin-password`,
  },
  {
    name: 'Rust',
    icon: '🔧',
    color: 'bg-red-500/20',
    iconColor: 'text-red-400',
    command: '/rust',
    framework: 'Rust · WebSocket RCON',
    steps: [
      'Add the following to your Rust server launch arguments:',
      null,
      <>Restart your Rust server, then run <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">/rust setup</code> in Discord</>,
    ],
    config: `+rcon.web 1 +rcon.port 28016 +rcon.password your-rcon-password`,
  },
  {
    name: 'Palworld',
    icon: '🌍',
    color: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    command: '/palworld',
    framework: 'Palworld · REST API',
    steps: [
      <>Open <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">PalWorldSettings.ini</code> and set:</>,
      null,
      <>Restart your Palworld server, then run <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">/palworld setup</code> in Discord</>,
    ],
    config: `RESTAPIEnabled=true
RESTAPIPort=8212
AdminPassword=your-admin-password`,
  },
];

export default function GameResourcesPage() {
  return (
    <div className="p-3 sm:p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center gap-3 mb-1">
          <Gamepad2 className="w-6 h-6 text-discord-blurple" />
          <h1 className="text-2xl font-bold text-white">Game Resources</h1>
        </div>
        <p className="text-gray-400 text-sm ml-9">
          Setup guides and download links for connecting ArkenBot to your game servers.
        </p>
      </div>

      {/* FiveM Card */}
      <div className="card">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Gamepad2 className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-base">FiveM Manager</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              Lightweight HTTP bridge resource for your FiveM server. Supports QBCore and ESX.
              Required for the{' '}
              <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">/fivem</code>{' '}
              slash command to work.
            </p>
          </div>
        </div>

        {/* Files */}
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Resource Files</p>
          <div className="space-y-2">
            {FIVEM_FILES.map((file) => (
              <div key={file.name} className="flex items-center justify-between bg-discord-darkest-bg rounded-md px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <FileCode className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div>
                    <p className="text-white text-sm font-medium font-mono">{file.name}</p>
                    <p className="text-gray-500 text-xs">{file.description}</p>
                  </div>
                </div>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary flex items-center gap-1.5 !py-1.5 !px-3 !text-xs flex-shrink-0"
                >
                  <Download className="w-3 h-3" />
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Setup steps */}
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Installation Steps</p>
          <ol className="space-y-2">
            {FIVEM_STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
                <span className="w-5 h-5 rounded-full bg-discord-blurple/20 text-discord-blurple text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-medium">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* server.cfg snippet */}
        <div className="bg-discord-darkest-bg rounded-md p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">server.cfg</p>
          <pre className="text-green-400 text-xs font-mono leading-relaxed whitespace-pre">{`set arkenbot_token "your-secret-token"
ensure arkenbot`}</pre>
        </div>
      </div>

      {/* Other game servers */}
      {GAME_SERVERS.map((game) => (
        <div key={game.name} className="card">
          <div className="flex items-start gap-4 mb-5">
            <div className={`w-10 h-10 rounded-lg ${game.color} flex items-center justify-center flex-shrink-0 text-xl`}>
              {game.icon}
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">{game.name}</h2>
              <p className="text-gray-400 text-sm mt-0.5">
                {game.framework} — use{' '}
                <code className="text-discord-blurple text-xs bg-discord-darkest-bg px-1 py-0.5 rounded">{game.command}</code>{' '}
                in Discord. No files to install on the server.
              </p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Setup Steps</p>
            <ol className="space-y-2">
              {game.steps.map((step, i) =>
                step === null ? null : (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <span className="w-5 h-5 rounded-full bg-discord-blurple/20 text-discord-blurple text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-medium">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                )
              )}
            </ol>
          </div>

          <div className="bg-discord-darkest-bg rounded-md p-3">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-3 h-3 text-gray-500" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Config</p>
            </div>
            <pre className="text-green-400 text-xs font-mono leading-relaxed whitespace-pre">{game.config}</pre>
          </div>
        </div>
      ))}
    </div>
  );
}
