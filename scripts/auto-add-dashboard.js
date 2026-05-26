const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const ECO_PATH = path.resolve('ecosystem.config.js');
let content = fs.readFileSync(ECO_PATH, 'utf-8');

// Extract values from existing bot config
const mongoMatch = content.match(/MONGODB_URI:\s*'([^']+)'/);
const tokenMatch = content.match(/DISCORD_TOKEN:\s*'([^']+)'/);

// Generate NEXTAUTH_SECRET
let nextauthSecret = 'your_nextauth_secret';
try {
  nextauthSecret = crypto.randomBytes(32).toString('base64');
} catch(e) {
  // fallback
}

const dashboardEntry = [
  '  },',
  '  {',
  "    name: 'tenchu-dashboard',",
  "    cwd: './dashboard',",
  "    script: 'node_modules/next/dist/bin/next',",
  "    args: 'start',",
  '    env: {',
  "      NODE_ENV: 'production',",
  "      PORT: '3001',",
  `      MONGODB_URI: '${mongoMatch ? mongoMatch[1] : 'YOUR_MONGODB_URI'}',`,
  `      DISCORD_BOT_TOKEN: '${tokenMatch ? tokenMatch[1] : 'YOUR_DISCORD_BOT_TOKEN'}',`,
  "      DISCORD_CLIENT_ID: 'YOUR_DISCORD_CLIENT_ID',",
  "      DISCORD_CLIENT_SECRET: 'YOUR_DISCORD_CLIENT_SECRET',",
  "      DISCORD_GUILD_ID: 'YOUR_DISCORD_GUILD_ID',",
  `      NEXTAUTH_SECRET: '${nextauthSecret}',`,
  "      NEXTAUTH_URL: 'http://localhost:3001',",
  '    },',
  "    error_file: 'logs/dashboard-error.log',",
  "    out_file: 'logs/dashboard-output.log',",
  "    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',",
  '    merge_logs: true,',
  "    max_memory_restart: '512M',",
  '    autorestart: true,',
  '    watch: false,',
  '    max_restarts: 10,',
  '    restart_delay: 5000,',
  '  }',
].join('\n');

// Find the last occurrence of '}]' in the file
const lastBracket = content.lastIndexOf('}]');
if (lastBracket === -1) {
  console.error('❌ Could not find apps array closing bracket');
  process.exit(1);
}

// Insert the dashboard entry before the last '}]'
const before = content.slice(0, lastBracket);
const after = content.slice(lastBracket);
const result = before + dashboardEntry + '\n' + after;

fs.writeFileSync(ECO_PATH, result);
console.log('✅ Dashboard entry added to ecosystem.config.js');
console.log('');
console.log('💡 To fill in remaining values: nano ecosystem.config.js');
console.log('🔑 Still need to fill in these 3 values:');
console.log('   Then find "YOUR_DISCORD_CLIENT_ID" and replace with your real values');
console.log('   (Client ID, Client Secret, Guild ID from Discord Developer Portal)');
console.log('');
console.log('✅ MONGODB_URI, DISCORD_BOT_TOKEN, and NEXTAUTH_SECRET were filled automatically.');
