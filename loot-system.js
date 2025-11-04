/**
 * ELYSIUM Loot Recognition System
 * Processes boss loot screenshots and logs to Google Sheets
 * Admin-only, admin-logs threads only
 */

const { EmbedBuilder } = require("discord.js");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const fs = require("fs");
const fetch = require("node-fetch");
const errorHandler = require('./utils/error-handler');

const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  LOOT: "🎁",
  BOSS: "🎯",
  SHEET: "📊",
};

let config = null;
let bossPoints = null;
let isAdminFunc = null;

const BLACKLIST = [
  "refining stone",
  "enhancement stone",
  "homun",
  "accessory refining stone",
  "accessory enhancement stone",
  "heart",
  "core",
  "soul",
  "essence",
];

function initialize(cfg, bossPointsData, isAdmin) {
  config = cfg;
  bossPoints = bossPointsData;
  isAdminFunc = isAdmin;
  console.log(`${EMOJI.SUCCESS} Loot system initialized`);
}

function isBlacklisted(item) {
  const lower = item.toLowerCase();

  // Check against static blacklist
  if (BLACKLIST.some((b) => lower.includes(b))) return true;

  // Check against boss names
  for (const bossName of Object.keys(bossPoints)) {
    if (lower.includes(bossName.toLowerCase())) return true;
  }

  return false;
}

async function processImageOCR(imageBuffer) {
  const tempFile = `./tmp_loot_${Date.now()}.png`;
  let textResult = "";

  try {
    // Optimize image for OCR
    await sharp(imageBuffer)
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .normalize()
      .sharpen()
      .gamma(1.2)
      .toFile(tempFile);

    console.log("🔍 Starting OCR recognition (Tesseract v6 mode)...");

    // ✅ v6+ compatible (no worker)
    const result = await Tesseract.recognize(tempFile, "eng", {
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,./\\() ",
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`🕓 Progress: ${(m.progress * 100).toFixed(1)}%`);
        }
      },
    });

    textResult = result?.data?.text || result?.text || "";
    console.log("✅ OCR recognition completed.");
    return textResult;
  } catch (err) {
    console.error(`❌ OCR failed: ${err.message}`);
    throw err;
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
        console.log(`🧹 Deleted temp file: ${tempFile}`);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to delete temp file ${tempFile}: ${err.message}`);
    }

    if (global.gc) global.gc();
  }
}

function parseLoots(ocrText) {
  const loots = [];
  const lines = ocrText.split("\n");

  for (const line of lines) {
    // Match various patterns like "acquired [item] from" or "[item]x2" or just "[item]"
    let match = line.match(/acquired\s+(.+?)\s+from/i);

    if (match) {
      let item = match[1].trim();

      // Fix common OCR errors
      item = item.replace(/Sione/g, "Stone");
      item = item.replace(/Bue/g, "Blue");
      item = item.replace(/V1\s*1c/gi, "Viorent Heart");
      item = item.replace(/\s+/g, " "); // Normalize spaces

      // Skip too short (likely OCR errors)
      if (item.length < 3) continue;

      // Skip blacklisted items
      if (isBlacklisted(item)) continue;

      loots.push({
        item: item,
        quantity: 1,
        suggestedPrice: null, // Will be filled by fetchHistoricalPrices
      });
    }
  }

  return loots;
}

/**
 * Fetch historical prices from ForDistribution tab
 * @returns {Object} Map of item names to their last starting price
 */
async function fetchHistoricalPrices() {
  try {
    console.log('📊 Fetching historical prices from ForDistribution tab...');

    const payload = {
      action: "getHistoricalPrices"
    };

    const response = await fetch(config.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn(`⚠️ Failed to fetch historical prices: HTTP ${response.status}`);
      return {};
    }

    const data = await response.json();

    if (data.status === "ok" && data.prices) {
      console.log(`✅ Loaded ${Object.keys(data.prices).length} historical prices`);
      return data.prices;
    }

    console.warn(`⚠️ No historical prices available`);
    return {};
  } catch (err) {
    console.error(`❌ Error fetching historical prices:`, err.message);
    return {};
  }
}

/**
 * Match loot items with historical prices
 * @param {Array} loots - Array of loot objects
 * @param {Object} historicalPrices - Map of item names to prices
 * @returns {Array} Loots with suggested prices
 */
function matchHistoricalPrices(loots, historicalPrices) {
  if (!historicalPrices || Object.keys(historicalPrices).length === 0) {
    return loots;
  }

  return loots.map(loot => {
    const itemLower = loot.item.toLowerCase().trim();

    // Try exact match first
    for (const [historicalItem, price] of Object.entries(historicalPrices)) {
      if (historicalItem.toLowerCase().trim() === itemLower) {
        return {
          ...loot,
          suggestedPrice: price
        };
      }
    }

    // Try partial match (item name contains or is contained in historical name)
    for (const [historicalItem, price] of Object.entries(historicalPrices)) {
      const histLower = historicalItem.toLowerCase().trim();
      if (itemLower.includes(histLower) || histLower.includes(itemLower)) {
        return {
          ...loot,
          suggestedPrice: price
        };
      }
    }

    // No match found
    return loot;
  });
}

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

  return null;
}

async function handleLootCommand(message, args, client) {
  // Verify this is admin-logs thread
  if (!message.channel.isThread()) {
    await message.reply(
      `${EMOJI.ERROR} \`!loot\` only works in admin-logs threads, not channels.`
    );
    return;
  }

  const guild = message.guild;
  const adminLogsChannelId = message.client.config?.admin_logs_channel_id;

  if (message.channel.parentId !== adminLogsChannelId) {
    await message.reply(
      `${EMOJI.ERROR} \`!loot\` only works in admin-logs threads.`
    );
    return;
  }

  // Verify admin
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  if (!member || !isAdminFunc(member, config)) {
    await message.reply(`${EMOJI.ERROR} Only admins can use \`!loot\`.`);
    return;
  }

  // Verify attachments
  if (!message.attachments || message.attachments.size === 0) {
    await message.reply(
      `${EMOJI.ERROR} Please attach at least one screenshot of the loot.`
    );
    return;
  }

  // Parse command arguments
  if (args.length < 2) {
    await message.reply(
      `${EMOJI.ERROR} Usage: \`!loot <boss> <date> <time>\`\n\n` +
        `Example: \`!loot EGO 10/27/2025 5:57:00\`\n` +
        `Example: \`!loot LADY DALIA 10/27/2025 3:32:00\`\n` +
        `Example: \`!loot GUILD BOSS 10/27/2025 21:00:00\``
    );
    return;
  }

  // Reconstruct boss name and timestamp
  // Format: "!loot EGO 10/27/2025 5:57:00" or "!loot LADY DALIA 10/27/2025 3:32:00"
  // We need to find where the date starts (format: MM/DD/YYYY)

  let bossName = null;
  let dateStr = null;
  let timeStr = null;
  let fullBossKey = null;

  // Find the date pattern
  const datePattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}:\d{2})/;
  const dateMatch = message.content.match(datePattern);

  if (!dateMatch) {
    await message.reply(
      `${EMOJI.ERROR} Invalid date/time format. Use: \`MM/DD/YYYY HH:MM:SS\``
    );
    return;
  }

  dateStr = dateMatch[1];
  timeStr = dateMatch[2];

  // Extract boss name (everything before the date)
  const beforeDate = message.content
    .substring(0, dateMatch.index)
    .replace("!loot", "")
    .trim();
  bossName = findBossMatch(beforeDate);

  if (!bossName) {
    await message.reply(
      `${EMOJI.ERROR} Unknown boss: "${beforeDate}"\n\n` +
        `Available bosses: ${Object.keys(bossPoints).join(", ")}`
    );
    return;
  }

  fullBossKey = `${bossName} ${dateStr} ${timeStr}`;

  // Show loading message
  const processingMsg = await message.reply(
    `${EMOJI.LOOT} **Processing ${message.attachments.size} screenshot(s)...**\n\n` +
      `Boss: **${bossName}**\n` +
      `Time: **${dateStr} ${timeStr}**\n\n` +
      `Reading OCR... (this may take a moment)`
  );

  // Process each attachment
  const allLoots = [];
  let successCount = 0;
  let failCount = 0;

  for (const [attachId, attachment] of message.attachments) {
    try {
      console.log(`📸 Processing: ${attachment.name}`);

      // Download image
      const response = await fetch(attachment.url);
      const buffer = await response.buffer();

      // Process OCR
      const ocrText = await processImageOCR(buffer);
      const loots = parseLoots(ocrText);

      if (loots.length === 0) {
        console.log(`⚠️ No valid loots found in ${attachment.name}`);
        failCount++;
        continue;
      }

      allLoots.push(...loots);
      successCount++;

      console.log(`✅ Found ${loots.length} items in ${attachment.name}`);
    } catch (err) {
      console.error(`❌ OCR error for ${attachment.name}:`, err.message);
      failCount++;
    }
  }

  // Check results
  if (allLoots.length === 0) {
    await processingMsg.edit(
      `${EMOJI.ERROR} **Cannot read loot from screenshots**\n\n` +
        `Processed: ${successCount}/${message.attachments.size} images\n` +
        `Valid items found: 0\n\n` +
        `Please do manual entry or provide clearer screenshots.`
    );
    return;
  }

  // Fetch historical prices and match with loot items
  console.log('📊 Fetching historical prices for auto-pricing...');
  const historicalPrices = await fetchHistoricalPrices();
  const enrichedLoots = matchHistoricalPrices(allLoots, historicalPrices);

  // Count how many items got suggested prices
  const withPrices = enrichedLoots.filter(l => l.suggestedPrice !== null).length;
  if (withPrices > 0) {
    console.log(`✅ Found suggested prices for ${withPrices}/${enrichedLoots.length} items`);
  }

  // Build result embed
  const resultEmbed = new EmbedBuilder()
    .setColor(0x4a90e2)
    .setTitle(`${EMOJI.LOOT} Loot Recognition Results`)
    .addFields(
      {
        name: `${EMOJI.BOSS} Boss`,
        value: bossName,
        inline: true,
      },
      {
        name: "📅 Date",
        value: dateStr,
        inline: true,
      },
      {
        name: "⏰ Time",
        value: timeStr,
        inline: true,
      },
      {
        name: `${EMOJI.SHEET} Items Found`,
        value: `${allLoots.length}`,
        inline: false,
      },
      {
        name: "🎁 Loot List",
        value:
          enrichedLoots
            .map(
              (l, i) =>
                `${i + 1}. ${l.item}${l.quantity > 1 ? ` x${l.quantity}` : ""}${
                  l.suggestedPrice !== null ? ` 💰 **${l.suggestedPrice}pts**` : ""
                }`
            )
            .join("\n") || "None",
        inline: false,
      }
    )
    .setFooter({
      text: `Screenshots processed: ${successCount}/${message.attachments.size}`,
    })
    .setTimestamp();

  // Send for confirmation
  const confirmMsg = await processingMsg.edit({
    embeds: [resultEmbed],
    content:
      `${EMOJI.LOOT} **Ready to submit to Google Sheets?**\n\n` +
      `React ${EMOJI.SUCCESS} to confirm or ${EMOJI.ERROR} to cancel.\n\n` +
      `⏱️ 30 second timeout`,
  });

  await confirmMsg.react(EMOJI.SUCCESS);
  await confirmMsg.react(EMOJI.ERROR);

  const filter = (reaction, user) =>
    [EMOJI.SUCCESS, EMOJI.ERROR].includes(reaction.emoji.name) &&
    user.id === message.author.id;

  try {
    const collected = await confirmMsg.awaitReactions({
      filter,
      max: 1,
      time: 30000,
      errors: ["time"],
    });

    const reaction = collected.first();

    if (reaction.emoji.name === EMOJI.SUCCESS) {
      // Submit to sheets
      await submitLootToSheet(
        enrichedLoots,
        bossName,
        fullBossKey,
        dateStr,
        timeStr,
        message,
        confirmMsg
      );
    } else {
      await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');
      await message.reply(
        `${EMOJI.ERROR} Loot submission canceled. No data was saved.`
      );
    }
  } catch (err) {
    await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');
    await message.reply(
      `${EMOJI.ERROR} Confirmation timed out. No data was saved.`
    );
  }
}

async function submitLootToSheet(
  loots,
  bossName,
  fullBossKey,
  dateStr,
  timeStr,
  message,
  confirmMsg
) {
  try {
    // Determine source with proper case
    let source;
    if (bossName.toUpperCase() === "GUILD BOSS") {
      source = "Guild Boss"; // Proper case, not all caps
    } else {
      source = "Loot"; // Proper case, not all caps
    }

    // Format boss key to all uppercase
    const bossKeyUpperCase = fullBossKey.toUpperCase();

    // Prepare payload for each loot item
    const lootEntries = loots.map((loot) => {
      const entry = {
        item: loot.item,
        source: source, // "Loot" or "Guild Boss" (proper case)
        quantity: loot.quantity,
        boss: bossKeyUpperCase, // All uppercase
      };

      // Include suggested price if available
      if (loot.suggestedPrice !== null) {
        entry.startingPrice = loot.suggestedPrice;
      }

      return entry;
    });

    // Send to sheet webhook
    const payload = {
      action: "submitLootEntries",
      entries: lootEntries,
      timestamp: new Date().toISOString(),
    };

    console.log(`📤 Submitting ${lootEntries.length} loot entries to sheet...`);
    console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));

    const response = await fetch(config.sheet_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log(`📊 Sheet response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Sheet error response: ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseText = await response.text();
    console.log(`📄 Sheet response text: ${responseText}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      console.error(`❌ JSON parse error: ${parseErr.message}`);
      throw new Error(
        `Invalid JSON response: ${responseText.substring(0, 200)}`
      );
    }

    console.log(`📊 Parsed response:`, JSON.stringify(data, null, 2));

    // Check if submission actually succeeded
    if (data.status === "error") {
      throw new Error(`Sheet error: ${data.message || "Unknown error"}`);
    }

    if (data.submitted === 0) {
      throw new Error(
        `No items were submitted to the sheet. Check Apps Script logs.`
      );
    }

    // Remove reactions
    await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');

    // Send success message with detailed info
    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`${EMOJI.SUCCESS} Loot Submitted Successfully!`)
      .setDescription(
        `**${
          data.submitted || lootEntries.length
        }** item(s) added to BiddingItems sheet` +
          (data.failed > 0 ? `\n⚠️ ${data.failed} item(s) failed` : "")
      )
      .addFields(
        {
          name: `${EMOJI.BOSS} Boss`,
          value: bossName,
          inline: true,
        },
        {
          name: "📅 Date",
          value: dateStr,
          inline: true,
        },
        {
          name: "⏰ Time",
          value: timeStr,
          inline: true,
        },
        {
          name: "📝 Formatting",
          value: `Source: **${source}**\nBoss: **${bossKeyUpperCase}**`,
          inline: false,
        },
        {
          name: "📋 Items Logged",
          value:
            lootEntries
              .map(
                (e, i) =>
                  `${i + 1}. ${e.item}${
                    e.quantity > 1 ? ` x${e.quantity}` : ""
                  }`
              )
              .slice(0, 10) // Show max 10 items
              .join("\n") || "None",
          inline: false,
        }
      )
      .setFooter({
        text: `Data saved to BiddingItems | Last row: ${data.lastRow || "N/A"}`,
      })
      .setTimestamp();

    // If more than 10 items, add a note
    if (lootEntries.length > 10) {
      successEmbed.addFields({
        name: "📋 Additional Items",
        value: `+${lootEntries.length - 10} more items (total: ${
          lootEntries.length
        })`,
        inline: false,
      });
    }

    await message.reply({ embeds: [successEmbed] });

    console.log(
      `✅ Loot submitted: ${bossName} - ${data.submitted}/${lootEntries.length} items`
    );
    console.log(`   Source: ${source} | Boss: ${bossKeyUpperCase}`);
  } catch (err) {
    console.error(`❌ Sheet submission error:`, err);
    console.error(`❌ Error stack:`, err.stack);

    await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`${EMOJI.ERROR} Failed to Submit to Google Sheets`)
      .setDescription(`**Error:** ${err.message}`)
      .addFields(
        {
          name: "🔍 Troubleshooting Steps",
          value:
            `1. Check if webhook URL is correct in config.json\n` +
            `2. Check Apps Script logs: https://script.google.com\n` +
            `3. Verify BiddingItems sheet exists\n` +
            `4. Check if Apps Script has permissions`,
          inline: false,
        },
        {
          name: "📦 Items to Log Manually",
          value:
            loots
              .map(
                (l, i) =>
                  `${i + 1}. ${l.item}${
                    l.quantity > 1 ? ` x${l.quantity}` : ""
                  }`
              )
              .slice(0, 10)
              .join("\n") || "None",
          inline: false,
        }
      )
      .setFooter({ text: `Boss: ${bossName} | Time: ${dateStr} ${timeStr}` })
      .setTimestamp();

    await message.reply({ embeds: [errorEmbed] });
  }
}

module.exports = {
  initialize,
  handleLootCommand,
};
