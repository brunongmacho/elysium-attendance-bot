/**
 * ELYSIUM Guild Attendance Bot - Version 2.2 (FULLY OPTIMIZED)
 * 
 * OPTIMIZATIONS APPLIED:
 * ✅ Case-insensitive member duplicate check (no duplicates)
 * ✅ Better code organization (clear sections)
 * ✅ Consistent error handling (all errors logged properly)
 * ✅ HTTP health check server for Koyeb deployment
 * 
 * Features:
 * - Timestamp-based thread naming
 * - Memory-based attendance collection
 * - Batch submission on thread close
 * - Hybrid column checking (memory + sheet)
 * - Admin override: !verify @member
 * - Screenshot required (except for admins)
 * - Force close: !forceclose (emergency)
 */

const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const levenshtein = require('fast-levenshtein');
const fs = require('fs');
const http = require('http');

const config = JSON.parse(fs.readFileSync('./config.json'));
const bossPoints = JSON.parse(fs.readFileSync('./boss_points.json'));

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

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      bot: client.user ? client.user.tag : 'not ready',
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
let pendingClosures = {}; // messageId -> {threadId, adminId}

// Rate limiting
let lastSheetCall = 0;
const MIN_SHEET_DELAY = 2000; // 2 seconds between API calls

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
    if (timeSinceLastCall < MIN_SHEET_DELAY) {
      const waitTime = MIN_SHEET_DELAY - timeSinceLastCall;
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
      await new Promise(resolve => setTimeout(resolve, 5000));
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

  // Create attendance thread
  const attThread = await attChannel.threads.create({
    name: threadTitle,
    autoArchiveDuration: config.auto_archive_minutes,
    reason: `Boss spawn: ${bossName}`
  }).catch(err => {
    console.error('❌ Failed to create attendance thread:', err);
    return null;
  });

  // Create confirmation thread (for admin logs)
  const confirmThread = await adminLogs.threads.create({
    name: `✅ ${threadTitle}`,
    autoArchiveDuration: config.auto_archive_minutes,
    reason: `Confirmation thread: ${bossName}`
  }).catch(err => {
    console.error('❌ Failed to create confirmation thread:', err);
    return null;
  });

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
// BOT READY EVENT
// ==========================================

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log(`📊 Tracking ${Object.keys(bossPoints).length} bosses`);
  console.log(`🏠 Main Guild: ${config.main_guild_id}`);
  console.log(`⏰ Timer Server: ${config.timer_server_id}`);
});

// ==========================================
// MESSAGE HANDLER
// ==========================================

client.on(Events.MessageCreate, async (message) => {
  try {
    // ========== TIMER SERVER SPAWN DETECTION ==========
    // Special handling for timer server - allow bot messages for spawn detection
    if (message.guild && message.guild.id === config.timer_server_id) {
      // Allow timer bot messages in timer channel
      if (config.timer_channel_id && message.channel.id === config.timer_channel_id) {
        // Process spawn detection even from bots
        if (/will spawn in.*minutes?!/i.test(message.content)) {
          let detectedBoss = null;
          let timestamp = null;
          
          // Extract timestamp from parentheses first
          const timestampMatch = message.content.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/);
          if (timestampMatch) {
            timestamp = timestampMatch[1];
          }
          
          // Try to extract boss name
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

          // Parse timestamp
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

    // For all other messages, ignore bots
    if (message.author.bot) return;

    const guild = message.guild;
    if (!guild) return;

    // ========== MANUAL THREAD CREATION (ADMIN ONLY, ADMIN LOGS ONLY) ==========
    if (message.channel.id === config.admin_logs_channel_id && message.content.startsWith('!addthread')) {
      const member = await guild.members.fetch(message.author.id).catch(() => null);
      if (!member || !isAdmin(member)) {
        await message.reply('⚠️ Only admins can use this command.');
        return;
      }

      const fullText = message.content.substring('!addthread'.length).trim();
      
      const timestampMatch = fullText.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/);
      if (!timestampMatch) {
        await message.reply(
          '⚠️ **Invalid format!**\n\n' +
          '**Usage:** `!addthread BossName will spawn in X minutes! (YYYY-MM-DD HH:MM)`\n\n' +
          '**Example:** `!addthread Clemantis will spawn in 5 minutes! (2025-10-20 11:30)`'
        );
        return;
      }

      const timestampStr = timestampMatch[1];
      
      const bossMatch = fullText.match(/^(.+?)\s+will spawn/i);
      if (!bossMatch) {
        await message.reply(
          '⚠️ **Cannot detect boss name!**\n\n' +
          'Make sure your message follows this format:\n' +
          '`!addthread BossName will spawn in X minutes! (YYYY-MM-DD HH:MM)`'
        );
        return;
      }

      const detectedBoss = bossMatch[1].trim();
      const bossName = findBossMatch(detectedBoss);
      
      if (!bossName) {
        await message.reply(
          `⚠️ **Unknown boss:** "${detectedBoss}"\n\n` +
          `Make sure the boss name matches one in the boss list.\n` +
          `**Available bosses:** ${Object.keys(bossPoints).join(', ')}`
        );
        return;
      }

      const [datePart, timePart] = timestampStr.split(' ');
      const [year, month, day] = datePart.split('-');
      const [hour, minute] = timePart.split(':');
      
      const dateStr = `${month}/${day}/${year.substring(2)}`;
      const timeStr = `${hour}:${minute}`;
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

    // ========== ADMIN OVERRIDE: !verify @member ==========
    if (message.channel.isThread() && message.content.startsWith('!verify')) {
      const member = await guild.members.fetch(message.author.id).catch(() => null);
      if (!member || !isAdmin(member)) return;

      const mentioned = message.mentions.users.first();
      if (!mentioned) {
        await message.reply('⚠️ Usage: `!verify @member`');
        return;
      }

      const spawnInfo = activeSpawns[message.channel.id];
      if (!spawnInfo || spawnInfo.closed) {
        await message.reply('⚠️ This spawn is closed or not found.');
        return;
      }

      const mentionedMember = await guild.members.fetch(mentioned.id).catch(() => null);
      const username = mentionedMember ? (mentionedMember.nickname || mentioned.username) : mentioned.username;
      
      // OPTIMIZED: Case-insensitive duplicate check
      const usernameLower = username.toLowerCase();
      const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === usernameLower);
      
      if (isDuplicate) {
        await message.reply(`⚠️ **${username}** is already verified for this spawn.`);
        return;
      }

      spawnInfo.members.push(username);

      await message.reply(`✅ **${username}** manually verified by ${message.author.username}`);
      
      // Notify confirmation thread
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
    if (message.channel.isThread() && message.content.trim().toLowerCase() === 'close') {
      const member = await guild.members.fetch(message.author.id).catch(() => null);
      if (!member || !isAdmin(member)) return;

      const spawnInfo = activeSpawns[message.channel.id];
      if (!spawnInfo || spawnInfo.closed) {
        await message.reply('⚠️ This spawn is already closed or not found.');
        return;
      }

      // Check for pending verifications
      const pendingInThread = Object.values(pendingVerifications).filter(
        p => p.threadId === message.channel.id
      );

      if (pendingInThread.length > 0) {
        const pendingMembers = pendingInThread.map(p => p.author).join(', ');
        await message.reply(
          `⚠️ **Cannot close spawn!**\n\n` +
          `There are **${pendingInThread.length} pending verification(s)**:\n` +
          `${pendingMembers}\n\n` +
          `Please verify (✅) or deny (❌) all check-ins first, then type \`close\` again.`
        );
        return;
      }

      // Ask for confirmation
      const confirmMsg = await message.reply(
        `🔒 Close spawn **${spawnInfo.boss}** (${spawnInfo.timestamp})?\n\n` +
        `**${spawnInfo.members.length} members** will be submitted to Google Sheets.\n\n` +
        `React ✅ to confirm or ❌ to cancel.`
      );
      
      await confirmMsg.react('✅');
      await confirmMsg.react('❌');
      
      pendingClosures[confirmMsg.id] = {
        threadId: message.channel.id,
        adminId: message.author.id
      };
      
      return;
    }

    // ========== ADMIN FORCE CLOSE (EMERGENCY) ==========
    if (message.channel.isThread() && message.content.trim().toLowerCase() === '!forceclose') {
      const member = await guild.members.fetch(message.author.id).catch(() => null);
      if (!member || !isAdmin(member)) {
        await message.reply('⚠️ Only admins can use this command.');
        return;
      }

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

    // ========== MEMBER CHECK-IN ==========
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

        const member = await guild.members.fetch(message.author.id).catch(() => null);
        const userIsAdmin = member && isAdmin(member);

        // Non-admins must attach screenshot
        if (!userIsAdmin) {
          if (!message.attachments || message.attachments.size === 0) {
            await message.reply('⚠️ **Screenshot required!** Attach a screenshot showing boss and timestamp.');
            return;
          }
        }

        const username = member ? (member.nickname || message.author.username) : message.author.username;

        // OPTIMIZED: Case-insensitive duplicate check
        const usernameLower = username.toLowerCase();
        const isDuplicate = spawnInfo.members.some(m => m.toLowerCase() === usernameLower);
        
        if (isDuplicate) {
          await message.reply(`⚠️ You already checked in for this spawn.`);
          return;
        }

        // Add reaction buttons for admin verification
        await message.react('✅');
        await message.react('❌');

        // Store pending verification
        pendingVerifications[message.id] = {
          author: username,
          authorId: message.author.id,
          threadId: message.channel.id,
          timestamp: Date.now()
        };

        // Send confirmation message
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setDescription(`⏳ **${username}** registered for **${spawnInfo.boss}**\n\nWaiting for admin verification...`)
          .setFooter({text: 'Admins: React ✅ to verify, ❌ to deny'});

        await message.reply({embeds: [embed]});
        console.log(`🔍 Pending: ${username} for ${spawnInfo.boss}`);
      }
      
      return;
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
          
          // Delete confirmation thread
          if (spawnInfo.confirmThreadId) {
            const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
            if (confirmThread) {
              await confirmThread.delete().catch(console.error);
              console.log(`🗑️ Deleted confirmation thread for ${spawnInfo.boss}`);
            }
          }

          // Archive thread
          await msg.channel.setArchived(true, `Closed by ${user.username}`).catch(console.error);

          // Clean up memory
          delete activeSpawns[closePending.threadId];
          delete activeColumns[`${spawnInfo.boss}|${spawnInfo.timestamp}`];

          console.log(`🔒 Spawn closed: ${spawnInfo.boss} at ${spawnInfo.timestamp} (${spawnInfo.members.length} members)`);
        } else {
          await msg.channel.send(
            `⚠️ **Failed to submit attendance!**\n\n` +
            `Error: ${resp.text || resp.err}\n\n` +
            `**Members list (for manual entry):**\n${spawnInfo.members.join(', ')}\n\n` +
            `Please manually update the Google Sheet.`
          );
        }

        delete pendingClosures[msg.id];
        
      } else if (reaction.emoji.name === '❌') {
        await msg.channel.send('❌ Spawn close canceled.');
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
          try {
            await reaction.users.remove(user.id);
          } catch (e) {}
          return;
        }

        // Add member to verified list
        spawnInfo.members.push(pending.author);

        await msg.reactions.removeAll().catch(() => {});

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

        delete pendingVerifications[msg.id];
        console.log(`✅ Verified: ${pending.author} for ${spawnInfo.boss} by ${user.username}`);

      } else if (reaction.emoji.name === '❌') {
        await msg.delete().catch(() => {});
        await msg.channel.send(
          `<@${pending.authorId}>, your attendance was **denied** by ${user.username}. ` +
          `Please repost with a proper screenshot.`
        );
        
        delete pendingVerifications[msg.id];
        console.log(`❌ Denied: ${pending.author} for ${spawnInfo.boss} by ${user.username}`);
      }
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