/**
 * Add tenchu-dashboard to existing ecosystem.config.js
 * 
 * Usage from bot repo root: node scripts/add-dashboard-to-eco.js
 * 
 * This reads your existing ecosystem.config.js and adds the
 * dashboard PM2 app entry. Original is backed up as .bak
 */

const fs = require('fs');
const path = require('path');

const ECO_PATH = path.resolve('ecosystem.config.js');

// The dashboard app entry to add
const DASHBOARD_APP = `
  {
    name: 'tenchu-dashboard',
    cwd: './dashboard',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: '3001',
      MONGODB_URI: 'your_mongodb_uri_here',
      DISCORD_CLIENT_ID: 'your_discord_client_id',
      DISCORD_CLIENT_SECRET: 'your_discord_client_secret',
      DISCORD_BOT_TOKEN: 'your_discord_bot_token',
      DISCORD_GUILD_ID: 'your_guild_id',
      NEXTAUTH_SECRET: 'your_nextauth_secret',
      NEXTAUTH_URL: 'http://localhost:3001',
    },
    error_file: 'logs/dashboard-error.log',
    out_file: 'logs/dashboard-output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '512M',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,
  }
`;

if (!fs.existsSync(ECO_PATH)) {
  console.error('❌ ecosystem.config.js not found in current directory');
  console.error('   Run this script from the bot repo root (where ecosystem.config.js is)');
  process.exit(1);
}

let content = fs.readFileSync(ECO_PATH, 'utf-8');

// Check if dashboard already exists
if (content.includes('tenchu-dashboard')) {
  console.log('⚠️  tenchu-dashboard app already exists in ecosystem.config.js');
  console.log('   No changes made.');
  process.exit(0);
}

// Backup original
fs.copyFileSync(ECO_PATH, ECO_PATH + '.bak');
console.log('✅ Backup created: ecosystem.config.js.bak');

// Find the apps array and add the dashboard entry
// Look for the closing ] of the apps array
const appsCloseMatch = content.match(/\]\s*\n\s*\]/);
// Actually simpler: look for the last ']' before the closing module.exports
// Let's find the closing bracket of the apps array

// Strategy: find the second-to-last ']' character (first is apps array close, last is module.exports close)
// But that's fragile. Let's use a regex approach.

// Find pattern: the last '],' or ']' before the closing of module.exports
const closeMatch = content.match(/\n(\s*\])\s*\n\s*\]/);
if (!closeMatch) {
  console.error('❌ Could not find apps array closing bracket');
  console.error('   Make sure ecosystem.config.js has the format: module.exports = { apps: [...] }');
  process.exit(1);
}

const insertPos = closeMatch.index;
const indent = closeMatch[1]; // The whitespace before ]

// Insert the dashboard app before the closing bracket
const before = content.slice(0, insertPos);
const after = content.slice(insertPos);

// If there's already content in the apps array, add a comma before our new entry
const lastAppLine = before.trimEnd();
const needsComma = lastAppLine.endsWith('}') || lastAppLine.endsWith('},');

const dashboardEntry = needsComma
  ? `,${DASHBOARD_APP}`
  : `${DASHBOARD_APP}`;

const newContent = before + dashboardEntry + after;

fs.writeFileSync(ECO_PATH, newContent, 'utf-8');
console.log('✅ tenchu-dashboard app added to ecosystem.config.js');
console.log('');
console.log('📝 Next steps:');
console.log('   1. Edit ecosystem.config.js with your real secrets');
console.log('   2. cd dashboard && npm install && npm run build');
console.log('   3. pm2 start ecosystem.config.js');
console.log('   4. pm2 save');
