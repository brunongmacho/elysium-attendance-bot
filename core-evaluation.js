/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ELYSIUM CORE MEMBER EVALUATION SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages Core Member Evaluation threads for CP tracking
 * Creates weekly threads for Starting/Ending CP submission
 *
 * FUNCTIONALITY:
 * 1. Thread Creation: Creates evaluation threads every Monday 12:00 AM
 * 2. CP Submission: Members submit CP via !CP command with screenshot
 * 3. Cycle Tracking: Tracks 2-week cycles (Starting → Ending → Starting...)
 * 4. State Persistence: MongoDB with crash recovery
 * 5. Reminders: Weekly notifications
 *
 * THREAD SCHEDULE:
 * - Week 1: Starting CP submission
 * - Week 3: Ending CP (becomes new Starting CP)
 * - Week 5: New Ending CP, repeat
 *
 * @module core-evaluation
 */

const { EmbedBuilder } = require('discord.js');
const { SheetAPI } = require('./utils/sheet-api');
const { getCurrentTimestamp } = require('./utils/common');
const dbAPI = require('./utils/database-api');
const path = require('path');
const fs = require('fs');

const TIMEZONE = 'Asia/Manila';

const SAMPLE_SCREENSHOT_PATH = path.join(__dirname, 'assets', 'sample', 'samplecp.png');
const SAMPLE_SCREENSHOT_EXISTS = fs.existsSync(SAMPLE_SCREENSHOT_PATH);

const EVAL_PHASE = {
  STARTING_CP: 'starting_cp',
  ENDING_CP: 'ending_cp',
};

const EVAL_COLLECTION = 'coreEvaluation';
const STATE_COLLECTION = 'coreEvaluationState';

let config = null;
let sheetAPI = null;
let activeThread = null;
let currentCycle = null;
let lastStateSync = 0;
let reminderMessageId = null;
let lastReminderSentDate = null; // Prevent multiple reminders in same window
let lastCPSubmissionTime = 0;
let syncTimeout = null;

const CACHE_TTL = 60000;
const IDLE_SYNC_DELAY_MS = 5 * 60 * 1000; // 5 minutes

async function initialize(cfg) {
  config = cfg;
  sheetAPI = new SheetAPI(config.sheet_webhook_url);
  
  await loadStateFromMongoDB();
  
  console.log(`✅ Core Evaluation initialized (Phase: ${currentCycle?.phase || 'unknown'}, Cycle: ${currentCycle?.cycleNumber || 0})`);
}

async function loadStateFromMongoDB() {
  try {
    if (!dbAPI.connected) {
      console.log('⚠️ MongoDB not connected, skipping state load');
      return;
    }
    
    const stateDoc = await dbAPI.collection(STATE_COLLECTION).findOne({ type: 'evaluation_state' });
    
    if (stateDoc) {
      currentCycle = {
        phase: stateDoc.phase,
        cycleNumber: stateDoc.cycleNumber,
        threadId: stateDoc.threadId,
        startDate: stateDoc.startDate,
        lastUpdated: stateDoc.lastUpdated,
      };
      
      console.log(`📊 Loaded evaluation state: Phase=${currentCycle.phase}, Cycle=${currentCycle.cycleNumber}`);
    } else {
      currentCycle = {
        phase: EVAL_PHASE.STARTING_CP,
        cycleNumber: 1,
        threadId: null,
        startDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };
      
      await dbAPI.collection(STATE_COLLECTION).insertOne({
        type: 'evaluation_state',
        ...currentCycle,
      });
      
      console.log('📊 Created new evaluation state');
    }
  } catch (error) {
    console.error('❌ Error loading evaluation state:', error.message);
    currentCycle = {
      phase: EVAL_PHASE.STARTING_CP,
      cycleNumber: 1,
      threadId: null,
      startDate: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function saveStateToMongoDB() {
  if (!dbAPI.isConnected()) return;
  
  try {
    await dbAPI.collection(STATE_COLLECTION).updateOne(
      { type: 'evaluation_state' },
      { $set: { ...currentCycle, lastUpdated: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (error) {
    console.error('❌ Error saving evaluation state:', error.message);
  }
}

function getCurrentPhase() {
  return currentCycle?.phase || EVAL_PHASE.STARTING_CP;
}

function getCurrentCycleNumber() {
  return currentCycle?.cycleNumber || 1;
}

function getCurrentThreadId() {
  return currentCycle?.threadId || null;
}

function determinePhase() {
  if (!currentCycle || !currentCycle.startDate) {
    return { phase: EVAL_PHASE.STARTING_CP, cycleNumber: 1 };
  }
  
  const startDate = new Date(currentCycle.startDate);
  const now = new Date();
  const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
  
  const twoWeekPeriods = Math.floor(daysSinceStart / 14);
  const newCycleNumber = Math.floor(twoWeekPeriods / 2) + 1;
  const phase = twoWeekPeriods % 2 === 0 ? EVAL_PHASE.STARTING_CP : EVAL_PHASE.ENDING_CP;
  
  return { phase, cycleNumber: newCycleNumber };
}

async function createEvaluationThreadNow(client) {
  const now = new Date();
  const { phase, cycleNumber } = determinePhase();
  
  if (currentCycle && 
      currentCycle.phase === phase && 
      currentCycle.cycleNumber === cycleNumber && 
      currentCycle.threadId) {
    console.log('📋 Core Evaluation thread already exists for this phase');
    return currentCycle.threadId;
  }
  
  const channelId = config.bot_manual_channel_id;
  const channel = await client.channels.fetch(channelId);
  
  if (!channel) {
    console.error('❌ Core Evaluation channel not found');
    return null;
  }
  
  const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  const threadName = `CORE EVALUATION (CURRENT CP) - ${dateStr}`;
  
  const thread = await channel.threads.create({
    name: threadName,
    autoArchiveDuration: 60 * 24 * 7,
    reason: `Core Evaluation ${phase} thread`,
  });
  
  currentCycle = {
    phase,
    cycleNumber,
    threadId: thread.id,
    startDate: currentCycle?.startDate || now.toISOString(),
    lastUpdated: now.toISOString(),
  };
  
  await saveStateToMongoDB();
  
  const phaseText = '📊 **CURRENT CP Phase** - Submit your current CP';
  
  const embed = new EmbedBuilder()
    .setColor(0x4A90E2)
    .setTitle(`🎯 Core Evaluation Thread Created`)
    .setDescription(
      `${phaseText}\n\n` +
      `**Cycle:** ${cycleNumber}\n\n` +
      `**Instructions:**\n` +
      `1. Post \`!CP <NUMBER>\` with your screenshot\n` +
      `2. Example: \`!CP 90,492\` or \`!CP 90492\`\n` +
      `3. Screenshot must show the CP matching your command\n` +
      `   (from Guild Member List in-game)\n` +
      `4. You may use ANY class/ability - post your highest attained CP\n\n` +
      `**How it works:**\n` +
      `• 2-week evaluation cycles\n` +
      `• Current CP → Ending CP (after 2 weeks)\n` +
      `• Top 5 Core members selected by Final Score\n` +
      `• Final Score = CP Points + Attendance Points\n\n` +
      `**Note:** If you submitted before, your latest entry will replace the old one.`
    )
    .addFields(
      { name: '⏰ Thread closes', value: 'Monday 11:59 PM', inline: true },
      { name: '📅 Next evaluation', value: 'In 2 weeks', inline: true },
      { name: '📸 Required Screenshot', value: 'Must show CP from Guild Member List', inline: false },
      { name: '💰 CP Points', value: 'Based on Relative Growth % vs bracket average', inline: true },
      { name: '⭐ Attendance Points', value: '8/8 = 70pts, 7/8 = 60pts, etc.', inline: true }
    )
    .setTimestamp();

  try {
    if (SAMPLE_SCREENSHOT_EXISTS) {
      embed.setThumbnail('attachment://samplecp.png');
      await thread.send({ 
        content: `<@&${config.elysium_role_id}>`,
        embeds: [embed], 
        files: [{ attachment: SAMPLE_SCREENSHOT_PATH, name: 'samplecp.png' }] 
      });
    } else {
      console.warn('⚠️ Sample screenshot not found at:', SAMPLE_SCREENSHOT_PATH);
      await thread.send({ content: `<@&${config.elysium_role_id}>`, embeds: [embed] });
    }
  } catch (err) {
    console.error('❌ Failed to send evaluation thread message:', err.message);
    await thread.send({ content: `<@&${config.elysium_role_id}>`, embeds: [embed] });
  }
  
  console.log(`✅ Created Core Evaluation thread: ${threadName} (ID: ${thread.id})`);
  
  return thread.id;
}

async function checkAndCreateWeeklyThread(client) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  const isMonday = dayOfWeek === 1;
  const isMidnight = hours === 0 && minutes < 5;
  
  if (!isMonday || !isMidnight) {
    return null;
  }
  
  const { phase, cycleNumber } = determinePhase();
  
  if (currentCycle && 
      currentCycle.phase === phase && 
      currentCycle.cycleNumber === cycleNumber && 
      currentCycle.threadId) {
    console.log('📋 Core Evaluation thread already exists for this phase');
    return currentCycle.threadId;
  }
  
  const channelId = config.bot_manual_channel_id;
  const channel = await client.channels.fetch(channelId);
  
  if (!channel) {
    console.error('❌ Core Evaluation channel not found');
    return null;
  }
  
  const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  const threadName = `CORE EVALUATION (CURRENT CP) - ${dateStr}`;
  
  const thread = await channel.threads.create({
    name: threadName,
    autoArchiveDuration: 60 * 24 * 7,
    reason: `Core Evaluation ${phase} thread`,
  });
  
  currentCycle = {
    phase,
    cycleNumber,
    threadId: thread.id,
    startDate: currentCycle?.startDate || now.toISOString(),
    lastUpdated: now.toISOString(),
  };
  
  await saveStateToMongoDB();
  
  const phaseText = '📊 **CURRENT CP Phase** - Submit your current CP';
  
  const embed = new EmbedBuilder()
    .setColor(0x4A90E2)
    .setTitle(`🎯 Core Evaluation Thread Created`)
    .setDescription(
      `${phaseText}\n\n` +
      `**Cycle:** ${cycleNumber}\n\n` +
      `**Instructions:**\n` +
      `1. Post \`!CP <NUMBER>\` with your screenshot\n` +
      `2. Example: \`!CP 90,492\` or \`!CP 90492\`\n` +
      `3. Screenshot must show the CP matching your command\n` +
      `   (from Guild Member List in-game)\n` +
      `4. You may use ANY class/ability - post your highest attained CP\n\n` +
      `**How it works:**\n` +
      `• 2-week evaluation cycles\n` +
      `• Current CP → Ending CP (after 2 weeks)\n` +
      `• Top 5 Core members selected by Final Score\n` +
      `• Final Score = CP Points + Attendance Points\n\n` +
      `**Note:** If you submitted before, your latest entry will replace the old one.`
    )
    .addFields(
      { name: '⏰ Thread closes', value: 'Monday 11:59 PM', inline: true },
      { name: '📅 Next evaluation', value: 'In 2 weeks', inline: true },
      { name: '📸 Required Screenshot', value: 'Must show CP from Guild Member List', inline: false },
      { name: '💰 CP Points', value: 'Based on Relative Growth % vs bracket average', inline: true },
      { name: '⭐ Attendance Points', value: '8/8 = 70pts, 7/8 = 60pts, etc.', inline: true }
    )
    .setTimestamp();

  try {
    if (SAMPLE_SCREENSHOT_EXISTS) {
      embed.setThumbnail('attachment://samplecp.png');
      await thread.send({ 
        content: `<@&${config.elysium_role_id}>`,
        embeds: [embed], 
        files: [{ attachment: SAMPLE_SCREENSHOT_PATH, name: 'samplecp.png' }] 
      });
    } else {
      console.warn('⚠️ Sample screenshot not found at:', SAMPLE_SCREENSHOT_PATH);
      await thread.send({ content: `<@&${config.elysium_role_id}>`, embeds: [embed] });
    }
  } catch (err) {
    console.error('❌ Failed to send evaluation thread message:', err.message);
    await thread.send({ content: `<@&${config.elysium_role_id}>`, embeds: [embed] });
  }
  
  console.log(`✅ Created Core Evaluation thread: ${threadName} (ID: ${thread.id})`);
  
  return thread.id;
}

async function handleCPCommand(message, cpNumber, discordNickname) {
  if (!message.channel.isThread()) {
    await message.reply('❌ Please post in the Core Evaluation thread.');
    return { success: false, error: 'Not in thread' };
  }
  
  const channelId = config.bot_manual_channel_id;
  if (message.channel.parentId !== channelId) {
    await message.reply('❌ This command only works in the Core Evaluation thread.');
    return { success: false, error: 'Wrong channel' };
  }
  
  const hasAttachment = message.attachments.size > 0;
  if (!hasAttachment) {
    await message.reply('❌ Please attach a screenshot showing your CP and character name.');
    return { success: false, error: 'No screenshot' };
  }
  
  const { phase, cycleNumber } = determinePhase();
  
  try {
    if (dbAPI.isConnected()) {
      const previousCycle = await dbAPI.collection(EVAL_COLLECTION)
        .find({ discordId: message.author.id })
        .sort({ cycleNumber: -1 })
        .limit(1)
        .toArray();
      
      if (previousCycle.length > 0) {
        const prevCP = previousCycle[0].cp;
        if (cpNumber < prevCP) {
          await message.reply(`❌ Your CP cannot be lower than your previous submission.\n\nPrevious CP: ${prevCP.toLocaleString()}\nNew CP: ${cpNumber.toLocaleString()}`);
          return { success: false, error: 'CP lower than previous' };
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not check previous CP:', err.message);
  }
  
  const memberData = {
    discordId: message.author.id,
    discordUsername: message.author.username,
    discordNickname: discordNickname,
    cp: cpNumber,
    phase,
    cycleNumber,
    messageId: message.id,
    screenshotUrl: message.attachments.first()?.url,
    submittedAt: new Date().toISOString(),
  };
  
  try {
    if (dbAPI.isConnected()) {
      await dbAPI.collection(EVAL_COLLECTION).deleteMany({
        discordId: message.author.id,
        phase,
        cycleNumber,
      });
      
      await dbAPI.collection(EVAL_COLLECTION).insertOne(memberData);
    }
    
    await message.reply(`✅ **CP Recorded!**\n\n` +
      `**Member:** ${discordNickname}\n` +
      `**CP:** ${cpNumber.toLocaleString()}\n` +
      `**Cycle:** ${cycleNumber}`
    );
    
    console.log(`📊 CP submitted: ${discordNickname} - ${cpNumber} (${phase})`);
    
    // Schedule sync after 5 minutes of idle (collect submissions in bulk)
    scheduleIdleSync();

    return { success: true, data: memberData };
    
  } catch (error) {
    console.error('❌ Error saving CP:', error.message);
    await message.reply('❌ Failed to save your CP. Please try again.');
    return { success: false, error: error.message };
  }
}

/**
 * Schedule Google Sheets sync after 5 minutes of idle
 * Clears any existing timeout and sets new one
 */
function scheduleIdleSync() {
  lastCPSubmissionTime = Date.now();
  
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  syncTimeout = setTimeout(async () => {
    const timeSinceLastSubmit = Date.now() - lastCPSubmissionTime;
    
    if (timeSinceLastSubmit >= IDLE_SYNC_DELAY_MS - 1000) {
      console.log('⏰ 5 minutes idle - syncing to Google Sheets...');
      await syncToGoogleSheet();
    }
  }, IDLE_SYNC_DELAY_MS);
  
  console.log(`⏳ Sync scheduled in ${IDLE_SYNC_DELAY_MS / 1000} minutes`);
}

async function getAllSubmissions(phase, cycleNumber) {
  if (!dbAPI.connected) {
    return [];
  }
  
  const submissions = await dbAPI.collection(EVAL_COLLECTION)
    .find({ phase, cycleNumber })
    .toArray();
  
  return submissions;
}

async function sendEvaluationSummary(client) {
  const channelId = config.bot_manual_channel_id;
  const channel = await client.channels.fetch(channelId);
  
  if (!channel) return;
  
  const { phase, cycleNumber } = determinePhase();
  const submissions = await getAllSubmissions(phase, cycleNumber);
  
  const embed = new EmbedBuilder()
    .setColor(0x4A90E2)
    .setTitle(`📊 Core Evaluation Summary`)
    .setDescription(
      `**Phase:** ${phase === EVAL_PHASE.STARTING_CP ? 'Starting' : 'Ending'} CP\n` +
      `**Cycle:** ${cycleNumber}\n` +
      `**Submissions:** ${submissions.length}`
    )
    .setTimestamp();
  
  if (submissions.length > 0) {
    const memberList = submissions
      .sort((a, b) => b.cp - a.cp)
      .map((s, i) => `${i + 1}. **${s.discordNickname}** - ${s.cp.toLocaleString()} CP`)
      .join('\n');
    
    embed.addFields({ name: 'Submissions', value: memberList.substring(0, 1024) });
  }
  
  await channel.send({ embeds: [embed] });
}

async function syncToGoogleSheet() {
  try {
    const allData = await dbAPI.collection(EVAL_COLLECTION).find({}).sort({ cycleNumber: -1 }).toArray();
    
    if (allData.length === 0) {
      console.log('ℹ️ No evaluation data to sync');
      return { success: true, synced: 0 };
    }
    
    const webAppUrl = 'https://script.google.com/macros/s/AKfycbx4SWRJBQVz2vRndf7Wn7Cb-abqY02_Llwz8M5b2X_oHFavKdxsaoYC4PPUdjkmZfkldQ/exec';
    
    const response = await fetch(webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncEvaluation',
        data: allData,
      }),
    });
    
    const result = await response.json();
    console.log(`📊 Synced ${allData.length} evaluation records to Google Sheets`);
    
    return { success: true, synced: allData.length };
    
  } catch (error) {
    console.error('❌ Error syncing to Google Sheets:', error.message);
    return { success: false, error: error.message };
  }
}

function scheduleEvaluationCheck(client) {
  setInterval(async () => {
    try {
      await checkAndCreateWeeklyThread(client);
    } catch (error) {
      console.error('❌ Error in evaluation check:', error.message);
    }
  }, 60000);
  
  console.log('✅ Core Evaluation weekly check scheduled (every minute)');
}

function scheduleEvaluationReminder(client) {
  const sendReminder = async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    
    // Sunday 11:50 PM - Create thread AND send reminder
    if (dayOfWeek === 0 && hour === 23 && minutes >= 50 && minutes <= 59) {
      // Only send once per Sunday (check date to avoid repeats)
      const todayStr = now.toDateString();
      if (lastReminderSentDate === todayStr) {
        return; // Already sent reminder today
      }
      lastReminderSentDate = todayStr;
      
      // Create thread first so it's ready for the reminder
      await createEvaluationThreadNow(client);
      
      // Send reminder to separate channel
      const reminderChannelId = config.core_evaluation_commands_channel;
      const channel = await client.channels.fetch(reminderChannelId);
      
      if (channel) {
        // Delete old reminder first
        if (reminderMessageId) {
          try {
            const oldMsg = await channel.messages.fetch(reminderMessageId).catch(() => null);
            if (oldMsg) await oldMsg.delete();
          } catch (e) {}
        }
        
        // Get thread link (now it exists!)
        let threadLink = 'Thread is now open!';
        if (currentCycle && currentCycle.threadId) {
          const threadUrl = `https://discord.com/channels/${config.main_guild_id}/${config.bot_manual_channel_id}/${currentCycle.threadId}`;
          threadLink = `[Click here to go to the thread](${threadUrl})`;
        }
        
        const embed = new EmbedBuilder()
          .setColor(0x4A90E2)
          .setTitle('🔔 Core Evaluation Thread Open!')
          .setDescription(
            `**Core Evaluation thread is now open!**\n\n` +
            `**Thread:** ${threadLink}\n\n` +
            `Post your screenshot showing your CP from Guild Member List.\n` +
            `Use \`!CP <number>\` with your screenshot.`
          )
          .setTimestamp();
        
        const sentMsg = await channel.send({ content: `<@&${config.elysium_role_id}>`, embeds: [embed] });
        reminderMessageId = sentMsg.id;
      }
    }
    
    // Monday 12:00 AM - Fallback: create thread if somehow it wasn't created
    if (dayOfWeek === 1 && hour === 0 && minutes < 5) {
      await checkAndCreateWeeklyThread(client);
    }
    
    // Tuesday 12:00 AM - Send evaluation report (after Monday thread closes)
    if (dayOfWeek === 2 && hour === 0 && minutes < 5) {
      await syncToGoogleSheet();
      await sendEvaluationReport(client);
    }
  };
  
  setInterval(sendReminder, 60 * 1000);
  console.log('✅ Core Evaluation reminder and report scheduled (every minute)');
}

async function sendEvaluationReport(client) {
  try {
    // First, close and lock the current thread
    if (currentCycle && currentCycle.threadId) {
      try {
        const channelId = config.bot_manual_channel_id;
        const channel = await client.channels.fetch(channelId);
        if (channel) {
          const thread = await channel.threads.fetch(currentCycle.threadId);
          if (thread && !thread.locked) {
            await thread.setLocked(true, 'Core Evaluation closed');
            await thread.setArchived(true, 'Core Evaluation ended');
            console.log(`🔒 Locked and archived evaluation thread: ${currentCycle.threadId}`);
          }
        }
      } catch (err) {
        console.warn('⚠️ Could not lock thread:', err.message);
      }
    }
    
    // Delete previous reminder if exists
    if (reminderMessageId) {
      try {
        const channelId = config.bot_manual_channel_id;
        const channel = await client.channels.fetch(channelId);
        if (channel) {
          const message = await channel.messages.fetch(reminderMessageId).catch(() => null);
          if (message) {
            await message.delete();
            console.log('🗑️ Deleted reminder message');
          }
        }
      } catch (err) {
        console.warn('⚠️ Could not delete reminder:', err.message);
      }
      reminderMessageId = null;
    }
    
    const channelId = config.bot_manual_channel_id;
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;
    
    const { phase, cycleNumber } = determinePhase();
    
    // Get current cycle submissions
    const submissions = await getAllSubmissions(phase, cycleNumber);
    
    if (submissions.length === 0) {
      console.log('ℹ️ No submissions for evaluation report');
      return;
    }
    
    // Fetch full evaluation data from Google Sheet (includes Final Score after you add Attendance)
    let sheetData = null;
    try {
      const webAppUrl = 'https://script.google.com/macros/s/AKfycbx4SWRJBQVz2vRndf7Wn7Cb-abqY02_Llwz8M5b2X_oHFavKdxsaoYC4PPUdjkmZfkldQ/exec';
      const response = await fetch(`${webAppUrl}?action=getSummary`, { method: 'GET' });
      const result = await response.json();
      if (result && result.members) {
        sheetData = result;
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch from Google Sheet:', err.message);
    }
    
    let top5List, allList;
    
    if (sheetData && sheetData.members && sheetData.members.length > 0) {
      const sortedByScore = [...sheetData.members].sort((a, b) => b.finalScore - a.finalScore);
      const eligible = sortedByScore.filter(m => m.coreEligible === 'Yes');
      
      const top5 = eligible.slice(0, 5);
      top5List = top5.map((m, i) => 
        `🥇 ${i + 1}. **${m.name}** - ${m.finalScore} pts`
      ).join('\n');
    } else {
      const sorted = [...submissions].sort((a, b) => b.cp - a.cp);
      const top5 = sorted.slice(0, 5);
      top5List = top5.map((m, i) => 
        `🥇 ${i + 1}. **${m.discordNickname}** - ${m.cp.toLocaleString()} CP`
      ).join('\n');
    }
    
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🎉 CONGRATULATIONS! 🎉`)
      .setDescription(
        `**Congratulations to our new Core Members for Cycle ${cycleNumber}!**\n\n` +
        `You are the Top 5 based on Final Score (CP + Attendance).\n` +
        `You will be the Core for the next 2 weeks!\n\n` +
        `📋 **CORE MEMBERS:**\n${top5List}`
      )
      .setTimestamp();
    
    await channel.send({ content: '<@&${config.elysium_role_id}>', embeds: [embed] });
    console.log(`📊 Evaluation report sent: ${submissions.length} submissions`);
    
  } catch (error) {
    console.error('❌ Error sending evaluation report:', error.message);
  }
}

async function forceEvaluationNow(client) {
  console.log('🔧 Force running Core Evaluation...');
  
  // Create thread
  await createEvaluationThreadNow(client);
  
  // Send reminder
  const reminderChannelId = config.core_evaluation_commands_channel;
  const channel = await client.channels.fetch(reminderChannelId);
  
  if (channel) {
    let threadLink = 'Thread is now open!';
    if (currentCycle && currentCycle.threadId) {
      const threadUrl = `https://discord.com/channels/${config.main_guild_id}/${config.bot_manual_channel_id}/${currentCycle.threadId}`;
      threadLink = `[Click here to go to the thread](${threadUrl})`;
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x4A90E2)
      .setTitle('🔔 Core Evaluation Thread Open!')
      .setDescription(
        `**Core Evaluation thread is now open!**\n\n` +
        `**Thread:** ${threadLink}\n\n` +
        `Post your screenshot showing your CP from Guild Member List.\n` +
        `Use \`!CP <number>\` with your screenshot.`
      )
      .setTimestamp();
    
    await channel.send({ content: `<@&${config.elysium_role_id}>`, embeds: [embed] });
    console.log('✅ Force evaluation complete');
  }
}

module.exports = {
  initialize,
  handleCPCommand,
  checkAndCreateWeeklyThread,
  getAllSubmissions,
  sendEvaluationSummary,
  syncToGoogleSheet,
  scheduleEvaluationCheck,
  scheduleEvaluationReminder,
  sendEvaluationReport,
  getCurrentPhase,
  getCurrentCycleNumber,
  getCurrentThreadId,
  forceEvaluationNow,
  EVAL_PHASE,
  EVAL_COLLECTION,
};
