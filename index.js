/**
 * ELYSIUM Guild Attendance Bot - Version 2.8 (PRODUCTION READY)
 * 
 * ALL FEATURES + ALL OPTIMIZATIONS:
 * ✅ 25x faster attendance submission
 * ✅ Case-insensitive duplicate prevention
 * ✅ State recovery on restart
 * ✅ Clickable message links for pending verifications
 * ✅ Parallel thread creation (faster)
 * ✅ Batch reactions (faster)
 * ✅ Bulk message fetch (faster recovery)
 * ✅ Override commands (admin safety)
 * ✅ Help system (full documentation)
 * ✅ HTTP health check for Koyeb
 * ✅ Smart command routing (admin logs vs threads)
 * ✅ Admin fast-track check-in (skip screenshot, still verify)
 * ✅ Status with sorted thread links (oldest first with age)
 * ✅ Mass close all threads (!closeallthread)
 * ✅ Batch pending verification cleanup (5-10x faster)
 * ✅ Retry logic for failed submissions
 * ✅ Adaptive rate limiting with TIMING constants
 * ✅ Progress bars for long operations
 * ✅ Fixed close confirmation emoji bug
 * ✅ Reaction cleanup with retry logic (prevents restart issues)
 * ✅ Thread-wide reaction cleanup for mass close
 * ✅ Proper memory cleanup and state management
 * ✅ Guard against reactions on closed threads
 */

const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const levenshtein = require('fast-levenshtein');
const fs = require('fs');
const http = require('http');

const bidding = require('./bidding.js');

const config = JSON.parse(fs.readFileSync('./config.json'));
const bossPoints = JSON.parse(fs.readFileSync('./boss_points.json'));

// Timing constants
const TIMING = {
  MIN_SHEET_DELAY: 2000,        // 2 seconds between API calls
  OVERRIDE_COOLDOWN: 10000,      // 10 seconds between override commands
  CONFIRMATION_TIMEOUT: 30000,   // 30 seconds for user confirmations
  RETRY_DELAY: 5000,             // 5 seconds before retry
  MASS_CLOSE_DELAY: 3000,        // 3 seconds between thread processing
  REACTION_RETRY_ATTEMPTS: 3,    // Retry reaction cleanup 3 times
  REACTION_RETRY_DELAY: 1000     // 1 second between retry attempts
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ==========================================
// HTTP HEALTH CHECK SERVER FOR KOYEB
// ==========================================
const PORT = process.env.PORT || 8000;
const BOT_VERSION = '2.9';
const BOT_START_TIME = Date.now();

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      version: BOT_VERSION,
      uptime: process.uptime(),
      bot: client.user ? client.user.tag : 'not ready',
      activeSpawns: Object.keys(activeSpawns).length,
      pendingVerifications: Object.keys(pendingVerifications).length,
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Health check server listening on port ${PORT}`);
});

// ==========================================
// RUNTIME STATE
// ==========================================
let activeSpawns = {}; // threadId -> {boss, date, time, timestamp, members: [], confirmThreadId, closed}
let activeColumns = {}; // "boss|timestamp" -> threadId (for duplicate check)
let pendingVerifications = {}; // messageId -> {author, authorId, threadId, timestamp}
let pendingClosures = {}; // messageId -> {threadId, adminId, type: 'close'|'clearstate'|etc}
let confirmationMessages = {}; // threadId -> [messageIds] (for cleanup tracking)

// Rate limiting (using TIMING constants)
let lastSheetCall = 0;

// Override command cooldown
let lastOverrideTime = 0;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Get current timestamp in Manila timezone
 */
function getCurrentTimestamp() {
  const date = new Date();
  const dateStr = date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    year: '2-digit',
    month: 'numeric',
    day: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  return {
    date: dateStr,
    time: timeStr,
    full: `${dateStr} ${timeStr}`
  };
}

/**
 * Format uptime for display
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Remove all reactions from a message with retry logic
 * @param {Message} message - Discord message object
 * @param {number} attempts - Number of retry attempts (default: 3)
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function removeAllReactionsWithRetry(message, attempts = TIMING.REACTION_RETRY_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    try {
      await message.reactions.removeAll();
      console.log(`✅ Reactions removed from message ${message.id} (attempt ${i + 1})`);
      return true;
    } catch (err) {
      console.warn(`⚠️ Failed to remove reactions from ${message.id} (attempt ${i + 1}/${attempts}): ${err.message}`);
      
      if (i < attempts - 1) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, TIMING.REACTION_RETRY_DELAY));
      }
    }
  }
  
  console.error(`❌ Failed to remove reactions from ${message.id} after ${attempts} attempts`);
  return false;
}

/**
 * Remove all reactions from all messages in a thread
 * @param {ThreadChannel} thread - Discord thread object
 * @returns {Promise<{success: number, failed: number}>} - Cleanup statistics
 */
async function cleanupAllThreadReactions(thread) {
  try {
    console.log(`🧹 Cleaning up all reactions in thread: ${thread.name}`);
    
    // Fetch all messages (up to 100, which should cover most threads)
    const messages = await thread.messages.fetch({ limit: 100 }).catch(() => null);
    
    if (!messages) {
      console.warn(`⚠️ Could not fetch messages for thread ${thread.id}`);
      return { success: 0, failed: 0 };
    }
    
    let successCount = 0;
    let failCount = 0;
    
    // Process messages in batches to avoid rate limits
    for (const [msgId, msg] of messages) {
      // Skip if no reactions
      if (msg.reactions.cache.size === 0) continue;
      
      const success = await removeAllReactionsWithRetry(msg);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Small delay between messages to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`✅ Thread cleanup complete: ${successCount} success, ${failCount} failed`);
    return { success: successCount, failed: failCount };
    
  } catch (err) {
    console.error(`❌ Error cleaning thread reactions: ${err.message}`);
    return { success: 0, failed: 0 };
  }
}

/**
 * Fuzzy match boss name with error tolerance
 */
function findBossMatch(input) {
  const q = input.toLowerCase().trim();
  
  // Exact match first
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase() === q) return name;
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase() === q) return name;
    }
  }
  
  // Fuzzy match with levenshtein distance
  let best = {name: null, dist: 999};
  for (const name of Object.keys(bossPoints)) {
    const dist = levenshtein.get(q, name.toLowerCase());
    if (dist < best.dist) best = {name, dist};
    
    for (const alias of bossPoints[name].aliases || []) {
      const d2 = levenshtein.get(q, alias.toLowerCase());
      if (d2 < best.dist) best = {name, dist: d2};
    }
  }
  
  return best.dist <= 2 ? best.name : null;
}

/**
 * Check if user has admin role
 */
function isAdmin(member) {
  return member.roles.cache.some(r => config.admin_roles.includes(r.name));
}

/**
 * Parse thread name to extract spawn info
 */
function parseThreadName(name) {
  const match = name.match(/^\[(.*?)\s+(.*?)\]\s+(.+)$/);
  if (!match) return null;
  return {
    date: match[1],
    time: match[2],
    timestamp: `${match[1]} ${match[2]}`,
    boss: match[3]
  };
}

/**
 * Post to Google Sheets with rate limiting
 */
async function postToSheet(payload) {
  try {
    const now = Date.now();
    const timeSinceLastCall = now - lastSheetCall;
    if (timeSinceLastCall < TIMING.MIN_SHEET_DELAY) {
      const waitTime = TIMING.MIN_SHEET_DELAY - timeSinceLastCall;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastSheetCall = Date.now();
    
    const res = await fetch(config.sheet_webhook_url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    
    const text = await res.text();
    console.log(`📊 Sheet response: ${res.status} - ${text.substring(0, 200)}`);
    
    // Handle rate limiting with retry
    if (res.status === 429) {
      console.error('❌ Rate limit hit! Waiting 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, TIMING.RETRY_DELAY));
      return postToSheet(payload); // Retry
    }
    
    return {ok: res.ok, status: res.status, text};
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return {ok: false, err: err.toString()};
  }
}

/**
 * Check if column exists (hybrid: memory + sheet)
 */
async function checkColumnExists(boss, timestamp) {
  const key = `${boss}|${timestamp}`;
  
  // Check memory first (fast)
  if (activeColumns[key]) {
    console.log(`✅ Column exists in memory: ${key}`);
    return true;
  }
  
  // Fallback: Check sheet (slower but reliable)
  console.log(`🔍 Checking sheet for column: ${key}`);
  const resp = await postToSheet({
    action: 'checkColumn',
    boss,
    timestamp
  });
  
  if (resp.ok) {
    try {
      const data = JSON.parse(resp.text);
      return data.exists === true;
    } catch (e) {
      return false;
    }
  }
  
  return false;
}

// ==========================================
// SPAWN THREAD CREATION
// ==========================================

/**
 * Create spawn threads with @everyone mention
 * OPTIMIZED: Parallel thread creation for faster spawns
 */
async function createSpawnThreads(bossName, dateStr, timeStr, fullTimestamp, triggerSource) {
  const mainGuild = await client.guilds.fetch(config.main_guild_id).catch(() => null);
  if (!mainGuild) return;

  const attChannel = await mainGuild.channels.fetch(config.attendance_channel_id).catch(() => null);
  const adminLogs = await mainGuild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

  if (!attChannel || !adminLogs) {
    console.error('❌ Could not find channels');
    return;
  }

  // Check if column already exists (prevents duplicates)
  const columnExists = await checkColumnExists(bossName, fullTimestamp);
  if (columnExists) {
    console.log(`⚠️ Column already exists for ${bossName} at ${fullTimestamp}. Blocking spawn.`);
    await adminLogs.send(
      `⚠️ **BLOCKED SPAWN:** ${bossName} at ${fullTimestamp}\n` +
      `A column for this boss at this timestamp already exists. Close the existing thread first.`
    );
    return;
  }

  const threadTitle = `[${dateStr} ${timeStr}] ${bossName}`;

  // OPTIMIZED: Create both threads in parallel (saves ~1 second)
  const [attThread, confirmThread] = await Promise.all([
    attChannel.threads.create({
      name: threadTitle,
      autoArchiveDuration: config.auto_archive_minutes,
      reason: `Boss spawn: ${bossName}`
    }).catch(err => {
      console.error('❌ Failed to create attendance thread:', err);
      return null;
    }),
    adminLogs.threads.create({
      name: `✅ ${threadTitle}`,
      autoArchiveDuration: config.auto_archive_minutes,
      reason: `Confirmation thread: ${bossName}`
    }).catch(err => {
      console.error('❌ Failed to create confirmation thread:', err);
      return null;
    })
  ]);

  if (!attThread) return;

  // Store spawn info in memory
  activeSpawns[attThread.id] = {
    boss: bossName,
    date: dateStr,
    time: timeStr,
    timestamp: fullTimestamp,
    members: [],
    confirmThreadId: confirmThread ? confirmThread.id : null,
    closed: false
  };

  // Mark column as active in memory
  activeColumns[`${bossName}|${fullTimestamp}`] = attThread.id;

  // Post instructions with @everyone mention
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`🎯 ${bossName}`)
    .setDescription(`Boss detected! Please check in below.`)
    .addFields(
      {name: '📸 How to Check In', value: '1. Post `present` or `here`\n2. Attach a screenshot (admins exempt)\n3. Wait for admin ✅'},
      {name: '📊 Points', value: `${bossPoints[bossName].points} points`, inline: true},
      {name: '🕐 Time', value: timeStr, inline: true},
      {name: '📅 Date', value: dateStr, inline: true}
    )
    .setFooter({text: 'Admins: type "close" to finalize and submit attendance'})
    .setTimestamp();
  
  // Send @everyone mention with embed
  await attThread.send({
    content: '@everyone',
    embeds: [embed]
  });

  // Notify confirmation thread
  if (confirmThread) {
    await confirmThread.send(`🟨 **${bossName}** spawn detected (${fullTimestamp}). Verifications will appear here.`);
  }

  console.log(`✅ Created threads for ${bossName} at ${fullTimestamp} (${triggerSource})`);
}

// ==========================================
// STATE RECOVERY ON STARTUP
// ==========================================

/**
 * Scan existing threads and rebuild bot state
 * OPTIMIZED: Bulk message fetch for faster recovery
 */
async function recoverStateFromThreads() {
  try {
    console.log('🔄 Scanning for existing threads...');
    
    const mainGuild = await client.guilds.fetch(config.main_guild_id).catch(() => null);
    if (!mainGuild) {
      console.log('❌ Could not fetch main guild for state recovery');
      return;
    }

    const attChannel = await mainGuild.channels.fetch(config.attendance_channel_id).catch(() => null);
    const adminLogs = await mainGuild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

    if (!attChannel || !adminLogs) {
      console.log('❌ Could not fetch channels for state recovery');
      return;
    }

    let recoveredCount = 0;
    let pendingCount = 0;

    // Scan attendance channel threads
    const attThreads = await attChannel.threads.fetchActive().catch(() => null);
    if (!attThreads) {
      console.log('🔭 No active threads found to recover');
      return;
    }

    // OPTIMIZED: Collect all message fetch promises for bulk execution
    const threadDataPromises = [];
    
    for (const [threadId, thread] of attThreads.threads) {
      // Parse thread name: [10/22/25 14:30] Baron Braudmore
      const parsed = parseThreadName(thread.name);
      if (!parsed) continue;

      const bossName = findBossMatch(parsed.boss);
      if (!bossName) continue;

      threadDataPromises.push({
        thread,
        parsed,
        bossName,
        messagesPromise: thread.messages.fetch({ limit: 100 }).catch(() => null)
      });
    }

    // OPTIMIZED: Fetch all thread messages in parallel (2-3x faster)
    const threadDataResults = await Promise.all(
      threadDataPromises.map(async (data) => ({
        ...data,
        messages: await data.messagesPromise
      }))
    );

    // Fetch admin threads once
    const adminThreads = await adminLogs.threads.fetchActive().catch(() => null);

    // Process each thread
    for (const { thread, parsed, bossName, messages } of threadDataResults) {
      if (!messages) continue;

      // Skip archived threads (these are closed spawns)
      if (thread.archived) {
        console.log(`⏸️ Skipping archived thread: ${bossName} at ${parsed.timestamp}`);
        continue;
      }

      // Find matching confirmation thread
      let confirmThreadId = null;
      if (adminThreads) {
        for (const [id, adminThread] of adminThreads.threads) {
          if (adminThread.name === `✅ ${thread.name}`) {
            confirmThreadId = id;
            break;
          }
        }
      }

      // Scan thread messages to find verified members
      const members = [];
      
      for (const [msgId, msg] of messages) {
        // Look for verification messages from bot
        if (msg.author.id === client.user.id && msg.content.includes('verified by')) {
          const match = msg.content.match(/\*\*(.+?)\*\* verified by/);
          if (match) {
            members.push(match[1]);
          }
        }
        
// Look for pending verifications (messages with ✅ ❌ reactions from bot, no verification reply)
if (msg.reactions.cache.has('✅') && msg.reactions.cache.has('❌')) {
  // IMPROVED: Skip confirmation messages more reliably
  const isConfirmation = msg.content.includes('Close spawn') || 
                         msg.content.includes('close spawn') ||
                         msg.content.includes('React ✅ to confirm') ||
                         msg.content.includes('Clear all bot memory') ||
                         msg.content.includes('Force submit attendance') ||
                         msg.content.includes('MASS CLOSE ALL THREADS');
  
  if (isConfirmation) {
    console.log(`⏭️ Skipping confirmation message: ${msgId}`);
    continue;
  }
          
          const hasVerificationReply = messages.some(m => 
            m.reference?.messageId === msgId && m.author.id === client.user.id && m.content.includes('verified')
          );
          
          if (!hasVerificationReply) {
            // This is a pending verification
            const author = await mainGuild.members.fetch(msg.author.id).catch(() => null);
            const username = author ? (author.nickname || msg.author.username) : msg.author.username;
            
            pendingVerifications[msgId] = {
              author: username,
              authorId: msg.author.id,
              threadId: thread.id,
              timestamp: msg.createdTimestamp
            };
            pendingCount++;
          }
        }
      }

      // Rebuild spawn info
      activeSpawns[thread.id] = {
        boss: bossName,
        date: parsed.date,
        time: parsed.time,
        timestamp: parsed.timestamp,
        members: members,
        confirmThreadId: confirmThreadId,
        closed: false
      };

      // Mark column as active
      activeColumns[`${bossName}|${parsed.timestamp}`] = thread.id;

      recoveredCount++;
      console.log(`✅ Recovered: ${bossName} at ${parsed.timestamp} - ${members.length} verified, ${pendingCount} pending`);
    }

    if (recoveredCount > 0) {
      console.log(`🎉 State recovery complete! Recovered ${recoveredCount} spawn(s), ${pendingCount} pending verification(s)`);
      
      // Log to admin logs
      if (adminLogs) {
        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('🔄 Bot State Recovered')
          .setDescription(`Bot restarted and recovered existing threads`)
          .addFields(
            {name: 'Spawns Recovered', value: `${recoveredCount}`, inline: true},
            {name: 'Pending Verifications', value: `${pendingCount}`, inline: true}
          )
          .setTimestamp();
        
        await adminLogs.send({embeds: [embed]});
      }
    } else {
      console.log('🔭 No active threads found to recover');
    }

  } catch (err) {
    console.error('❌ Error during state recovery:', err);
  }
}

// ==========================================
// BOT READY EVENT
// ==========================================

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log(`📊 Tracking ${Object.keys(bossPoints).length} bosses`);
  console.log(`🏠 Main Guild: ${config.main_guild_id}`);
  console.log(`⏰ Timer Server: ${config.timer_server_id}`);
  console.log(`🤖 Version: ${BOT_VERSION}`);
  console.log(`⚙️ Timing: Sheet delay=${TIMING.MIN_SHEET_DELAY}ms, Retry attempts=${TIMING.REACTION_RETRY_ATTEMPTS}`);
  
  // Auto-recover state from existing threads
  recoverStateFromThreads();

  // Auto-recover bidding state
  bidding.recoverBiddingState(client, config);
});

// ==========================================
// HELP SYSTEM
// ==========================================

/**
 * Show help menu (contextual for members vs admins)
 */
async function showHelp(message, member, specificCommand = null) {
  const isAdminUser = isAdmin(member);

  // Specific command help
  if (specificCommand) {
    return showCommandHelp(message, specificCommand, isAdminUser);
  }

  // Main help menu
  if (isAdminUser) {
    // Admin help menu
    const embed = new EmbedBuilder()
    .setColor(0x4A90E2)
    .setTitle('🛡️ ELYSIUM Attendance Bot - Admin Commands')
    .setDescription('Complete command reference for administrators')
    .addFields(
      {
        name: '🎯 Spawn Management (Admin Logs Only)',
        value: '`!addthread` - Manually create spawn thread\n' +
               '`!clearstate` - Clear all bot memory (nuclear option)\n' +
               '`!status` - Show bot health and all active spawns\n' +
               '`!closeallthread` - Mass close all open spawns (auto-verify + submit)'
      },
      // ✅ ADD THIS FIELD
      {
        name: '🏆 Bidding System (Admin Logs)',
        value: '`!auction` - Add item to auction queue\n' +
               '`!startauction` - Start auction session\n' +
               '`!queuelist` - Show all queued items\n' +
               '`!removeitem` - Remove item from queue\n' +
               '`!dryrun on/off` - Toggle test mode\n' +
               '`!cancelauction` - Cancel all auctions\n' +
               '`!forcesync` - Sync points from sheet\n' +
               '`!resetbids` - Clear all bidding memory\n' +
               '`!help auction` for detailed docs'
      },
      {
        name: '💰 Bidding (Members - In Threads)',
        value: '`!bid <amount>` - Place bid in auction\n' +
               '`!mybids` - Show your bidding status\n' +
               '`!bidstatus` - Show auction system status'
      },
      {
        name: '🔒 Spawn Actions (Use in Spawn Thread)',
        value: '`close` - Close spawn and submit to Google Sheets\n' +
               '`!forceclose` - Force close without pending check\n' +
               '`!forcesubmit` - Submit attendance without closing\n' +
               '`!debugthread` - Show current thread state\n' +
               '`!resetpending` - Clear stuck pending verifications'
      },
        {
          name: '🎯 Spawn Management (Admin Logs Only)',
          value: '`!addthread` - Manually create spawn thread\n' +
                 '`!clearstate` - Clear all bot memory (nuclear option)\n' +
                 '`!status` - Show bot health and all active spawns\n' +
                 '`!closeallthread` - Mass close all open spawns (auto-verify + submit)'
        },
        {
          name: '🔒 Spawn Actions (Use in Spawn Thread)',
          value: '`close` - Close spawn and submit to Google Sheets\n' +
                 '`!forceclose` - Force close without pending check\n' +
                 '`!forcesubmit` - Submit attendance without closing\n' +
                 '`!debugthread` - Show current thread state\n' +
                 '`!resetpending` - Clear stuck pending verifications'
        },
{
          name: '✅ Verification (Use in Spawn Thread)',
          value: 'React ✅/❌ - Verify or deny member check-ins\n' +
                 '`!verify @member` - Manually verify without screenshot\n' +
                 '`!verifyall` - Bulk verify ALL pending members'
        },
        {
          name: '📖 Help',
          value: '`!help [command]` - Detailed help for specific command'
        }
      )
      .setFooter({text: `💡 Type !help addthread for examples • Version ${BOT_VERSION}`})
      .setTimestamp();

    await message.reply({embeds: [embed]});
  } else {
    // Member help menu
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('📚 ELYSIUM Attendance Bot - Member Commands')
      .setDescription('How to check in for boss spawns')
      .addFields(
        {
          name: '📸 Check-In Commands',
          value: '`present` / `here` / `join` / `checkin`\n' +
                 '└─ Check in for current boss spawn\n' +
                 '└─ Must attach screenshot (admins exempt)\n' +
                 '└─ Wait for admin verification (✅)'
        },
        {
          name: '📋 Need Help?',
          value: '• Contact an admin if you have issues\n' +
                 '• Make sure screenshot shows boss + timestamp\n' +
                 '• You can only check in once per spawn'
        }
      )
      .setFooter({text: `💡 Type !help for more info • Version ${BOT_VERSION}`})
      .setTimestamp();

    await message.reply({embeds: [embed]});
  }
}

/**
 * Show detailed help for specific command
 */
async function showCommandHelp(message, command, isAdmin) {
  const cmd = command.toLowerCase().replace('!', '');
  
  let embed;

  switch (cmd) {
    case 'addthread':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0x4A90E2)
        .setTitle('🔧 Command: !addthread')
        .setDescription('Manually create a boss spawn thread')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel only**'
          },
          {
            name: '📝 Syntax',
            value: '```!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)```'
          },
          {
            name: '💡 Examples',
            value: '```\n' +
                   '!addthread Baron Braudmore will spawn in 5 minutes! (2025-10-22 14:30)\n' +
                   '!addthread Larba will spawn in 10 minutes! (2025-10-22 18:00)\n' +
                   '```'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

case 'verifyall':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Command: !verifyall')
        .setDescription('Bulk verify all pending members in current thread')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Spawn thread only**'
          },
          {
            name: '📝 Syntax',
            value: '```!verifyall```'
          },
          {
            name: '✨ What It Does',
            value: '1. Shows all pending verifications\n' +
                   '2. Asks for confirmation\n' +
                   '3. Verifies ALL pending members at once\n' +
                   '4. Skips duplicates automatically\n' +
                   '5. Removes reactions from all messages\n' +
                   '6. Shows summary of verified members'
          },
          {
            name: '🎯 Use When',
            value: '• Multiple members waiting for verification\n' +
                   '• Need to quickly verify everyone\n' +
                   '• End of spawn event cleanup\n' +
                   '• Trust all pending members are legitimate'
          },
          {
            name: '⚠️ Important',
            value: '• Cannot be undone once confirmed\n' +
                   '• Duplicates are automatically skipped\n' +
                   '• Removes ALL pending verifications for thread'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'close':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0x4A90E2)
        .setTitle('🔒 Command: close')
        .setDescription('Close spawn thread and submit attendance to Google Sheets')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Spawn thread only**'
          },
          {
            name: '📝 Syntax',
            value: '```close```'
          },
          {
            name: '📖 Usage',
            value: '1. Type `close` in the spawn thread\n' +
                   '2. Bot checks for pending verifications\n' +
                   '3. If none pending, shows confirmation\n' +
                   '4. React ✅ to confirm submission'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'status':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0x4A90E2)
        .setTitle('📊 Command: !status')
        .setDescription('Show bot health, active spawns, and system statistics')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel only**'
          },
          {
            name: '📝 Syntax',
            value: '```!status```'
          },
          {
            name: '📊 Output Shows',
            value: '• Bot uptime and version\n' +
                   '• Active spawn threads with clickable links\n' +
                   '• Sorted oldest first with age indicators\n' +
                   '• Pending verifications count\n' +
                   '• Last sheet API call time'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'closeallthread':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle('🔥 Command: !closeallthread')
        .setDescription('Mass close all open spawn threads (auto-verify + submit all)')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel only**'
          },
          {
            name: '📝 Syntax',
            value: '```!closeallthread```'
          },
{
        name: '✨ What It Does',
        value: '1. Finds all open spawn threads\n' +
               '2. Auto-verifies ALL pending members in each thread\n' +
               '3. Posts closure message in spawn thread\n' +
               '4. Submits attendance to Google Sheets\n' +
               '5. Posts confirmation in confirmation thread\n' +
               '6. **Removes ALL reactions from ALL messages**\n' +
               '7. Archives threads and cleans up memory\n' +
               '8. Processes one by one with retry logic'
      },
          {
            name: '🎯 Use When',
            value: '• End of boss rush event\n' +
                   '• Multiple spawns left open\n' +
                   '• Need to bulk close everything\n' +
                   '• Clean up before maintenance'
          },
          {
            name: '⚠️ Important',
            value: '• Takes ~3-5 seconds per thread\n' +
                   '• Shows progress bar\n' +
                   '• Retries failed submissions once\n' +
                   '• Requires confirmation (React ✅)'
          },
          {
        name: '🧹 Cleanup Process',
        value: '• Removes reactions from up to 100 messages per thread\n' +
               '• Retries failed cleanups automatically\n' +
               '• Shows cleanup statistics in final summary\n' +
               '• Prevents restart detection issues'
      },
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'forcesubmit':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('🔧 Command: !forcesubmit')
        .setDescription('Submit attendance without closing thread')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Spawn thread only**'
          },
          {
            name: '📝 Syntax',
            value: '```!forcesubmit```'
          },
          {
            name: '🎯 Use When',
            value: '• Thread is broken but need to save data\n' +
                   '• Can\'t close normally\n' +
                   '• Want to submit without closing'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'debugthread':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0x4A90E2)
        .setTitle('🔍 Command: !debugthread')
        .setDescription('Show detailed state of current thread')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Spawn thread only**'
          },
          {
            name: '📝 Syntax',
            value: '```!debugthread```'
          },
          {
            name: '🎯 Use When',
            value: '• Thread seems stuck\n' +
                   '• Want to see what bot knows\n' +
                   '• Verifying state before closing'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'resetpending':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('🔧 Command: !resetpending')
        .setDescription('Clear stuck pending verifications for current thread')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Spawn thread only**'
          },
          {
            name: '📝 Syntax',
            value: '```!resetpending```'
          },
          {
            name: '🎯 Use When',
            value: '• Pending verifications won\'t clear\n' +
                   '• Can\'t close thread due to pending\n' +
                   '• Need to force close thread'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'clearstate':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔧 Command: !clearstate')
        .setDescription('⚠️ Clear all bot memory (nuclear option)')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel only**'
          },
          {
            name: '📝 Syntax',
            value: '```!clearstate```'
          },
          {
            name: '⚠️ Warning',
            value: '**This is a destructive command!**\n' +
                   'Clears all active spawns, pending verifications, etc.'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'present':
    case 'here':
    case 'checkin':
      embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('📸 Command: Check-In')
        .setDescription('Check in for current boss spawn')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Spawn thread only**'
          },
          {
            name: '📝 Syntax',
            value: '```present```\nor: `here`, `join`, `checkin`'
          },
          {
            name: '📋 Requirements',
            value: '• Must attach screenshot showing:\n' +
                   '  └─ Boss name\n' +
                   '  └─ Timestamp\n' +
                   '• Admins exempt from screenshot'
          },
          {
            name: '✨ What Happens',
            value: '1. Bot adds ✅ and ❌ reactions\n' +
                   '2. Your check-in appears in confirmation thread\n' +
                   '3. Admin verifies (✅) or denies (❌)\n' +
                   '4. You get confirmation message'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

case 'auction':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Command: !auction')
        .setDescription('Add item to auction queue')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel only**'
          },
          {
            name: '📝 Syntax',
            value: '```!auction <item name> <starting price> <duration in minutes>```'
          },
          {
            name: '💡 Examples',
            value: '```\n' +
                   '!auction Dragon Sword 100 30\n' +
                   '!auction GRAY DAWN LOAFERS - BARON 150 45\n' +
                   '!auction Magic Shield 50 20\n' +
                   '```'
          },
          {
            name: '✨ What It Does',
            value: '1. Adds item to auction queue\n' +
                   '2. Shows position in queue\n' +
                   '3. Wait for `!startauction` to begin\n' +
                   '4. Items are auctioned one-by-one'
          },
          {
            name: '⚠️ Notes',
            value: '• Item name can have spaces\n' +
                   '• Last two arguments are ALWAYS price and duration\n' +
                   '• Use `!queuelist` to see all queued items'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'startauction':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🚀 Command: !startauction')
        .setDescription('Start auction session (all queued items)')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel only**'
          },
          {
            name: '📝 Syntax',
            value: '```!startauction```'
          },
          {
            name: '✨ What It Does',
            value: '1. Shows confirmation with all queued items\n' +
                   '2. Creates threads for each item (one-by-one)\n' +
                   '3. 20-second preview before bidding starts\n' +
                   '4. Automatic "going once, going twice" announcements\n' +
                   '5. Auto-extends by 1 min if bid placed in last minute'
          },
          {
            name: '⏱️ Timeline',
            value: '• 20s preview per item\n' +
                   '• Auction duration per item\n' +
                   '• 20s buffer between items\n' +
                   '• Auto-submit results to Google Sheets when done'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'bid':
      embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('💰 Command: !bid')
        .setDescription('Place bid in active auction')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Bidding thread only** (during active auction)'
          },
          {
            name: '📝 Syntax',
            value: '```!bid <amount>```'
          },
          {
            name: '💡 Examples',
            value: '```\n!bid 150\n!bid 200\n!bid 500\n```'
          },
          {
            name: '✨ How It Works',
            value: '1. Type `!bid <amount>` in auction thread\n' +
                   '2. Bot shows confirmation with ✅/❌\n' +
                   '3. Click ✅ to confirm bid (30 second timeout)\n' +
                   '4. Your points are locked until outbid\n' +
                   '5. If outbid, points return automatically'
          },
          {
            name: '📊 Rules',
            value: '• Must bid HIGHER than current bid\n' +
                   '• Cannot bid same amount as current\n' +
                   '• Must have enough available points\n' +
                   '• Points locked across ALL active auctions\n' +
                   '• Bid in last minute extends timer by 1 min'
          },
          {
            name: '🎯 Tips',
            value: '• Use `!mybids` to see your locked points\n' +
                   '• Use `!bidstatus` to see current auction info'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'bidstatus':
      embed = new EmbedBuilder()
        .setColor(0x4A90E2)
        .setTitle('📊 Command: !bidstatus')
        .setDescription('Show auction system status')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Bidding thread** or **Admin logs channel**'
          },
          {
            name: '📝 Syntax',
            value: '```!bidstatus```'
          },
          {
            name: '📊 Shows',
            value: '• Queued items (waiting to auction)\n' +
                   '• Active auction details\n' +
                   '• Current high bid and winner\n' +
                   '• Time remaining\n' +
                   '• Total bids placed\n' +
                   '• Dry run mode status (if admin)'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'mybids':
      embed = new EmbedBuilder()
        .setColor(0x4A90E2)
        .setTitle('💳 Command: !mybids')
        .setDescription('Show your bidding status')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Bidding thread only**'
          },
          {
            name: '📝 Syntax',
            value: '```!mybids```'
          },
          {
            name: '📊 Shows',
            value: '• Current auction item\n' +
                   '• Your locked points (reserved in bids)\n' +
                   '• Winning status (✅ if you\'re winning)\n' +
                   '• Your current bid amount\n' +
                   '• Time remaining'
          },
          {
            name: '💡 Use When',
            value: '• Want to check if you\'re still winning\n' +
                   '• Need to know available points\n' +
                   '• Verify your bid went through'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'dryrun':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('🧪 Command: !dryrun')
        .setDescription('Toggle test mode for bidding system')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel only**'
          },
          {
            name: '📝 Syntax',
            value: '```!dryrun on\n!dryrun off```'
          },
          {
            name: '🧪 Dry Run Mode (ON)',
            value: '• Uses TestBiddingPoints sheet (fake data)\n' +
                   '• No real points deducted\n' +
                   '• Results saved to test sheet\n' +
                   '• Perfect for testing with members'
          },
          {
            name: '💰 Live Mode (OFF)',
            value: '• Uses real BiddingPoints sheet\n' +
                   '• Real points deducted from winners\n' +
                   '• Results saved to live sheet\n' +
                   '• Production mode'
          },
          {
            name: '⚠️ Important',
            value: '• Cannot toggle during active auction\n' +
                   '• Always test with dry run first!\n' +
                   '• Members can see dry run indicator'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'queuelist':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0x4A90E2)
        .setTitle('📋 Command: !queuelist')
        .setDescription('Show all queued auction items')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel only**'
          },
          {
            name: '📝 Syntax',
            value: '```!queuelist```'
          },
          {
            name: '📊 Shows',
            value: '• All queued items\n' +
                   '• Starting prices\n' +
                   '• Auction durations\n' +
                   '• Position in queue\n' +
                   '• Total estimated time'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'removeitem':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle('🗑️ Command: !removeitem')
        .setDescription('Remove item from auction queue')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel only**'
          },
          {
            name: '📝 Syntax',
            value: '```!removeitem <item name>```'
          },
          {
            name: '💡 Example',
            value: '```!removeitem Dragon Sword\n!removeitem GRAY DAWN LOAFERS - BARON```'
          },
          {
            name: '⚠️ Notes',
            value: '• Item name must match exactly (case-insensitive)\n' +
                   '• Cannot remove during active auction\n' +
                   '• Use `!queuelist` to see all items'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'cancelauction':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Command: !cancelauction')
        .setDescription('Cancel all active auctions')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Admin logs channel** or **Bidding thread**'
          },
          {
            name: '📝 Syntax',
            value: '```!cancelauction```'
          },
          {
            name: '⚠️ What It Does',
            value: '• Cancels current auction\n' +
                   '• Clears all queued items\n' +
                   '• Returns ALL locked points to members\n' +
                   '• Does NOT submit results to Google Sheets\n' +
                   '• Archives all auction threads'
          },
          {
            name: '🎯 Use When',
            value: '• Emergency stop needed\n' +
                   '• Bot malfunction\n' +
                   '• Need to restart auction system\n' +
                   '• Testing went wrong'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    case 'endauction':
      if (!isAdmin) {
        await message.reply('⚠️ This command is admin-only. Type `!help` for member commands.');
        return;
      }
      embed = new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle('⏹️ Command: !endauction')
        .setDescription('Force end current auction early')
        .addFields(
          {
            name: '📍 Where to Use',
            value: '**Bidding thread only** (active auction)'
          },
          {
            name: '📝 Syntax',
            value: '```!endauction```'
          },
          {
            name: '✨ What It Does',
            value: '1. Shows confirmation with current auction status\n' +
                   '2. Ends auction immediately (ignores timer)\n' +
                   '3. Declares current high bidder as winner\n' +
                   '4. Moves to next item in queue automatically\n' +
                   '5. Results submitted at end of session'
          },
          {
            name: '🎯 Use When',
            value: '• Need to speed up auction\n' +
                   '• Clear winner, no more bids expected\n' +
                   '• Technical issues with timer\n' +
                   '• Want to skip to next item'
          },
          {
            name: '⚠️ vs !cancelauction',
            value: '**!endauction** - Ends ONE auction, keeps winner, continues session\n' +
                   '**!cancelauction** - Cancels EVERYTHING, no winners, clears all'
          },
          {
            name: '💡 Note',
            value: '• Requires confirmation (✅/❌)\n' +
                   '• Cannot be undone\n' +
                   '• Winner gets the item at current bid price\n' +
                   '• 20-second buffer before next item starts'
          }
        )
        .setFooter({text: 'Type !help for full command list'});
      break;

    default:
      await message.reply(
        `❌ Unknown command: \`${command}\`\n\n` +
        `Type \`!help\` to see all available commands.`
      );
      return;
  }

  await message.reply({embeds: [embed]});
}

// ==========================================
// OVERRIDE COMMANDS
// ==========================================

/**
 * !clearstate - Clear all bot memory
 */
async function handleClearState(message, member) {
  const confirmMsg = await message.reply(
    `⚠️ **WARNING: Clear all bot memory?**\n\n` +
    `This will clear:\n` +
    `• ${Object.keys(activeSpawns).length} active spawn(s)\n` +
    `• ${Object.keys(pendingVerifications).length} pending verification(s)\n` +
    `• ${Object.keys(activeColumns).length} active column(s)\n\n` +
    `React ✅ to confirm or ❌ to cancel.`
  );
  
  await confirmMsg.react('✅');
  await confirmMsg.react('❌');
  
  const filter = (reaction, user) => {
    return ['✅', '❌'].includes(reaction.emoji.name) && user.id === member.user.id;
  };

  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: TIMING.CONFIRMATION_TIMEOUT, errors: ['time'] });
    const reaction = collected.first();

if (reaction.emoji.name === '✅') {
  activeSpawns = {};
  activeColumns = {};
  pendingVerifications = {};
  pendingClosures = {};
  confirmationMessages = {};  // ← NEW: Also clear confirmation tracking

  await message.reply(
    `✅ **State cleared successfully!**\n\n` +
    `All bot memory has been reset. Fresh start.`
  );
      
      console.log(`🔧 State cleared by ${member.user.username}`);
    } else {
      await message.reply('❌ Clear state canceled.');
    }
  } catch (err) {
    await message.reply('⏱️ Confirmation timed out. Clear state canceled.');
  }
}

/**
 * !forcesubmit - Submit without closing
 */
async function handleForceSubmit(message, member) {
  const spawnInfo = activeSpawns[message.channel.id];
  if (!spawnInfo) {
    await message.reply('⚠️ This thread is not in bot memory. Use !debugthread to check state.');
    return;
  }

  const confirmMsg = await message.reply(
    `📊 **Force submit attendance?**\n\n` +
    `**Boss:** ${spawnInfo.boss}\n` +
    `**Timestamp:** ${spawnInfo.timestamp}\n` +
    `**Members:** ${spawnInfo.members.length}\n\n` +
    `This will submit to Google Sheets WITHOUT closing the thread.\n\n` +
    `React ✅ to confirm or ❌ to cancel.`
  );

  await confirmMsg.react('✅');
  await confirmMsg.react('❌');

  // NEW: Track as pending closure for proper cleanup
  pendingClosures[confirmMsg.id] = {
    threadId: message.channel.id,
    adminId: message.author.id,
    type: 'forcesubmit'
  };
  
  const filter = (reaction, user) => {
    return ['✅', '❌'].includes(reaction.emoji.name) && user.id === member.user.id;
  };

  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: TIMING.CONFIRMATION_TIMEOUT, errors: ['time'] });
    const reaction = collected.first();

    if (reaction.emoji.name === '✅') {
      await message.channel.send(`📊 Submitting ${spawnInfo.members.length} members to Google Sheets...`);

      const payload = {
        action: 'submitAttendance',
        boss: spawnInfo.boss,
        date: spawnInfo.date,
        time: spawnInfo.time,
        timestamp: spawnInfo.timestamp,
        members: spawnInfo.members
      };

      const resp = await postToSheet(payload);

      if (resp.ok) {
        await message.channel.send(
          `✅ **Attendance submitted successfully!**\n\n` +
          `${spawnInfo.members.length} members recorded.\n` +
          `Thread remains open for additional verifications if needed.`
        );
        
        await removeAllReactionsWithRetry(confirmMsg);  // ← CHANGED from msg to confirmMsg
        delete pendingClosures[confirmMsg.id];  // ← CHANGED from msg to confirmMsg
        
        console.log(`🔧 Force submit: ${spawnInfo.boss} by ${member.user.username} (${spawnInfo.members.length} members)`);
      } else {
        await message.channel.send(
          `⚠️ **Failed to submit attendance!**\n\n` +
          `Error: ${resp.text || resp.err}\n\n` +
          `**Members list (for manual entry):**\n${spawnInfo.members.join(', ')}`
        );
        await removeAllReactionsWithRetry(confirmMsg);  // ← CHANGED from msg to confirmMsg
        delete pendingClosures[confirmMsg.id];  // ← CHANGED from msg to confirmMsg
      }
    } else {
      await message.reply('❌ Force submit canceled.');
      await removeAllReactionsWithRetry(confirmMsg);  // ← CHANGED from msg to confirmMsg
      delete pendingClosures[confirmMsg.id];  // ← CHANGED from msg to confirmMsg
    }
  } catch (err) {
    await message.reply('⏱️ Confirmation timed out. Force submit canceled.');
    await removeAllReactionsWithRetry(confirmMsg);  // ← ADD THIS LINE
    delete pendingClosures[confirmMsg.id];  // ← ADD THIS LINE
  }
}

/**
 * !status - Show bot health with sorted thread links
 */
async function handleStatus(message, member) {
  const guild = message.guild;
  const uptime = formatUptime(Date.now() - BOT_START_TIME);
  
  const timeSinceSheet = lastSheetCall > 0 
    ? `${Math.floor((Date.now() - lastSheetCall) / 1000)} seconds ago`
    : 'Never';

  const totalSpawns = Object.keys(activeSpawns).length;
  
  // OPTIMIZED: Sort by timestamp (oldest first)
  const activeSpawnEntries = Object.entries(activeSpawns);
  const sortedSpawns = activeSpawnEntries.sort((a, b) => {
    const parseTimestamp = (ts) => {
      const [date, time] = ts.split(' ');
      const [month, day, year] = date.split('/');
      const [hour, minute] = time.split(':');
      return new Date(`20${year}`, month - 1, day, hour, minute).getTime();
    };
    
    return parseTimestamp(a[1].timestamp) - parseTimestamp(b[1].timestamp);
  });
  
  // Build spawn list with age indicators
  const spawnList = sortedSpawns.slice(0, 10).map(([threadId, info], i) => {
    const spawnTime = (() => {
      const [date, time] = info.timestamp.split(' ');
      const [month, day, year] = date.split('/');
      const [hour, minute] = time.split(':');
      return new Date(`20${year}`, month - 1, day, hour, minute).getTime();
    })();
    
    const ageMs = Date.now() - spawnTime;
    const ageHours = Math.floor(ageMs / 3600000);
    const ageMinutes = Math.floor((ageMs % 3600000) / 60000);
    const ageText = ageHours > 0 ? `${ageHours}h ago` : `${ageMinutes}m ago`;
    
    return `${i + 1}. **${info.boss}** (${info.timestamp}) - ${info.members.length} verified - ${ageText} - <#${threadId}>`;
  });
  
  const spawnListText = spawnList.length > 0 ? spawnList.join('\n') : 'None';
  const moreSpawns = totalSpawns > 10 ? `\n\n*+${totalSpawns - 10} more spawns (sorted oldest first - close old ones first!)*` : '';

const embed = new EmbedBuilder()
  .setColor(0x00FF00)
  .setTitle('📊 Bot Status')
  .setDescription('✅ **Healthy**')
  .addFields(
    {name: '⏱️ Uptime', value: uptime, inline: true},
    {name: '🤖 Version', value: BOT_VERSION, inline: true},
    {name: '🎯 Active Spawns', value: `${totalSpawns}`, inline: true},
    {name: '📋 Recent Spawn Threads (Oldest First)', value: spawnListText + moreSpawns},
    {name: '⏳ Pending Verifications', value: `${Object.keys(pendingVerifications).length}`, inline: true},
    {name: '🔒 Pending Closures', value: `${Object.keys(pendingClosures).length}`, inline: true},  // ← NEW
    {name: '📊 Last Sheet Call', value: timeSinceSheet, inline: true},
    {name: '💾 Memory', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true}
  )
    .setFooter({text: `Requested by ${member.user.username} • Threads sorted by age (oldest first)`})
    .setTimestamp();

  await message.reply({embeds: [embed]});
}

/**
 * !debugthread - Show thread state
 */
async function handleDebugThread(message, member) {
  const threadId = message.channel.id;
  const spawnInfo = activeSpawns[threadId];

  if (!spawnInfo) {
    await message.reply(
      `⚠️ **Thread not in bot memory!**\n\n` +
      `This thread is not being tracked by the bot.\n` +
      `It may have been:\n` +
      `• Created before bot started\n` +
      `• Manually created without bot\n` +
      `• Cleared from memory\n\n` +
      `Try using \`!clearstate\` and restarting, or use \`!forceclose\` to close it.`
    );
    return;
  }

  const pendingInThread = Object.values(pendingVerifications).filter(
    p => p.threadId === threadId
  );

  const embed = new EmbedBuilder()
    .setColor(0x4A90E2)
    .setTitle('🔍 Thread Debug Info')
    .addFields(
      {name: '🎯 Boss', value: spawnInfo.boss, inline: true},
      {name: '⏰ Timestamp', value: spawnInfo.timestamp, inline: true},
      {name: '🔒 Closed', value: spawnInfo.closed ? 'Yes' : 'No', inline: true},
      {name: '✅ Verified Members', value: `${spawnInfo.members.length}`},
      {name: '👥 Member List', value: spawnInfo.members.join(', ') || 'None'},
      {name: '⏳ Pending Verifications', value: `${pendingInThread.length}`},
      {name: '📋 Confirmation Thread', value: spawnInfo.confirmThreadId ? `<#${spawnInfo.confirmThreadId}>` : 'None'},
      {name: '💾 In Memory', value: '✅ Yes'}
    )
    .setFooter({text: `Requested by ${member.user.username}`})
    .setTimestamp();

  await message.reply({embeds: [embed]});
}

/**
 * !resetpending - Clear pending verifications
 */
async function handleResetPending(message, member) {
  const threadId = message.channel.id;
  const pendingInThread = Object.keys(pendingVerifications).filter(
    msgId => pendingVerifications[msgId].threadId === threadId
  );

  if (pendingInThread.length === 0) {
    await message.reply('✅ No pending verifications in this thread.');
    return;
  }

  const confirmMsg = await message.reply(
    `⚠️ **Clear ${pendingInThread.length} pending verification(s)?**\n\n` +
    `This will remove all pending verifications for this thread.\n` +
    `Members will NOT be added to verified list.\n\n` +
    `React ✅ to confirm or ❌ to cancel.`
  );
  
  await confirmMsg.react('✅');
  await confirmMsg.react('❌');
  
  const filter = (reaction, user) => {
    return ['✅', '❌'].includes(reaction.emoji.name) && user.id === member.user.id;
  };

  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: TIMING.CONFIRMATION_TIMEOUT, errors: ['time'] });
    const reaction = collected.first();

    if (reaction.emoji.name === '✅') {
      pendingInThread.forEach(msgId => delete pendingVerifications[msgId]);

      await message.reply(
        `✅ **Cleared ${pendingInThread.length} pending verification(s).**\n\n` +
        `You can now close the thread.`
      );
      
      console.log(`🔧 Reset pending: ${threadId} by ${member.user.username} (${pendingInThread.length} cleared)`);
    } else {
      await message.reply('❌ Reset pending canceled.');
    }
  } catch (err) {
    await message.reply('⏱️ Confirmation timed out. Reset pending canceled.');
  }
}

/**
 * !closeallthread - Mass close all threads
 */
async function handleCloseAllThreads(message, member) {
  const guild = message.guild;
  
  const attChannel = await guild.channels.fetch(config.attendance_channel_id).catch(() => null);
  if (!attChannel) {
    await message.reply('❌ Could not find attendance channel.');
    return;
  }

  const attThreads = await attChannel.threads.fetchActive().catch(() => null);
  if (!attThreads || attThreads.threads.size === 0) {
    await message.reply('🔭 No active threads found in attendance channel.');
    return;
  }

  const openSpawns = [];
  for (const [threadId, thread] of attThreads.threads) {
    const spawnInfo = activeSpawns[threadId];
    if (spawnInfo && !spawnInfo.closed) {
      openSpawns.push({threadId, thread, spawnInfo});
    }
  }

  if (openSpawns.length === 0) {
    await message.reply('🔭 No open spawn threads found in bot memory.');
    return;
  }

  const confirmMsg = await message.reply(
    `⚠️ **MASS CLOSE ALL THREADS?**\n\n` +
    `This will:\n` +
    `• Verify ALL pending members in ALL threads\n` +
    `• Close and submit ${openSpawns.length} spawn thread(s)\n` +
    `• Process one thread at a time (to avoid rate limits)\n\n` +
    `**Threads to close:**\n` +
    openSpawns.map((s, i) => `${i + 1}. **${s.spawnInfo.boss}** (${s.spawnInfo.timestamp}) - ${s.spawnInfo.members.length} verified`).join('\n') +
    `\n\nReact ✅ to confirm or ❌ to cancel.\n\n` +
    `⏱️ This will take approximately ${openSpawns.length * 5} seconds.`
  );
  
  await confirmMsg.react('✅');
  await confirmMsg.react('❌');
  
  const filter = (reaction, user) => {
    return ['✅', '❌'].includes(reaction.emoji.name) && user.id === member.user.id;
  };

  try {
    const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: TIMING.CONFIRMATION_TIMEOUT, errors: ['time'] });
    const reaction = collected.first();

    if (reaction.emoji.name === '❌') {
      await message.reply('❌ Mass close canceled.');
      return;
    }

    await message.reply(
      `🔄 **Starting mass close...**\n\n` +
      `Processing ${openSpawns.length} thread(s) one by one...\n` +
      `Please wait, this may take a few minutes.`
    );

    let successCount = 0;
    let failCount = 0;
    const results = [];

// NEW: Track cleanup statistics
let totalReactionsRemoved = 0;
let totalReactionsFailed = 0;

for (let i = 0; i < openSpawns.length; i++) {
  const {threadId, thread, spawnInfo} = openSpawns[i];
  const operationStartTime = Date.now();
  
  try {
    const progress = Math.floor(((i + 1) / openSpawns.length) * 20);
    const progressBar = '█'.repeat(progress) + '░'.repeat(20 - progress);
    const progressPercent = Math.floor(((i + 1) / openSpawns.length) * 100);
        
        await message.channel.send(
          `📋 **[${i + 1}/${openSpawns.length}]** ${progressBar} ${progressPercent}%\n` +
          `Processing: **${spawnInfo.boss}** (${spawnInfo.timestamp})...`
        );

        // OPTIMIZED: Batch verify all pending
        const pendingInThread = Object.entries(pendingVerifications).filter(
          ([msgId, p]) => p.threadId === threadId
        );

        if (pendingInThread.length > 0) {
          await message.channel.send(
            `   ├─ Found ${pendingInThread.length} pending verification(s)... Auto-verifying all...`
          );

          const newMembers = pendingInThread
            .filter(([msgId, p]) => !spawnInfo.members.some(m => m.toLowerCase() === p.author.toLowerCase()))
            .map(([msgId, p]) => p.author);

          spawnInfo.members.push(...newMembers);

          const messageIds = pendingInThread.map(([msgId, p]) => msgId);
          const messagePromises = messageIds.map(msgId => 
            thread.messages.fetch(msgId).catch(() => null)
          );
          const fetchedMessages = await Promise.allSettled(messagePromises);

          const reactionPromises = fetchedMessages.map(result => {
            if (result.status === 'fulfilled' && result.value) {
              return result.value.reactions.removeAll().catch(() => {});
            }
            return Promise.resolve();
          });
          await Promise.allSettled(reactionPromises);

          pendingInThread.forEach(([msgId]) => delete pendingVerifications[msgId]);

          await message.channel.send(
            `   ├─ ✅ Auto-verified ${newMembers.length} member(s) (${pendingInThread.length - newMembers.length} were duplicates)`
          );
        }

// NEW: Post closure message in spawn thread (like normal close)
await thread.send(`🔒 Closing spawn **${spawnInfo.boss}** (${spawnInfo.timestamp})... Submitting ${spawnInfo.members.length} members to Google Sheets...`).catch(err => {
  console.warn(`⚠️ Could not post to spawn thread ${threadId}: ${err.message}`);
});

spawnInfo.closed = true;

await message.channel.send(
  `   ├─ 📊 Submitting ${spawnInfo.members.length} member(s) to Google Sheets...`
);

        const payload = {
          action: 'submitAttendance',
          boss: spawnInfo.boss,
          date: spawnInfo.date,
          time: spawnInfo.time,
          timestamp: spawnInfo.timestamp,
          members: spawnInfo.members
        };

        const resp = await postToSheet(payload);

if (resp.ok) {
  // NEW: Post success message in spawn thread
  await thread.send(`✅ Attendance submitted successfully! Archiving thread...`).catch(err => {
    console.warn(`⚠️ Could not post success to spawn thread ${threadId}: ${err.message}`);
  });
  
  // Post to confirmation thread before deleting it
  if (spawnInfo.confirmThreadId) {
    const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
    if (confirmThread) {
      await confirmThread.send(`✅ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members recorded`).catch(() => {});
      await confirmThread.delete().catch(() => {});
    }
  }

  // CRITICAL: Clean ALL reactions from thread before archiving
  await message.channel.send(`   ├─ 🧹 Cleaning up reactions from thread...`);
  const cleanupStats = await cleanupAllThreadReactions(thread);
  totalReactionsRemoved += cleanupStats.success;
  totalReactionsFailed += cleanupStats.failed;
  
  if (cleanupStats.failed > 0) {
    await message.channel.send(`   ├─ ⚠️ Warning: ${cleanupStats.failed} message(s) still have reactions`);
  }

  // Archive thread
  await thread.setArchived(true, `Mass close by ${member.user.username}`).catch(() => {});

  // IMPORTANT: Delete memory AFTER all operations complete
  delete activeSpawns[threadId];
  delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
  delete confirmationMessages[threadId];  // NEW: Clean up confirmation tracking

          successCount++;
          results.push(`✅ **${spawnInfo.boss}** - ${spawnInfo.members.length} members submitted`);
          
          await message.channel.send(
            `   └─ ✅ **Success!** Thread closed and archived.`
          );

          console.log(`🔒 Mass close: ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`);
        } else {
          console.warn(`⚠️ First attempt failed for ${spawnInfo.boss}, retrying in 5s...`);
          await message.channel.send(
            `   ├─ ⚠️ First attempt failed, retrying in 5 seconds...`
          );
          await new Promise(resolve => setTimeout(resolve, TIMING.RETRY_DELAY));
          
          const retryResp = await postToSheet(payload);
          
          if (retryResp.ok) {
            if (spawnInfo.confirmThreadId) {
              const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
              if (confirmThread) {
                await confirmThread.delete().catch(() => {});
              }
            }

            await thread.setArchived(true, `Mass close by ${member.user.username}`).catch(() => {});

            delete activeSpawns[threadId];
            delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];

            successCount++;
            results.push(`✅ **${spawnInfo.boss}** - ${spawnInfo.members.length} members submitted (retry succeeded)`);
            
            await message.channel.send(
              `   └─ ✅ **Success on retry!** Thread closed and archived.`
            );

            console.log(`🔒 Mass close (retry): ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`);
          } else {
            failCount++;
            results.push(`❌ **${spawnInfo.boss}** - Failed: ${retryResp.text || retryResp.err} (after retry)`);
            
            await message.channel.send(
              `   └─ ❌ **Failed after retry!** Error: ${retryResp.text || retryResp.err}\n` +
              `   Members: ${spawnInfo.members.join(', ')}`
            );
            
            console.error(`❌ Mass close failed (after retry) for ${spawnInfo.boss}:`, retryResp.text || retryResp.err);
          }
        }

        const operationTime = Date.now() - operationStartTime;
        const minDelay = TIMING.MASS_CLOSE_DELAY;
        const remainingDelay = Math.max(0, minDelay - operationTime);

        if (i < openSpawns.length - 1) {
          if (remainingDelay > 0) {
            await message.channel.send(`   ⏳ Waiting ${Math.ceil(remainingDelay / 1000)} seconds before next thread...`);
            await new Promise(resolve => setTimeout(resolve, remainingDelay));
          } else {
            await message.channel.send(`   ⏳ Operation took ${Math.ceil(operationTime / 1000)}s, proceeding immediately...`);
          }
        }

      } catch (err) {
        failCount++;
        results.push(`❌ **${spawnInfo.boss}** - Error: ${err.message}`);
        
        await message.channel.send(
          `   └─ ❌ **Error!** ${err.message}`
        );
        
        console.error(`❌ Mass close error for ${spawnInfo.boss}:`, err);
      }
    }

const summaryEmbed = new EmbedBuilder()
  .setColor(successCount === openSpawns.length ? 0x00FF00 : 0xFFA500)
  .setTitle('🎉 Mass Close Complete!')
  .setDescription(
    `**Summary:**\n` +
    `✅ Success: ${successCount}\n` +
    `❌ Failed: ${failCount}\n` +
    `📊 Total: ${openSpawns.length}`
  )
  .addFields(
    {
      name: '📋 Detailed Results',
      value: results.join('\n')
    },
    {
      name: '🧹 Cleanup Statistics',
      value: `✅ Reactions removed: ${totalReactionsRemoved}\n❌ Failed cleanups: ${totalReactionsFailed}`,
      inline: false
    }
  )
  .setFooter({text: `Executed by ${member.user.username}`})
  .setTimestamp();

    await message.reply({embeds: [summaryEmbed]});

    console.log(`🔧 Mass close complete: ${successCount}/${openSpawns.length} successful by ${member.user.username}`);

  } catch (err) {
    if (err.message === 'time') {
      await message.reply('⏱️ Confirmation timed out. Mass close canceled.');
    } else {
      await message.reply(`❌ Error during mass close: ${err.message}`);
      console.error('❌ Mass close error:', err);
    }
  }
}

// ==========================================
// MESSAGE HANDLER
// ==========================================

client.on(Events.MessageCreate, async (message) => {
  try {
    // Timer server spawn detection
    if (message.guild && message.guild.id === config.timer_server_id) {
      if (config.timer_channel_id && message.channel.id === config.timer_channel_id) {
        if (/will spawn in.*minutes?!/i.test(message.content)) {
          let detectedBoss = null;
          let timestamp = null;
          
          const timestampMatch = message.content.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/);
          if (timestampMatch) {
            timestamp = timestampMatch[1];
          }
          
          const matchBold = message.content.match(/[⚠️🔔⏰]*\s*\*\*(.*?)\*\*\s*will spawn/i);
          if (matchBold) {
            detectedBoss = matchBold[1].trim();
          } else {
            const matchEmoji = message.content.match(/[⚠️🔔⏰]+\s*([A-Za-z\s]+?)\s*will spawn/i);
            if (matchEmoji) {
              detectedBoss = matchEmoji[1].trim();
            } else {
              const matchPlain = message.content.match(/^([A-Za-z\s]+?)\s*will spawn/i);
              if (matchPlain) {
                detectedBoss = matchPlain[1].trim();
              }
            }
          }

          if (!detectedBoss) {
            console.log(`⚠️ Could not extract boss name from: ${message.content}`);
            return;
          }

          const bossName = findBossMatch(detectedBoss);
          if (!bossName) {
            console.log(`⚠️ Unknown boss: ${detectedBoss}`);
            return;
          }

          console.log(`🎯 Boss spawn detected: ${bossName} (from ${message.author.username})`);

          let dateStr, timeStr, fullTimestamp;
          
          if (timestamp) {
            const [datePart, timePart] = timestamp.split(' ');
            const [year, month, day] = datePart.split('-');
            dateStr = `${month}/${day}/${year.substring(2)}`;
            timeStr = timePart;
            fullTimestamp = `${dateStr} ${timeStr}`;
            console.log(`⏰ Using timestamp from timer: ${fullTimestamp}`);
          } else {
            const ts = getCurrentTimestamp();
            dateStr = ts.date;
            timeStr = ts.time;
            fullTimestamp = ts.full;
            console.log(`⏰ Using current timestamp: ${fullTimestamp}`);
          }

          await createSpawnThreads(bossName, dateStr, timeStr, fullTimestamp, 'timer');
        }
        return;
      }
    }

    if (message.author.bot) return;

    const guild = message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    const userIsAdmin = isAdmin(member);

    // ========== HELP COMMAND (ANYWHERE EXCEPT SPAWN THREADS) ==========
    if (message.content.toLowerCase().match(/^(!help|!commands|!\?)/)) {
      // Block help in spawn threads to keep them clean
      if (message.channel.isThread() && message.channel.parentId === config.attendance_channel_id) {
        await message.reply('⚠️ Please use `!help` in admin logs channel to avoid cluttering spawn threads.');
        return;
      }
      
      const args = message.content.split(/\s+/).slice(1);
      const specificCommand = args.length > 0 ? args.join(' ') : null;
      await showHelp(message, member, specificCommand);
      return;
    }

    // ========== MEMBER CHECK-IN (THREADS ONLY) ==========
    if (message.channel.isThread() && message.channel.parentId === config.attendance_channel_id) {
      const content = message.content.trim().toLowerCase();
      const parts = content.split(/\s+/);
      const keyword = parts[0];

      if (['present', 'here', 'join', 'checkin', 'check-in'].includes(keyword)) {
        const spawnInfo = activeSpawns[message.channel.id];
        
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply('⚠️ This spawn is closed. No more check-ins accepted.');
          return;
        }

        // Admins can skip screenshot but still need verification
        if (!userIsAdmin) {
          if (!message.attachments || message.attachments.size === 0) {
            await message.reply('⚠️ **Screenshot required!** Attach a screenshot showing boss and timestamp.');
            return;
          }
        }

        const username = member.nickname || message.author.username;
        const usernameLower = username.toLowerCase();
        const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === usernameLower);
        
        if (isDuplicate) {
          await message.reply(`⚠️ You already checked in for this spawn.`);
          return;
        }

        // OPTIMIZED: Add both reactions in parallel
        await Promise.all([
          message.react('✅'),
          message.react('❌')
        ]);

        pendingVerifications[message.id] = {
          author: username,
          authorId: message.author.id,
          threadId: message.channel.id,
          timestamp: Date.now()
        };

        const statusText = userIsAdmin 
          ? `⏩ **${username}** (Admin) registered for **${spawnInfo.boss}**\n\nFast-track verification (no screenshot required)...`
          : `⏳ **${username}** registered for **${spawnInfo.boss}**\n\nWaiting for admin verification...`;

        const embed = new EmbedBuilder()
          .setColor(userIsAdmin ? 0x00FF00 : 0xFFA500)
          .setDescription(statusText)
          .setFooter({text: 'Admins: React ✅ to verify, ❌ to deny'});

        await message.reply({embeds: [embed]});
        
        // Notify confirmation thread
        if (spawnInfo.confirmThreadId) {
          const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
          if (confirmThread) {
            const notifText = userIsAdmin 
              ? `⏩ **${username}** (Admin) - Fast-track check-in (no screenshot)`
              : `⏳ **${username}** - Pending verification`;
            await confirmThread.send(notifText);
          }
        }
        
        console.log(`📝 Pending: ${username} for ${spawnInfo.boss}${userIsAdmin ? ' (admin fast-track)' : ''}`);
        return;
      }

      // ========== ADMIN COMMANDS IN THREADS ==========
      if (!userIsAdmin) return;

      // Thread-specific override commands
      const threadOverrideCommands = ['!forcesubmit', '!debugthread', '!resetpending'];
      const cmd = message.content.trim().toLowerCase().split(/\s+/)[0];
      
      if (threadOverrideCommands.includes(cmd)) {
        // Check cooldown
        const now = Date.now();
        if (now - lastOverrideTime < TIMING.OVERRIDE_COOLDOWN) {
          const remaining = Math.ceil((TIMING.OVERRIDE_COOLDOWN - (now - lastOverrideTime)) / 1000);
          await message.reply(`⚠️ Please wait ${remaining} seconds between override commands.`);
          return;
        }

        lastOverrideTime = now;

        // Log usage
        console.log(`🔧 Override: ${cmd} used by ${member.user.username} in thread ${message.channel.id}`);
        
        const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id).catch(() => null);
        if (adminLogs) {
          await adminLogs.send(`🔧 **Override Command Used:** \`${cmd}\` by ${member.user.username} in thread <#${message.channel.id}>`);
        }

        switch (cmd) {
          case '!forcesubmit':
            await handleForceSubmit(message, member);
            break;
          case '!debugthread':
            await handleDebugThread(message, member);
            break;
          case '!resetpending':
            await handleResetPending(message, member);
            break;
        }
        return;
      }

// ========== ADMIN OVERRIDE: !verifyall (CHECK THIS FIRST) ==========
      if (message.content.trim().toLowerCase() === '!verifyall') {
        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply('⚠️ This spawn is closed or not found.');
          return;
        }

        // Get all pending verifications for this thread
        const pendingInThread = Object.entries(pendingVerifications).filter(
          ([msgId, p]) => p.threadId === message.channel.id
        );

        if (pendingInThread.length === 0) {
          await message.reply('ℹ️ No pending verifications in this thread.');
          return;
        }

        const confirmMsg = await message.reply(
          `⚠️ **Verify ALL ${pendingInThread.length} pending member(s)?**\n\n` +
          `This will automatically verify:\n` +
          pendingInThread.map(([msgId, p]) => `• **${p.author}**`).join('\n') +
          `\n\nReact ✅ to confirm or ❌ to cancel.`
        );

        await confirmMsg.react('✅');
        await confirmMsg.react('❌');

        const filter = (reaction, user) => {
          return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
        };

        try {
          const collected = await confirmMsg.awaitReactions({ 
            filter, 
            max: 1, 
            time: TIMING.CONFIRMATION_TIMEOUT, 
            errors: ['time'] 
          });
          const reaction = collected.first();

          if (reaction.emoji.name === '✅') {
            let verifiedCount = 0;
            let duplicateCount = 0;
            const verifiedMembers = [];

            // Process each pending verification
            for (const [msgId, pending] of pendingInThread) {
              // Check for duplicates (case-insensitive)
              const authorLower = pending.author.toLowerCase();
              const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === authorLower);

              if (!isDuplicate) {
                spawnInfo.members.push(pending.author);
                verifiedMembers.push(pending.author);
                verifiedCount++;
              } else {
                duplicateCount++;
              }

              // Remove reactions from the original message
              const originalMsg = await message.channel.messages.fetch(msgId).catch(() => null);
              if (originalMsg) {
                await removeAllReactionsWithRetry(originalMsg);
              }

              // Delete from pending
              delete pendingVerifications[msgId];
            }

            // Send summary
            await message.reply(
              `✅ **Verify All Complete!**\n\n` +
              `✅ Verified: ${verifiedCount}\n` +
              `⚠️ Duplicates skipped: ${duplicateCount}\n` +
              `📊 Total processed: ${pendingInThread.length}\n\n` +
              `**Verified members:**\n${verifiedMembers.join(', ') || 'None (all were duplicates)'}`
            );

            // Notify confirmation thread
            if (spawnInfo.confirmThreadId && verifiedCount > 0) {
              const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
              if (confirmThread) {
                await confirmThread.send(
                  `✅ **Bulk Verification by ${message.author.username}**\n` +
                  `Verified ${verifiedCount} member(s): ${verifiedMembers.join(', ')}`
                );
              }
            }

            console.log(`✅ Verify all: ${verifiedCount} verified, ${duplicateCount} duplicates for ${spawnInfo.boss} by ${message.author.username}`);
          } else {
            await message.reply('❌ Verify all canceled.');
          }

          await removeAllReactionsWithRetry(confirmMsg);
        } catch (err) {
          await message.reply('⏱️ Confirmation timed out. Verify all canceled.');
          await removeAllReactionsWithRetry(confirmMsg);
        }

        return;
      }

      // ========== ADMIN OVERRIDE: !verify @member (CHECK AFTER !verifyall) ==========
      if (message.content.startsWith('!verify')) {
        const mentioned = message.mentions.users.first();
        if (!mentioned) {
          await message.reply('⚠️ Usage: `!verify @member`\n💡 Type `!help verify` for details');
          return;
        }

        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply('⚠️ This spawn is closed or not found.');
          return;
        }

        const mentionedMember = await guild.members.fetch(mentioned.id).catch(() => null);
        const username = mentionedMember ? (mentionedMember.nickname || mentioned.username) : mentioned.username;
        
        const usernameLower = username.toLowerCase();
        const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === usernameLower);
        
        if (isDuplicate) {
          await message.reply(`⚠️ **${username}** is already verified for this spawn.`);
          return;
        }

        spawnInfo.members.push(username);

        await message.reply(`✅ **${username}** manually verified by ${message.author.username}`);
        
        if (spawnInfo.confirmThreadId) {
          const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
          if (confirmThread) {
            await confirmThread.send(`✅ **${username}** verified by ${message.author.username} (manual override)`);
          }
        }

        console.log(`✅ Manual verify: ${username} for ${spawnInfo.boss} by ${message.author.username}`);
        return;
      }

      // ========== ADMIN CLOSE COMMAND ==========
      if (message.content.trim().toLowerCase() === 'close') {
        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply('⚠️ This spawn is already closed or not found.');
          return;
        }

        const pendingInThread = Object.entries(pendingVerifications).filter(
          ([msgId, p]) => p.threadId === message.channel.id
        );

        if (pendingInThread.length > 0) {
          const pendingList = pendingInThread.map(([msgId, p]) => {
            const messageLink = `https://discord.com/channels/${guild.id}/${message.channel.id}/${msgId}`;
            return `• **${p.author}** - [View Message](${messageLink})`;
          }).join('\n');
          
          await message.reply(
            `⚠️ **Cannot close spawn!**\n\n` +
            `There are **${pendingInThread.length} pending verification(s)**:\n\n` +
            `${pendingList}\n\n` +
            `Please verify (✅) or deny (❌) all check-ins first, then type \`close\` again.\n\n` +
            `💡 Or use \`!resetpending\` to clear them, or \`!help close\` for more options.`
          );
          return;
        }

          const confirmMsg = await message.reply(
            `🔒 Close spawn **${spawnInfo.boss}** (${spawnInfo.timestamp})?\n\n` +
            `**${spawnInfo.members.length} members** will be submitted to Google Sheets.\n\n` +
            `React ✅ to confirm or ❌ to cancel.`
          );

          await confirmMsg.react('✅');
          await confirmMsg.react('❌');

          pendingClosures[confirmMsg.id] = {
            threadId: message.channel.id,
            adminId: message.author.id,
            type: 'close'  // ← ADDED: Track confirmation type
          };

          // Track this confirmation message for cleanup
          if (!confirmationMessages[message.channel.id]) {
            confirmationMessages[message.channel.id] = [];
          }
          confirmationMessages[message.channel.id].push(confirmMsg.id);
        
        return;
      }

      // ========== ADMIN FORCE CLOSE (EMERGENCY) ==========
      if (message.content.trim().toLowerCase() === '!forceclose') {
        const spawnInfo = activeSpawns[message.channel.id];
        if (!spawnInfo || spawnInfo.closed) {
          await message.reply('⚠️ This spawn is already closed or not found.');
          return;
        }

        // Clear any pending verifications for this thread
        const pendingInThread = Object.keys(pendingVerifications).filter(
          msgId => pendingVerifications[msgId].threadId === message.channel.id
        );
        pendingInThread.forEach(msgId => delete pendingVerifications[msgId]);

        // Force close without confirmation
        await message.reply(
          `⚠️ **FORCE CLOSING** spawn **${spawnInfo.boss}**...\n` +
          `Submitting ${spawnInfo.members.length} members (ignoring ${pendingInThread.length} pending verifications)`
        );
        
        spawnInfo.closed = true;

        const payload = {
          action: 'submitAttendance',
          boss: spawnInfo.boss,
          date: spawnInfo.date,
          time: spawnInfo.time,
          timestamp: spawnInfo.timestamp,
          members: spawnInfo.members
        };

        const resp = await postToSheet(payload);

        if (resp.ok) {
          await message.channel.send(`✅ Attendance submitted successfully! (${spawnInfo.members.length} members)`);
          
          // Delete confirmation thread
          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
            if (confirmThread) {
              await confirmThread.delete().catch(console.error);
              console.log(`🗑️ Deleted confirmation thread for ${spawnInfo.boss}`);
            }
          }

          // Archive thread
          await message.channel.setArchived(true, `Force closed by ${message.author.username}`).catch(console.error);

          // Clean up memory
          delete activeSpawns[message.channel.id];
          delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];

          console.log(`🔒 FORCE CLOSE: ${spawnInfo.boss} at ${spawnInfo.timestamp} by ${message.author.username} (${spawnInfo.members.length} members)`);
        } else {
          await message.channel.send(
            `⚠️ **Failed to submit attendance!**\n\n` +
            `Error: ${resp.text || resp.err}\n\n` +
            `**Members list (for manual entry):**\n${spawnInfo.members.join(', ')}\n\n` +
            `Please manually update the Google Sheet.`
          );
        }
        
        return;
      }

      return;
    }

    // ========== ADMIN-ONLY COMMANDS IN ADMIN LOGS ==========
    if (!userIsAdmin) return;
    
    // Check if in admin logs channel OR a thread within admin logs
    const inAdminLogs = message.channel.id === config.admin_logs_channel_id || 
                        (message.channel.isThread() && message.channel.parentId === config.admin_logs_channel_id);
    
    if (!inAdminLogs) return;

    // Admin logs override commands
    const adminLogsCommands = ['!clearstate', '!status', '!closeallthread'];
    const cmd = message.content.trim().toLowerCase().split(/\s+/)[0];
    
    if (adminLogsCommands.includes(cmd)) {
      // Check cooldown
const now = Date.now();
if (now - lastOverrideTime < TIMING.OVERRIDE_COOLDOWN) {
  const remaining = Math.ceil((TIMING.OVERRIDE_COOLDOWN - (now - lastOverrideTime)) / 1000);
  await message.reply(`⚠️ Please wait ${remaining} seconds between override commands.`);
  return;
}

lastOverrideTime = now;

      // Log usage
      console.log(`🔧 Override: ${cmd} used by ${member.user.username}`);
      
      const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id).catch(() => null);
      if (adminLogs) {
        await adminLogs.send(`🔧 **Override Command Used:** \`${cmd}\` by ${member.user.username}`);
      }

      switch (cmd) {
        case '!clearstate':
          await handleClearState(message, member);
          break;
        case '!status':
          await handleStatus(message, member);
          break;
        case '!closeallthread':
          await handleCloseAllThreads(message, member);
          break;
      }
      return;
    }

    // ========== MANUAL THREAD CREATION ==========
    if (message.content.startsWith('!addthread')) {
      const fullText = message.content.substring('!addthread'.length).trim();
      
      const timestampMatch = fullText.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/);
      if (!timestampMatch) {
        await message.reply(
          '⚠️ **Invalid format!**\n\n' +
          '**Usage:** `!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)`\n\n' +
          '**Example:** `!addthread Clemantis will spawn in 5 minutes! (2025-10-22 11:30)`\n\n' +
          '💡 Type `!help addthread` for more details'
        );
        return;
      }

      const timestampStr = timestampMatch[1];
      
      const bossMatch = fullText.match(/^(.+?)\s+will spawn/i);
      if (!bossMatch) {
        await message.reply(
          '⚠️ **Cannot detect boss name!**\n\n' +
          'Format: `!addthread [BossName] will spawn in X minutes! (YYYY-MM-DD HH:MM)`\n\n' +
          '💡 Type `!help addthread` for examples'
        );
        return;
      }

      const detectedBoss = bossMatch[1].trim();
      const bossName = findBossMatch(detectedBoss);
      
      if (!bossName) {
        await message.reply(
          `⚠️ **Unknown boss:** "${detectedBoss}"\n\n` +
          `**Available bosses:** ${Object.keys(bossPoints).join(', ')}\n\n` +
          `💡 Type \`!help addthread\` for details`
        );
        return;
      }

      const [datePart, timePart] = timestampStr.split(' ');
      const [year, month, day] = datePart.split('-');
      
      const dateStr = `${month}/${day}/${year.substring(2)}`;
      const timeStr = timePart;
      const fullTimestamp = `${dateStr} ${timeStr}`;

      console.log(`🔧 Manual spawn creation: ${bossName} at ${fullTimestamp} by ${message.author.username}`);

      await createSpawnThreads(bossName, dateStr, timeStr, fullTimestamp, 'manual');

      await message.reply(
        `✅ **Spawn thread created successfully!**\n\n` +
        `**Boss:** ${bossName}\n` +
        `**Time:** ${fullTimestamp}\n\n` +
        `Members can now check in!`
      );

      return;
    }
    // ========== BIDDING COMMANDS (CORRECTED ROUTING) ==========
    
    // Check if in bidding thread (for member + admin thread commands)
    const inBiddingThread = message.channel.isThread() && 
                           message.channel.parentId === config.bidding_channel_id;
    
    if (inBiddingThread) {
      const content = message.content.trim();
      const args = content.split(/\s+/).slice(1);
      const command = content.split(/\s+/)[0].toLowerCase();
      
      // MEMBER COMMANDS (inside bidding threads)
      if (command === '!bid') {
        await bidding.handleBidCommand(message, args, config);
        return;
      }
      
      if (command === '!bidstatus') {
        await bidding.handleBidStatusCommand(message, isAdmin(member));
        return;
      }
      
      if (command === '!mybids') {
        await bidding.handleMyBidsCommand(message);
        return;
      }
      
      // ADMIN COMMANDS (inside bidding threads)
      if (userIsAdmin) {
        if (command === '!endauction') {
          await bidding.handleEndAuctionCommand(message, client, config);
          return;
        }
        
        if (command === '!extendtime') {
          await bidding.handleExtendTimeCommand(message, args, client, config);
          return;
        }
        
        if (command === '!forcewinner') {
          await bidding.handleForceWinnerCommand(message, args);
          return;
        }
        
        if (command === '!cancelbid') {
          await bidding.handleCancelBidCommand(message, args);
          return;
        }
        
        if (command === '!debugauction') {
          await bidding.handleDebugAuctionCommand(message);
          return;
        }
        
        if (command === '!cancelauction') {
          await bidding.handleCancelAuctionCommand(message, client, config);
          return;
        }
      }
      
      // Don't process any other commands in bidding threads
      return;
    }
    
    // Check if in admin logs (for admin-only bidding setup commands)
    const inAdminLogsForBidding = message.channel.id === config.admin_logs_channel_id || 
                                  (message.channel.isThread() && message.channel.parentId === config.admin_logs_channel_id);
    
    if (inAdminLogsForBidding && userIsAdmin) {
      const content = message.content.trim();
      const args = content.split(/\s+/).slice(1);
      const command = content.split(/\s+/)[0].toLowerCase();
      
      // ADMIN SETUP COMMANDS (in admin logs channel)
      if (command === '!auction') {
        await bidding.handleAuctionCommand(message, args, config);
        return;
      }
      
      if (command === '!queuelist') {
        await bidding.handleQueueListCommand(message);
        return;
      }
      
      if (command === '!removeitem') {
        await bidding.handleRemoveItemCommand(message, args);
        return;
      }
      
      if (command === '!startauction') {
        await bidding.handleStartAuctionCommand(message, client, config);
        return;
      }
      
      if (command === '!dryrun') {
        await bidding.handleDryRunCommand(message, args);
        return;
      }
      
      if (command === '!clearqueue') {
        await bidding.handleClearQueueCommand(message);
        return;
      }
      
      if (command === '!forcesync') {
        await bidding.handleForceSyncCommand(message, config);
        return;
      }
      
      if (command === '!setbidpoints') {
        await bidding.handleSetBidPointsCommand(message, args);
        return;
      }
      
      if (command === '!resetbids') {
        await bidding.handleResetBidsCommand(message);
        return;
      }
    }
  } catch (err) {
    console.error('❌ Message handler error:', err);
  }
});

// ==========================================
// REACTION HANDLER
// ==========================================

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const msg = reaction.message;
    const guild = msg.guild;
    
    // NEW: Guard against reactions on closed threads
    if (msg.channel.isThread() && msg.channel.parentId === config.attendance_channel_id) {
      const spawnInfo = activeSpawns[msg.channel.id];
      
      // If thread is closed or not tracked, remove the reaction immediately
      if (!spawnInfo || spawnInfo.closed) {
        try {
          await reaction.users.remove(user.id);
          await msg.channel.send(
            `⚠️ <@${user.id}>, this spawn is closed. Your reaction was removed to prevent confusion.\n` +
            `(Closed threads should not have reactions to avoid restart detection issues)`
          ).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));  // Auto-delete after 5s
        } catch (err) {
          console.warn(`⚠️ Could not remove reaction from closed thread ${msg.channel.id}: ${err.message}`);
        }
        return;
      }
    }
    
    const adminMember = await guild.members.fetch(user.id).catch(() => null);
    
    // Only admins can use reactions
    if (!adminMember || !isAdmin(adminMember)) {
      try {
        await reaction.users.remove(user.id);
      } catch (e) {}
      return;
    }

    // ========== CLOSE CONFIRMATION ==========
    const closePending = pendingClosures[msg.id];
    
    if (closePending) {
      const spawnInfo = activeSpawns[closePending.threadId];
      
if (reaction.emoji.name === '✅') {
  if (!spawnInfo || spawnInfo.closed) {
    await msg.channel.send('⚠️ Spawn already closed or not found.');
    delete pendingClosures[msg.id];
    await removeAllReactionsWithRetry(msg);  // ← Use helper function
    return;
  }

  spawnInfo.closed = true;

  await msg.channel.send(`🔒 Closing spawn **${spawnInfo.boss}**... Submitting ${spawnInfo.members.length} members to Google Sheets...`);

  const payload = {
    action: 'submitAttendance',
    boss: spawnInfo.boss,
    date: spawnInfo.date,
    time: spawnInfo.time,
    timestamp: spawnInfo.timestamp,
    members: spawnInfo.members
  };

  const resp = await postToSheet(payload);

  if (resp.ok) {
    await msg.channel.send(`✅ Attendance submitted successfully! Archiving thread...`);
    
    // IMPROVED: Use retry logic for reaction cleanup
    await removeAllReactionsWithRetry(msg);
    
    // Delete confirmation thread
    if (spawnInfo.confirmThreadId) {
      const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
      if (confirmThread) {
        await confirmThread.send(`✅ Spawn closed: **${spawnInfo.boss}** (${spawnInfo.timestamp}) - ${spawnInfo.members.length} members recorded`);
        await confirmThread.delete().catch(console.error);
        console.log(`🗑️ Deleted confirmation thread for ${spawnInfo.boss}`);
      }
    }

    // Archive thread
    await msg.channel.setArchived(true, `Closed by ${user.username}`).catch(console.error);

    // IMPORTANT: Clean up memory AFTER all operations complete
    delete activeSpawns[closePending.threadId];
    delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];
    delete pendingClosures[msg.id];
    delete confirmationMessages[closePending.threadId];  // ← NEW: Clean up confirmation tracking

    console.log(`🔒 Spawn closed: ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`);
  } else {
    await msg.channel.send(
      `⚠️ **Failed to submit attendance!**\n\n` +
      `Error: ${resp.text || resp.err}\n\n` +
      `**Members list (for manual entry):**\n${spawnInfo.members.join(', ')}\n\n` +
      `Please manually update the Google Sheet.`
    );
    await removeAllReactionsWithRetry(msg);  // ← Clean up even on failure
  }

} else if (reaction.emoji.name === '❌') {
  await msg.channel.send('❌ Spawn close canceled.');
  await removeAllReactionsWithRetry(msg);  // ← Use helper function
  delete pendingClosures[msg.id];
}
      
      return;
    }

// ========== ATTENDANCE VERIFICATION ==========
const pending = pendingVerifications[msg.id];

if (pending) {
  const spawnInfo = activeSpawns[pending.threadId];

  if (!spawnInfo || spawnInfo.closed) {
    await msg.reply('⚠️ This spawn is already closed.');
    delete pendingVerifications[msg.id];
    return;
  }

  if (reaction.emoji.name === '✅') {
    // OPTIMIZED: Case-insensitive duplicate check
    const authorLower = pending.author.toLowerCase();
    const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === authorLower);
    
    if (isDuplicate) {
      await msg.reply(`⚠️ **${pending.author}** is already verified. Ignoring duplicate.`);
      await removeAllReactionsWithRetry(msg);
      delete pendingVerifications[msg.id];
      return;
    }

    // Add member to verified list
    spawnInfo.members.push(pending.author);

    // IMPORTANT: Clean reactions BEFORE replying (prevents race condition)
    const cleanupSuccess = await removeAllReactionsWithRetry(msg);
    if (!cleanupSuccess) {
      console.warn(`⚠️ Could not clean reactions for ${msg.id}, but continuing...`);
    }

    await msg.reply(`✅ **${pending.author}** verified by ${user.username}!`);

    // Notify confirmation thread
    if (spawnInfo.confirmThreadId) {
      const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
      if (confirmThread) {
        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Attendance Verified')
          .setDescription(`**${pending.author}** verified for **${spawnInfo.boss}**`)
          .addFields(
            {name: 'Verified By', value: user.username, inline: true},
            {name: 'Points', value: `+${bossPoints[spawnInfo.boss].points}`, inline: true},
            {name: 'Total Verified', value: `${spawnInfo.members.length}`, inline: true}
          )
          .setTimestamp();
        
        await confirmThread.send({embeds: [embed]});
      }
    }

    // IMPORTANT: Delete from pending AFTER all operations complete
    delete pendingVerifications[msg.id];
    console.log(`✅ Verified: ${pending.author} for ${spawnInfo.boss} by ${user.username}`);

  } else if (reaction.emoji.name === '❌') {
    // Delete message (denial)
    await msg.delete().catch(() => {});
    await msg.channel.send(
      `<@${pending.authorId}>, your attendance was **denied** by ${user.username}. ` +
      `Please repost with a proper screenshot.`
    );
    
    delete pendingVerifications[msg.id];
    console.log(`❌ Denied: ${pending.author} for ${spawnInfo.boss} by ${user.username}`);
  }
}
      
  // ========== BIDDING BID CONFIRMATIONS ==========
      const biddingState = bidding.getBiddingState();
      
      if (biddingState.pendingConfirmations[msg.id]) {
        if (reaction.emoji.name === '✅') {
          await bidding.confirmBid(reaction, user, config);
        } else if (reaction.emoji.name === '❌') {
          await bidding.cancelBid(reaction, user);
        }
        return;
      }
        
    } catch (err) {
      console.error('❌ Reaction handler error:', err);
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================

client.on(Events.Error, error => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('🌐 HTTP server closed');
    client.destroy();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('🌐 HTTP server closed');
    client.destroy();
    process.exit(0);
  });
});

// ==========================================
// LOGIN
// ==========================================

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN environment variable not set!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);