/**
 * ELYSIUM Guild Attendance Bot - Version 2.0 (Simplified)
 * 
 * NEW FLOW:
 * 1. Boss spawns → Create thread with timestamp
 * 2. Members check in → Admins verify → Store in memory
 * 3. Admin closes thread → Batch send all attendance → Archive thread
 * 4. ONE column per boss per timestamp (blocks duplicates)
 * 5. No spawn numbering, no SpawnLog
 * 
 * Features:
 * - Timestamp-based thread naming
 * - Memory-based attendance collection
 * - Batch submission on thread close
 * - Hybrid column checking (memory + sheet)
 * - Admin override: !verify @member
 * - Screenshot required (except for admins)
 */

const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const levenshtein = require('fast-levenshtein');
const fs = require('fs');

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
// RUNTIME STATE
// ==========================================
let activeSpawns = {}; // threadId -> {boss, date, time, timestamp, members: [], confirmThreadId, closed}
let activeColumns = {}; // "boss|timestamp" -> threadId (for duplicate check)
let pendingVerifications = {}; // messageId -> {author, authorId, threadId, timestamp}
let pendingClosures = {}; // messageId -> {threadId, adminId}

// Rate limiting
let lastSheetCall = 0;
const MIN_SHEET_DELAY = 2000;

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
 * Fuzzy match boss name
 */
function findBossMatch(input) {
  const q = input.toLowerCase().trim();
  
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase() === q) return name;
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase() === q) return name;
    }
  }
  
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
 * Handle spawn detection from timer bot
 */
async function handleSpawnDetection(message) {
  const guild = message.guild;
  
  // Check for spawn announcement patterns
  // Pattern: "Boss will spawn in X minutes! (YYYY-MM-DD HH:MM)"
  if (/will spawn in.*minutes?!/i.test(message.content)) {
    let detectedBoss = null;
    let timestamp = null;
    
    // Extract timestamp from parentheses first
    const timestampMatch = message.content.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/);
    if (timestampMatch) {
      timestamp = timestampMatch[1]; // "2025-10-20 19:00"
    }
    
    // Try to extract boss name
    // Try bold format first: ⚠️ **Boss** will spawn
    const matchBold = message.content.match(/[⚠️🔔⏰]*\s*\*\*(.*?)\*\*\s*will spawn/i);
    if (matchBold) {
      detectedBoss = matchBold[1].trim();
    } else {
      // Try emoji + name: ⚠️ Boss will spawn
      const matchEmoji = message.content.match(/[⚠️🔔⏰]+\s*([A-Za-z\s]+?)\s*will spawn/i);
      if (matchEmoji) {
        detectedBoss = matchEmoji[1].trim();
      } else {
        // Try plain format: Boss will spawn
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

    const mainGuild = await client.guilds.fetch(config.main_guild_id).catch(() => null);
    if (!mainGuild) return;

    const attChannel = await mainGuild.channels.fetch(config.attendance_channel_id).catch(() => null);
    const adminLogs = await mainGuild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

    if (!attChannel || !adminLogs) {
      console.error('❌ Could not find channels');
      return;
    }

    // Use timestamp from message if available, otherwise use current time
    let dateStr, timeStr, fullTimestamp;
    
    if (timestamp) {
      // Parse timestamp from timer message: "2025-10-20 19:00"
      const [datePart, timePart] = timestamp.split(' ');
      const [year, month, day] = datePart.split('-');
      dateStr = `${month}/${day}/${year.substring(2)}`;
      timeStr = timePart;
      fullTimestamp = `${dateStr} ${timeStr}`;
      console.log(`⏰ Using timestamp from timer: ${fullTimestamp}`);
    } else {
      // Fallback to current time
      const ts = getCurrentTimestamp();
      dateStr = ts.date;
      timeStr = ts.time;
      fullTimestamp = ts.full;
      console.log(`⏰ Using current timestamp: ${fullTimestamp}`);
    }

    const threadTitle = `[${dateStr} ${timeStr}] ${bossName}`;

    // Check if column already exists
    const columnExists = await checkColumnExists(bossName, fullTimestamp);
    if (columnExists) {
      console.log(`⚠️ Column already exists for ${bossName} at ${fullTimestamp}. Blocking spawn.`);
      await adminLogs.send(
        `⚠️ **BLOCKED SPAWN:** ${bossName} at ${fullTimestamp}\n` +
        `A column for this boss at this timestamp already exists. Close the existing thread first.`
      );
      return;
    }

    // Create threads
    const attThread = await attChannel.threads.create({
      name: threadTitle,
      autoArchiveDuration: config.auto_archive_minutes,
      reason: `Boss spawn: ${bossName}`
    }).catch(err => {
      console.error('Failed to create attendance thread:', err);
      return null;
    });

    const confirmThread = await adminLogs.threads.create({
      name: `✅ ${threadTitle}`,
      autoArchiveDuration: config.auto_archive_minutes,
      reason: `Confirmation thread: ${bossName}`
    }).catch(err => {
      console.error('Failed to create confirmation thread:', err);
      return null;
    });

    if (!attThread) return;

    // Store spawn info
    activeSpawns[attThread.id] = {
      boss: bossName,
      date: dateStr,
      time: timeStr,
      timestamp: fullTimestamp,
      members: [],
      confirmThreadId: confirmThread ? confirmThread.id : null,
      closed: false
    };

    // Mark column as active
    activeColumns[`${bossName}|${fullTimestamp}`] = attThread.id;

    // Post instructions
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
    
    await attThread.send({embeds: [embed]});

    if (confirmThread) {
      await confirmThread.send(`🟨 **${bossName}** spawn detected (${fullTimestamp}). Verifications will appear here.`);
    }

    console.log(`✅ Created threads for ${bossName} at ${fullTimestamp}`);
  }
}

/**
 * Parse thread name to extract info
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
    
    if (res.status === 429) {
      console.error('❌ Rate limit hit! Waiting 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return postToSheet(payload);
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
  
  // Check memory first
  if (activeColumns[key]) {
    console.log(`✅ Column exists in memory: ${key}`);
    return true;
  }
  
  // Fallback: Check sheet
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
    // Special handling for timer server - allow bot messages for spawn detection
    if (message.guild && message.guild.id === config.timer_server_id) {
      // Allow timer bot messages in timer channel
      if (config.timer_channel_id && message.channel.id === config.timer_channel_id) {
        // Process spawn detection even from bots
        await handleSpawnDetection(message);
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

      // Parse command: !addthread Boss will spawn in X minutes! (YYYY-MM-DD HH:MM)
      const fullText = message.content.substring('!addthread'.length).trim();
      
      // Extract timestamp from parentheses
      const timestampMatch = fullText.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/);
      if (!timestampMatch) {
        await message.reply(
          '⚠️ **Invalid format!**\n\n' +
          '**Usage:** `!addthread BossName will spawn in X minutes! (YYYY-MM-DD HH:MM)`\n\n' +
          '**Example:** `!addthread Clemantis will spawn in 5 minutes! (2025-10-20 11:30)`'
        );
        return;
      }

      const timestampStr = timestampMatch[1]; // "2025-10-20 11:30"
      
      // Extract boss name (text before "will spawn")
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

      // Parse timestamp
      const [datePart, timePart] = timestampStr.split(' ');
      const [year, month, day] = datePart.split('-');
      const [hour, minute] = timePart.split(':');
      
      // Convert to MM/DD/YY HH:MM format
      const dateStr = `${month}/${day}/${year.substring(2)}`;
      const timeStr = `${hour}:${minute}`;
      const fullTimestamp = `${dateStr} ${timeStr}`;

      console.log(`🔧 Manual spawn creation: ${bossName} at ${fullTimestamp} by ${message.author.username}`);

      const attChannel = await guild.channels.fetch(config.attendance_channel_id).catch(() => null);
      const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

      if (!attChannel || !adminLogs) {
        await message.reply('❌ Could not find required channels.');
        return;
      }

      // Check if column already exists
      const columnExists = await checkColumnExists(bossName, fullTimestamp);
      if (columnExists) {
        await message.reply(
          `⚠️ **Column already exists** for ${bossName} at ${fullTimestamp}.\n\n` +
          `A spawn thread for this boss at this exact timestamp already exists. Close it first before creating a new one.`
        );
        return;
      }

      const threadTitle = `[${dateStr} ${timeStr}] ${bossName}`;

      // Create threads
      const attThread = await attChannel.threads.create({
        name: threadTitle,
        autoArchiveDuration: config.auto_archive_minutes,
        reason: `Manual spawn creation by ${message.author.username}`
      }).catch(err => {
        console.error('Failed to create attendance thread:', err);
        return null;
      });

      const confirmThread = await adminLogs.threads.create({
        name: `✅ ${threadTitle}`,
        autoArchiveDuration: config.auto_archive_minutes,
        reason: `Manual confirmation thread for ${bossName}`
      }).catch(err => {
        console.error('Failed to create confirmation thread:', err);
        return null;
      });

      if (!attThread) {
        await message.reply('❌ Failed to create attendance thread.');
        return;
      }

      // Store spawn info
      activeSpawns[attThread.id] = {
        boss: bossName,
        date: dateStr,
        time: timeStr,
        timestamp: fullTimestamp,
        members: [],
        confirmThreadId: confirmThread ? confirmThread.id : null,
        closed: false
      };

      // Mark column as active
      activeColumns[`${bossName}|${fullTimestamp}`] = attThread.id;

      // Post instructions
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`🎯 ${bossName}`)
        .setDescription(`Manual spawn created by admin. Please check in below.`)
        .addFields(
          {name: '📸 How to Check In', value: '1. Post `present` or `here`\n2. Attach a screenshot (admins exempt)\n3. Wait for admin ✅'},
          {name: '📊 Points', value: `${bossPoints[bossName].points} points`, inline: true},
          {name: '🕐 Time', value: timeStr, inline: true},
          {name: '📅 Date', value: dateStr, inline: true}
        )
        .setFooter({text: 'Manually created spawn | Admins: type "close" to finalize'})
        .setTimestamp();
      
      await attThread.send({embeds: [embed]});

      if (confirmThread) {
        await confirmThread.send(`🟨 **${bossName}** spawn manually created by ${message.author.username} (${fullTimestamp}). Verifications will appear here.`);
      }

      await message.reply(
        `✅ **Spawn thread created successfully!**\n\n` +
        `**Boss:** ${bossName}\n` +
        `**Time:** ${fullTimestamp}\n` +
        `**Thread:** ${attThread.toString()}\n\n` +
        `Members can now check in!`
      );

      console.log(`✅ Manual thread created: ${bossName} at ${fullTimestamp} by ${message.author.username}`);
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

      // Get the mentioned member's nickname or username
      const mentionedMember = await guild.members.fetch(mentioned.id).catch(() => null);
      const username = mentionedMember ? (mentionedMember.nickname || mentioned.username) : mentioned.username;
      
      // Check duplicate
      if (spawnInfo.members.includes(username)) {
        await message.reply(`⚠️ **${username}** is already verified for this spawn.`);
        return;
      }

      // Add to members
      spawnInfo.members.push(username);

      await message.reply(`✅ **${username}** manually verified by ${message.author.username}`);
      
      // Log to confirmation thread
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

      // Check for pending verifications in this thread
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

        // Screenshot requirement (except for admins)
        if (!userIsAdmin) {
          if (!message.attachments || message.attachments.size === 0) {
            await message.reply('⚠️ **Screenshot required!** Attach a screenshot showing boss and timestamp.');
            return;
          }
        }

        // Use nickname if available, otherwise username
        const username = member ? (member.nickname || message.author.username) : message.author.username;

        // Check duplicate
        if (spawnInfo.members.includes(username)) {
          await message.reply(`⚠️ You already checked in for this spawn.`);
          return;
        }

        // Add reactions
        await message.react('✅');
        await message.react('❌');

        // Store pending verification
        pendingVerifications[message.id] = {
          author: username,
          authorId: message.author.id,
          threadId: message.channel.id,
          timestamp: Date.now()
        };

        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setDescription(`⏳ **${username}** registered for **${spawnInfo.boss}**\n\nWaiting for admin verification...`)
          .setFooter({text: 'Admins: React ✅ to verify, ❌ to deny'});

        await message.reply({embeds: [embed]});
        console.log(`📝 Pending: ${username} for ${spawnInfo.boss}`);
      }
      
      return;
    }

    // ========== TIMER SPAWN DETECTION ==========
    if (guild.id === config.timer_server_id) {
      if (config.timer_channel_id && message.channel.id !== config.timer_channel_id) return;

      // Check for spawn announcement patterns
      // Pattern 1: "Boss will spawn in X minutes! (YYYY-MM-DD HH:MM)"
      // Pattern 2: "**Boss** will spawn in X minutes! (YYYY-MM-DD HH:MM)"
      if (/will spawn in.*minutes?!/i.test(message.content)) {
        let detectedBoss = null;
        let timestamp = null;
        
        // Extract timestamp from parentheses first
        const timestampMatch = message.content.match(/\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\)/);
        if (timestampMatch) {
          timestamp = timestampMatch[1]; // "2025-10-20 14:47"
        }
        
        // Try to extract boss name
        // Try bold format first: ⚠️ **Boss** will spawn
        const matchBold = message.content.match(/[⚠️🔔⏰]*\s*\*\*(.*?)\*\*\s*will spawn/i);
        if (matchBold) {
          detectedBoss = matchBold[1].trim();
        } else {
          // Try emoji + name: ⚠️ Boss will spawn
          const matchEmoji = message.content.match(/[⚠️🔔⏰]+\s*([A-Za-z\s]+?)\s*will spawn/i);
          if (matchEmoji) {
            detectedBoss = matchEmoji[1].trim();
          } else {
            // Try plain format: Boss will spawn
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

        console.log(`🎯 Boss spawn detected: ${bossName}`);

        const mainGuild = await client.guilds.fetch(config.main_guild_id).catch(() => null);
        if (!mainGuild) return;

        const attChannel = await mainGuild.channels.fetch(config.attendance_channel_id).catch(() => null);
        const adminLogs = await mainGuild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

        if (!attChannel || !adminLogs) {
          console.error('❌ Could not find channels');
          return;
        }

        // Use timestamp from message if available, otherwise use current time
        let dateStr, timeStr, fullTimestamp;
        
        if (timestamp) {
          // Parse timestamp from timer message: "2025-10-20 14:47"
          const [datePart, timePart] = timestamp.split(' ');
          const [year, month, day] = datePart.split('-');
          dateStr = `${month}/${day}/${year.substring(2)}`;
          timeStr = timePart;
          fullTimestamp = `${dateStr} ${timeStr}`;
          console.log(`⏰ Using timestamp from timer: ${fullTimestamp}`);
        } else {
          // Fallback to current time
          const ts = getCurrentTimestamp();
          dateStr = ts.date;
          timeStr = ts.time;
          fullTimestamp = ts.full;
          console.log(`⏰ Using current timestamp: ${fullTimestamp}`);
        }

        const threadTitle = `[${dateStr} ${timeStr}] ${bossName}`;

        // Check if column already exists
        const columnExists = await checkColumnExists(bossName, fullTimestamp);
        if (columnExists) {
          console.log(`⚠️ Column already exists for ${bossName} at ${fullTimestamp}. Blocking spawn.`);
          await adminLogs.send(
            `⚠️ **BLOCKED SPAWN:** ${bossName} at ${fullTimestamp}\n` +
            `A column for this boss at this timestamp already exists. Close the existing thread first.`
          );
          return;
        }

        // Create threads
        const attThread = await attChannel.threads.create({
          name: threadTitle,
          autoArchiveDuration: config.auto_archive_minutes,
          reason: `Boss spawn: ${bossName}`
        }).catch(err => {
          console.error('Failed to create attendance thread:', err);
          return null;
        });

        const confirmThread = await adminLogs.threads.create({
          name: `✅ ${threadTitle}`,
          autoArchiveDuration: config.auto_archive_minutes,
          reason: `Confirmation thread: ${bossName}`
        }).catch(err => {
          console.error('Failed to create confirmation thread:', err);
          return null;
        });

        if (!attThread) return;

        // Store spawn info
        activeSpawns[attThread.id] = {
          boss: bossName,
          date: dateStr,
          time: timeStr,
          timestamp: fullTimestamp,
          members: [],
          confirmThreadId: confirmThread ? confirmThread.id : null,
          closed: false
        };

        // Mark column as active
        activeColumns[`${bossName}|${fullTimestamp}`] = attThread.id;

        // Post instructions
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
        
        await attThread.send({embeds: [embed]});

        if (confirmThread) {
          await confirmThread.send(`🟨 **${bossName}** spawn detected (${fullTimestamp}). Verifications will appear here.`);
        }

        console.log(`✅ Created threads for ${bossName} at ${fullTimestamp}`);
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
    const adminMember = await guild.members.fetch(user.id).catch(() => null);
    
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

        // Mark as closed
        spawnInfo.closed = true;

        await msg.channel.send(`🔒 Closing spawn **${spawnInfo.boss}**... Submitting ${spawnInfo.members.length} members to Google Sheets...`);

        // Send attendance to Google Sheets
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

          // Archive attendance thread
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
        // Check if already verified
        if (spawnInfo.members.includes(pending.author)) {
          await msg.reply(`⚠️ **${pending.author}** is already verified. Ignoring duplicate.`);
          try {
            await reaction.users.remove(user.id);
          } catch (e) {}
          return;
        }

        // Add to members list
        spawnInfo.members.push(pending.author);

        // Clear reactions
        await msg.reactions.removeAll().catch(() => {});

        // Reply with confirmation
        await msg.reply(`✅ **${pending.author}** verified by ${user.username}!`);

        // Log to confirmation thread
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
        // Deny
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

// ==========================================
// LOGIN
// ==========================================
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN environment variable not set!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

// --- Health Check Server for Koyeb ---
import express from "express";

const app = express();
const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});
