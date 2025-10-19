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
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Runtime state - stores active spawns and pending verifications
let activeSpawns = {}; // key: spawnId -> {boss, spawnNum, date, threadId, confirmThreadId, createdAt}

/**
 * Fuzzy match boss name from user input
 * Returns exact boss name from boss_points.json or null
 */
function findBossMatch(input) {
  const q = input.toLowerCase().trim();
  
  // First: exact match on name or aliases
  for (const name of Object.keys(bossPoints)) {
    if (name.toLowerCase() === q) return name;
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase() === q) return name;
    }
  }
  
  // Second: fuzzy match using Levenshtein distance
  let best = {name: null, dist: 999};
  for (const name of Object.keys(bossPoints)) {
    const dist = levenshtein.get(q, name.toLowerCase());
    if (dist < best.dist) best = {name, dist};
    
    for (const alias of bossPoints[name].aliases || []) {
      const d2 = levenshtein.get(q, alias.toLowerCase());
      if (d2 < best.dist) best = {name, dist: d2};
    }
  }
  
  // Allow small typos (distance <= 2)
  if (best.dist <= 2) return best.name;
  return null;
}

/**
 * Get timezone-adjusted date string
 */
function getDateString() {
  return new Date().toLocaleDateString('en-US', {timeZone: config.timezone});
}

/**
 * Post attendance data to Google Apps Script webhook
 */
async function postAttendanceToSheet(payload) {
  try {
    const res = await fetch(config.sheet_webhook_url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    return {ok: res.ok, status: res.status, text};
  } catch (err) {
    console.error('Webhook post error:', err);
    return {ok: false, err: err.toString()};
  }
}

/**
 * Check if user has admin role
 */
function isAdmin(member) {
  return member.roles.cache.some(r => config.admin_roles.includes(r.name));
}

client.once(Events.ClientReady, () => {
  console.log(`✅ Guild Attendance Bot logged in as ${client.user.tag}`);
  console.log(`📊 Tracking ${Object.keys(bossPoints).length} bosses`);
  console.log(`🏠 Main Guild: ${config.main_guild_id}`);
  console.log(`⏰ Timer Server: ${config.timer_server_id}`);
});

// ==========================================
// TIMER SERVER DETECTION
// ==========================================
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    // Detect boss spawn announcements from timer server
    if (message.guild && message.guild.id === config.timer_server_id) {
      // If timer_channel_id is specified, only listen to that channel
      if (config.timer_channel_id && message.channel.id !== config.timer_channel_id) {
        return; // Ignore messages from other channels
      }
      
      // Look for pattern: "BossName will spawn in" or "**BossName** will spawn in"
      if (/will spawn in/i.test(message.content)) {
        let detectedBoss = null;
        
        // Try pattern 1: "**BossName** will spawn in" (bold)
        let match = message.content.match(/\*\*(.*?)\*\*/);
        if (match) {
          detectedBoss = match[1].trim();
        } else {
          // Try pattern 2: "BossName will spawn in" (plain text)
          // Extract first word/phrase before "will spawn in"
          match = message.content.match(/^([\w\s]+?)\s+will spawn in/i);
          if (match) {
            detectedBoss = match[1].trim();
          }
        }
        
        if (!detectedBoss) {
          console.log('⚠️ Could not extract boss name from message:', message.content);
          return;
        }

        // Match detected boss to our boss list
        const bossName = findBossMatch(detectedBoss);
        if (!bossName) {
          console.log(`⚠️ Detected unknown boss: ${detectedBoss}`);
          return;
        }

        console.log(`🎯 Boss spawn detected: ${bossName}`);

        // Fetch main guild and channels
        const guild = await client.guilds.fetch(config.main_guild_id).catch(() => null);
        if (!guild) return;

        const attChannel = await guild.channels.fetch(config.attendance_channel_id).catch(() => null);
        const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id).catch(() => null);

        if (!attChannel || !adminLogs) {
          console.error('❌ Could not find attendance or admin logs channel');
          return;
        }

        // Count spawns for this boss today
        const today = getDateString();
        const sameSpawnsToday = Object.values(activeSpawns).filter(
          s => s.boss === bossName && s.date === today
        );
        const spawnNum = sameSpawnsToday.length + 1;
        
        const threadTitle = `[${today}] ${bossName} (#${spawnNum})`;
        const spawnId = `${today}|${bossName}|${spawnNum}|${Date.now()}`;

        // Create attendance thread
        const attThread = await attChannel.threads.create({
          name: threadTitle,
          autoArchiveDuration: config.auto_archive_minutes,
          reason: `Boss spawn: ${bossName}`
        }).catch(err => {
          console.error('Failed to create attendance thread:', err);
          return null;
        });

        // Create confirmation thread for admins
        const confirmThread = await adminLogs.threads.create({
          name: `✅ ${threadTitle}`,
          autoArchiveDuration: config.auto_archive_minutes,
          reason: `Confirmation thread: ${bossName}`
        }).catch(err => {
          console.error('Failed to create confirmation thread:', err);
          return null;
        });

        // Store spawn info
        activeSpawns[spawnId] = {
          boss: bossName,
          spawnNum,
          date: today,
          threadId: attThread ? attThread.id : null,
          confirmThreadId: confirmThread ? confirmThread.id : null,
          createdAt: Date.now()
        };

        // Post instructions in attendance thread
        if (attThread) {
          const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🎯 ${bossName} - Spawn #${spawnNum}`)
            .setDescription(`Boss detected! Please check in below.`)
            .addFields(
              {name: '📸 How to Check In', value: '1. Post `present` or `here` in this thread\n2. Attach a screenshot showing boss and timestamp\n3. Wait for admin verification (✅)'},
              {name: '📊 Points', value: `${bossPoints[bossName].points} points`, inline: true},
              {name: '📅 Date', value: today, inline: true},
              {name: '🔢 Spawn Number', value: `#${spawnNum}`, inline: true}
            )
            .setFooter({text: 'ELYSIUM Guild Attendance System'})
            .setTimestamp();
          
          await attThread.send({embeds: [embed]});
        }

        // Post in confirmation thread
        if (confirmThread) {
          await confirmThread.send(`🟨 **${bossName}** spawn #${spawnNum} detected (${today}). React ✅ to member messages to verify attendance.`);
        }

        console.log(`✅ Created threads for ${bossName} spawn #${spawnNum}`);
      }
    }

    // ==========================================
    // ATTENDANCE CHECK-IN (in attendance threads)
    // ==========================================
    if (message.channel.isThread()) {
      const parentId = message.channel.parentId;
      
      if (parentId === config.attendance_channel_id) {
        const content = message.content.trim().toLowerCase();
        const parts = content.split(/\s+/);
        const keyword = parts[0];

        // Check for attendance keywords
        if (['present', 'here', 'join', 'checkin', 'check-in'].includes(keyword)) {
          
          // Require screenshot attachment
          if (!message.attachments || message.attachments.size === 0) {
            await message.reply('⚠️ **Screenshot required!** Please attach a screenshot showing the boss and timestamp.');
            return;
          }

          // Extract spawn info from thread name: [date] Boss (#n)
          const threadName = message.channel.name;
          const match = threadName.match(/^\[(.*?)\]\s+(.*?)\s+\(#(\d+)\)/);
          
          let spawnKey = null;
          let bossMatched = null;

          if (match) {
            const date = match[1];
            const threadBoss = match[2];
            const num = Number(match[3]);

            // Find active spawn
            for (const k of Object.keys(activeSpawns)) {
              const s = activeSpawns[k];
              if (s.boss === threadBoss && s.spawnNum === num && s.date === date) {
                spawnKey = k;
                bossMatched = threadBoss;
                break;
              }
            }
          }

          // Allow boss name override in message
          if (parts.length >= 2) {
            const overrideBoss = findBossMatch(parts[1]);
            if (overrideBoss) bossMatched = overrideBoss;
          }

          if (!bossMatched) {
            await message.reply('❓ Could not identify boss. Please ensure you\'re in the correct spawn thread.');
            return;
          }

          // Add checkmark reaction for admin verification
          try {
            await message.react('✅');
          } catch (e) {
            console.error('Failed to add reaction:', e);
          }

          // Store pending attendance
          const pendingKey = `pending|${message.id}`;
          activeSpawns[pendingKey] = {
            messageId: message.id,
            author: message.author.username,
            authorId: message.author.id,
            boss: bossMatched,
            spawnKey,
            timestamp: Date.now()
          };

          const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setDescription(`⏳ Registered **${message.author.username}** for **${bossMatched}**\n\nWaiting for admin verification...`)
            .setFooter({text: 'An admin will react with ✅ to confirm'});

          await message.reply({embeds: [embed]});
          
          console.log(`📝 Pending attendance: ${message.author.username} for ${bossMatched}`);
        }
      }
    }

  } catch (err) {
    console.error('❌ Message handler error:', err);
  }
});

// ==========================================
// ADMIN VERIFICATION (reaction handler)
// ==========================================
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.bot) return;

    // Fetch partials if needed
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    if (reaction.emoji.name !== '✅') return;

    const msg = reaction.message;
    const pendingKey = `pending|${msg.id}`;
    const pending = activeSpawns[pendingKey];

    if (!pending) return; // Not a pending attendance message

    const guild = msg.guild;
    const adminMember = await guild.members.fetch(user.id).catch(() => null);
    
    if (!adminMember) return;

    // Check if user is admin
    if (!isAdmin(adminMember)) {
      try {
        await reaction.users.remove(user.id);
      } catch (e) {}
      return;
    }

    // Prevent self-verification
    if (user.id === pending.authorId) {
      await msg.channel.send(`⚠️ <@${user.id}>, you cannot verify your own attendance.`);
      try {
        await reaction.users.remove(user.id);
      } catch (e) {}
      return;
    }

    // Get spawn info
    const spawnInfo = pending.spawnKey ? activeSpawns[pending.spawnKey] : null;
    const spawnLabel = spawnInfo 
      ? `${spawnInfo.date} | ${spawnInfo.boss} #${spawnInfo.spawnNum}`
      : pending.boss;

    console.log(`✅ Admin ${user.username} verifying ${pending.author} for ${pending.boss}`);

    // Send to Google Sheets
    const payload = {
      user: pending.author,
      boss: pending.boss,
      spawnLabel,
      verifier: user.username,
      verifierId: user.id,
      timestamp: new Date().toISOString()
    };

    const resp = await postAttendanceToSheet(payload);

    if (resp.ok) {
      // Success!
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Attendance Verified')
        .setDescription(`**${pending.author}** verified for **${pending.boss}**`)
        .addFields(
          {name: 'Verified By', value: user.username, inline: true},
          {name: 'Points', value: `+${bossPoints[pending.boss].points}`, inline: true}
        )
        .setTimestamp();

      // Post in confirmation thread if exists
      if (spawnInfo && spawnInfo.confirmThreadId) {
        const confirmThread = await guild.channels.fetch(spawnInfo.confirmThreadId).catch(() => null);
        if (confirmThread && confirmThread.send) {
          await confirmThread.send({embeds: [embed]});
        }
      } else {
        // Post in admin logs
        const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id).catch(() => null);
        if (adminLogs && adminLogs.send) {
          await adminLogs.send({embeds: [embed]});
        }
      }

      // Update original message
      await msg.reply(`✅ Attendance verified by **${user.username}**! Points have been added to the sheet.`);

      // Cleanup
      delete activeSpawns[pendingKey];
      
      // Remove admin's checkmark to prevent confusion
      try {
        await reaction.users.remove(user.id);
      } catch (e) {}

    } else {
      // Error from Google Sheets (likely duplicate)
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⚠️ Verification Failed')
        .setDescription(`Could not verify **${pending.author}** for **${pending.boss}**`)
        .addFields({name: 'Error', value: resp.text || resp.err || 'Unknown error'})
        .setTimestamp();

      const adminLogs = await guild.channels.fetch(config.admin_logs_channel_id).catch(() => null);
      if (adminLogs && adminLogs.send) {
        await adminLogs.send({embeds: [errorEmbed]});
      }

      await msg.reply(`⚠️ Verification failed: ${resp.text || 'Already verified or error occurred'}`);
      
      try {
        await reaction.users.remove(user.id);
      } catch (e) {}
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
  console.error('Set it in Railway or locally: export DISCORD_TOKEN=your_token');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);