// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — ONE-SHOT GLOBAL COMMAND WIPE
// Run once with: npx ts-node src/clearGlobalCommands.ts
// This deletes all globally registered slash commands so stale ones stop
// appearing in servers the bot is not supposed to show them in.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const token    = process.env.BOT_TOKEN || '';
const clientId = process.env.CLIENT_ID || '';

if (!token || !clientId) {
  console.error('BOT_TOKEN or CLIENT_ID missing from .env');
  process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log('Wiping all global application commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('Done. All global commands cleared.');
    console.log('Deploy the bot normally now — guild commands will register on startup.');
  } catch (err) {
    console.error('Failed:', err);
  }
})();
