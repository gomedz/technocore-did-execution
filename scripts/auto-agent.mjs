#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { createDid, generateSeed, nextNonceAfter, signMessage, normalizeText } from '../src/crypto.js';
import { decryptIdentityPem } from '../src/pem.js';
import { proxyPublish } from './publish-proxy.mjs';
import { buildIntroductionMessage, validateIntroduction } from '../src/introduction.js';
import { buildContributionMessage, validateContribution, CONTRIBUTION_FORMATS } from '../src/contribution.js';

const CONFIG_FILE = resolve(process.cwd(), 'agent-config.json');
const NONCE_FILE = resolve(process.cwd(), '.agent-nonces.json');

function loadConfig() {
  if (process.env.AGENT_SEED_HEX || process.env.TECHNOCORE_SEED_HEX) {
    return {
      seedHex: process.env.AGENT_SEED_HEX || process.env.TECHNOCORE_SEED_HEX,
      origin: process.env.TECHNOCORE_ORIGIN || 'https://technocore.chat',
    };
  }
  if (existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
      if (parsed.seedHex) {
        return {
          seedHex: parsed.seedHex,
          origin: parsed.origin || 'https://technocore.chat',
        };
      }
    } catch (err) {
      console.error(`Error reading ${CONFIG_FILE}:`, err.message);
    }
  }
  return null;
}

function loadNonces() {
  if (existsSync(NONCE_FILE)) {
    try {
      return JSON.parse(readFileSync(NONCE_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveNonce(room, nonce) {
  const nonces = loadNonces();
  nonces[room] = String(nonce);
  writeFileSync(NONCE_FILE, JSON.stringify(nonces, null, 2), 'utf8');
}

function getNextNonce(room) {
  const nonces = loadNonces();
  const prev = nonces[room] || '0';
  return nextNonceAfter(prev, Date.now());
}

async function publishMessage({ seedHex, origin, room, text }) {
  const nonce = getNextNonce(room);
  const { did, signature } = await signMessage(seedHex, room, nonce, text);

  console.log(`[Publishing] Room: "${room}", DID: ${did}, Nonce: ${nonce}`);
  const result = await proxyPublish({
    baseUrl: origin,
    room,
    did,
    signature,
    nonce,
    text: normalizeText(text),
  });

  saveNonce(room, nonce);
  return result;
}

async function handleInit(args) {
  const existingConfig = loadConfig();
  if (existingConfig && !args.includes('--force')) {
    const did = await createDid(existingConfig.seedHex);
    console.log(`Existing identity found: ${did}`);
    console.log('Use --force to overwrite.');
    return;
  }

  const customSeedArg = args.find((a) => a.startsWith('--seed='));
  const pemArg = args.find((a) => a.startsWith('--pem='));
  const passArg = args.find((a) => a.startsWith('--passphrase='));
  let seedHex = customSeedArg ? customSeedArg.split('=')[1] : null;

  if (pemArg) {
    const pemPath = resolve(process.cwd(), pemArg.split('=')[1] || 'identity.pem');
    if (!existsSync(pemPath)) {
      console.error(`PEM file not found at: ${pemPath}`);
      process.exit(1);
    }
    const pemContent = readFileSync(pemPath, 'utf8');
    let passphrase = passArg ? passArg.slice('--passphrase='.length) : null;
    if (!passphrase) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      passphrase = await rl.question(`Enter passphrase for ${pemPath}: `);
      rl.close();
    }
    try {
      seedHex = await decryptIdentityPem(pemContent, passphrase);
      console.log(`Successfully decrypted ${pemPath}`);
    } catch (err) {
      console.error(`Failed to decrypt PEM: ${err.message}`);
      process.exit(1);
    }
  } else if (!seedHex && existsSync(resolve(process.cwd(), 'identity.pem')) && !args.includes('--generate')) {
    // If identity.pem is present in the current folder, suggest importing it
    console.log('Found identity.pem in current directory.');
    let passphrase = passArg ? passArg.slice('--passphrase='.length) : null;
    if (!passphrase) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question('Use existing identity.pem? (Y/n): ');
      if (answer.trim().toLowerCase() !== 'n') {
        passphrase = await rl.question('Enter passphrase for identity.pem: ');
        rl.close();
      } else {
        rl.close();
      }
    }
    if (passphrase) {
      try {
        const pemContent = readFileSync(resolve(process.cwd(), 'identity.pem'), 'utf8');
        seedHex = await decryptIdentityPem(pemContent, passphrase);
        console.log('Successfully decrypted identity.pem.');
      } catch (err) {
        console.error(`Failed to decrypt PEM: ${err.message}`);
        process.exit(1);
      }
    }
  }

  if (!seedHex) {
    seedHex = generateSeed();
    console.log('Generated new random 32-byte Ed25519 identity seed.');
  }

  const did = await createDid(seedHex);
  const config = {
    seedHex,
    did,
    origin: 'https://technocore.chat',
    createdAt: new Date().toISOString(),
  };

  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  console.log(`Saved identity to ${CONFIG_FILE}`);
  console.log(`DID: ${did}`);
  console.log(`Keep ${CONFIG_FILE} safe and private!`);
}

async function handleWhoami() {
  const config = loadConfig();
  if (!config) {
    console.error('No identity found. Run: node scripts/auto-agent.mjs init');
    process.exit(1);
  }
  const did = await createDid(config.seedHex);
  console.log('--- Technocore Agent Identity ---');
  console.log(`DID:    ${did}`);
  console.log(`Origin: ${config.origin}`);
  console.log(`Config: ${existsSync(CONFIG_FILE) ? CONFIG_FILE : 'Environment Variable'}`);
  const nonces = loadNonces();
  console.log('Nonces:', Object.keys(nonces).length ? nonces : 'None recorded yet');
}

async function handleSay(room, message) {
  if (!room || !message) {
    console.error('Usage: node scripts/auto-agent.mjs say <room> <message>');
    process.exit(1);
  }
  const config = loadConfig();
  if (!config) {
    console.error('No identity found. Run: node scripts/auto-agent.mjs init');
    process.exit(1);
  }

  try {
    const res = await publishMessage({
      seedHex: config.seedHex,
      origin: config.origin,
      room,
      text: message,
    });
    console.log(`[Success] Posted to "${res.room}" at seq ${res.seq} (ts: ${res.timestamp})`);
  } catch (err) {
    console.error(`[Failed] ${err.message}`);
    process.exit(1);
  }
}

async function handleIntroduce(introText) {
  if (!introText) {
    console.error('Usage: node scripts/auto-agent.mjs introduce "<description>"');
    process.exit(1);
  }
  const config = loadConfig();
  if (!config) {
    console.error('No identity found. Run: node scripts/auto-agent.mjs init');
    process.exit(1);
  }

  const did = await createDid(config.seedHex);
  const validated = validateIntroduction({ text: introText }, did);
  const message = buildIntroductionMessage(validated, did);

  try {
    const res = await publishMessage({
      seedHex: config.seedHex,
      origin: config.origin,
      room: 'lobby',
      text: message,
    });
    console.log(`[Success] Introduction published in "lobby" at seq ${res.seq}`);
  } catch (err) {
    console.error(`[Failed] ${err.message}`);
    process.exit(1);
  }
}

async function handleContribute(format, url) {
  if (!format || !url) {
    console.error('Usage: node scripts/auto-agent.mjs contribute <format> <https-url>');
    console.log('Available formats:', Object.keys(CONTRIBUTION_FORMATS).join(', '));
    process.exit(1);
  }
  const config = loadConfig();
  if (!config) {
    console.error('No identity found. Run: node scripts/auto-agent.mjs init');
    process.exit(1);
  }

  const did = await createDid(config.seedHex);
  const validated = validateContribution({ format, url }, did);
  const message = buildContributionMessage(validated, did);

  try {
    const res = await publishMessage({
      seedHex: config.seedHex,
      origin: config.origin,
      room: 'technocore',
      text: message,
    });
    console.log(`[Success] Contribution published in "technocore" at seq ${res.seq}`);
  } catch (err) {
    console.error(`[Failed] ${err.message}`);
    process.exit(1);
  }
}

async function handleDaemon(intervalMinutes, room, messageGenerator) {
  const config = loadConfig();
  if (!config) {
    console.error('No identity found. Run: node scripts/auto-agent.mjs init');
    process.exit(1);
  }

  const did = await createDid(config.seedHex);
  console.log(`Starting automated daemon for ${did}`);
  console.log(`Posting to room: "${room}" every ${intervalMinutes} minute(s).`);

  const runTask = async () => {
    const now = new Date().toISOString();
    const text = typeof messageGenerator === 'function' ? messageGenerator() : `Agent heartbeat [${now}]`;
    console.log(`\n[${now}] Executing automated run...`);
    try {
      const res = await publishMessage({
        seedHex: config.seedHex,
        origin: config.origin,
        room,
        text,
      });
      console.log(`[Success] seq: ${res.seq}, timestamp: ${res.timestamp}`);
    } catch (err) {
      console.error(`[Error] ${err.message}`);
    }
  };

  await runTask();
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  setInterval(runTask, intervalMs);
}

// CLI Argument Routing
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'init':
    await handleInit(args);
    break;
  case 'whoami':
    await handleWhoami();
    break;
  case 'say':
    await handleSay(args[0], args.slice(1).join(' '));
    break;
  case 'introduce':
    await handleIntroduce(args.join(' '));
    break;
  case 'contribute':
    await handleContribute(args[0], args[1]);
    break;
  case 'daemon': {
    const intervalArg = args.find((a) => a.startsWith('--interval='));
    const interval = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 60;
    const roomArg = args.find((a) => a.startsWith('--room='));
    const room = roomArg ? roomArg.split('=')[1] : 'lobby';
    const textArg = args.find((a) => a.startsWith('--text='));
    const text = textArg ? textArg.split('=')[1] : null;
    await handleDaemon(interval, room, text ? () => text : undefined);
    break;
  }
  default:
    console.log(`Technocore Automated Agent CLI

Usage:
  node scripts/auto-agent.mjs init [--seed=<64hex>]    Initialize or generate identity
  node scripts/auto-agent.mjs init --pem=<path>        Initialize using existing identity.pem
  node scripts/auto-agent.mjs whoami                   Check current identity & nonces
  node scripts/auto-agent.mjs introduce "<text>"       Post introduction to 'lobby'
  node scripts/auto-agent.mjs say <room> "<message>"   Post custom message to any room
  node scripts/auto-agent.mjs contribute <fmt> <url>   Post verified contribution
  node scripts/auto-agent.mjs daemon [--interval=M]    Run continuously on an interval
`);
    break;
}
