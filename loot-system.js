/**
 * ============================================================================
 * ELYSIUM LOOT RECOGNITION SYSTEM
 * ============================================================================
 *
 * PURPOSE:
 * Automates the process of logging boss loot to Google Sheets using OCR
 * (Optical Character Recognition) to read loot from screenshots.
 *
 * FEATURES:
 * - OCR-based loot recognition from screenshots using Tesseract.js
 * - Image preprocessing with Sharp for optimal OCR accuracy
 * - Intelligent item parsing with OCR error correction
 * - Blacklist filtering for unwanted items (stones, cores, etc.)
 * - Historical price matching from ForDistribution tab
 * - Boss name matching with alias support
 * - Batch processing of multiple screenshots
 * - User confirmation before submitting to sheets
 * - Automatic formatting for BiddingItems sheet
 *
 * WORKFLOW:
 * 1. Admin uploads screenshot(s) in admin-logs thread
 * 2. Command: !loot <boss> <date> <time>
 * 3. System downloads and preprocesses images
 * 4. OCR extracts text from screenshots
 * 5. Parser identifies loot items from OCR text
 * 6. Items filtered against blacklist
 * 7. Historical prices fetched and matched
 * 8. Results shown to admin for confirmation
 * 9. On confirmation, data submitted to Google Sheets
 * 10. Success/error feedback provided to admin
 *
 * PERMISSIONS:
 * - Admin-only command
 * - Must be used in admin-logs threads only
 *
 * DEPENDENCIES:
 * - Tesseract.js: OCR engine
 * - Sharp: Image preprocessing
 * - Google Sheets: Data storage via webhook
 *
 * @module loot-system
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

const { EmbedBuilder } = require("discord.js");
const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const fs = require("fs");
const { SheetAPI } = require('./utils/sheet-api');
const errorHandler = require('./utils/error-handler');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Emoji constants used throughout the loot system
 */
const EMOJI = {
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  LOOT: "🎁",
  BOSS: "🎯",
  SHEET: "📊",
};

/**
 * Blacklist of items to exclude from loot recognition
 * These are common drops that shouldn't be tracked for bidding:
 * - Enhancement/refining materials (too common, low value)
 * - Boss-specific materials (handled separately)
 * - Generic upgrade materials (hearts, cores, souls, essences)
 */
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

// ============================================================================
// MODULE STATE
// ============================================================================

/**
 * Module configuration and dependencies
 * Initialized by the initialize() function
 */
let config = null;           // Bot configuration from config.json
let bossPoints = null;       // Boss metadata with names and aliases
let isAdminFunc = null;      // Function to check admin permissions
let sheetAPI = null;         // Unified Google Sheets API client

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the loot system with required dependencies
 * Must be called before any loot commands can be processed
 *
 * @param {Object} cfg - Bot configuration object from config.json
 * @param {Object} bossPointsData - Boss metadata including names and aliases
 * @param {Function} isAdmin - Function to check if a member is an admin
 *
 * @example
 * initialize(config, bossPoints, isAdmin);
 * // Output: ✅ Loot system initialized
 */
function initialize(cfg, bossPointsData, isAdmin) {
  config = cfg;
  bossPoints = bossPointsData;
  isAdminFunc = isAdmin;
  sheetAPI = new SheetAPI(cfg.sheet_webhook_url);
  console.log(`${EMOJI.SUCCESS} Loot system initialized`);
}

// ============================================================================
// ITEM FILTERING
// ============================================================================

/**
 * Checks if an item should be filtered out based on blacklist
 * Items are blacklisted if they:
 * 1. Match any entry in the BLACKLIST array (case-insensitive, partial match)
 * 2. Contain a boss name (to avoid recognizing boss names as items)
 *
 * @param {string} item - The item name to check
 * @returns {boolean} True if item should be filtered out, false otherwise
 *
 * @example
 * isBlacklisted("Enhancement Stone") // true
 * isBlacklisted("EGO") // true (boss name)
 * isBlacklisted("Violet Heart") // false
 */
function isBlacklisted(item) {
  const lower = item.toLowerCase();

  // Check against static blacklist (stones, materials, etc.)
  if (BLACKLIST.some((b) => lower.includes(b))) return true;

  // Check against boss names to avoid false positives
  // (e.g., "EGO" appearing in OCR text shouldn't be logged as an item)
  for (const bossName of Object.keys(bossPoints)) {
    if (lower.includes(bossName.toLowerCase())) return true;
  }

  return false;
}

// ============================================================================
// IMAGE PROCESSING & OCR
// ============================================================================

/**
 * Processes an image using OCR to extract text
 *
 * PROCESS:
 * 1. Preprocesses image with Sharp (resize, normalize, sharpen, adjust gamma)
 * 2. Saves optimized image to temporary file
 * 3. Runs Tesseract OCR with custom character whitelist
 * 4. Extracts and returns recognized text
 * 5. Cleans up temporary file
 * 6. Triggers garbage collection if available
 *
 * IMAGE OPTIMIZATIONS:
 * - Resize to max 2000x2000 (better OCR accuracy without bloat)
 * - Normalize (adjusts contrast/brightness)
 * - Sharpen (enhances text edges)
 * - Gamma 1.2 (brightens dark screenshots)
 *
 * @param {Buffer} imageBuffer - Raw image data from Discord attachment
 * @returns {Promise<string>} Extracted text from OCR
 * @throws {Error} If OCR processing fails
 *
 * @example
 * const buffer = await fetch(attachment.url).then(r => r.buffer());
 * const text = await processImageOCR(buffer);
 * // text: "You acquired Violet Heart from EGO\nYou acquired Blue Feather from..."
 */
async function processImageOCR(imageBuffer) {
  const tempFile = `./tmp_loot_${Date.now()}.png`;
  let textResult = "";

  try {
    // Optimize image for OCR with Sharp preprocessing
    // Each step improves OCR accuracy for game screenshots
    await sharp(imageBuffer)
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })  // Optimal OCR size
      .normalize()      // Auto-adjust contrast/brightness
      .sharpen()        // Enhance text edges
      .gamma(1.2)       // Brighten dark screenshots
      .toFile(tempFile);

    console.log("🔍 Starting OCR recognition (Tesseract v6 mode)...");

    // Run Tesseract OCR with custom settings
    // Character whitelist improves accuracy by limiting valid characters
    const result = await Tesseract.recognize(tempFile, "eng", {
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,./\\() ",
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`🕓 Progress: ${(m.progress * 100).toFixed(1)}%`);
        }
      },
    });

    // Extract text from result (compatible with Tesseract v5 and v6)
    textResult = result?.data?.text || result?.text || "";
    console.log("✅ OCR recognition completed.");
    return textResult;
  } catch (err) {
    console.error(`❌ OCR failed: ${err.message}`);
    throw err;
  } finally {
    // Clean up temp file to avoid disk clutter
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
        console.log(`🧹 Deleted temp file: ${tempFile}`);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to delete temp file ${tempFile}: ${err.message}`);
    }

    // Trigger garbage collection if enabled (helps with memory management for large images)
    if (global.gc) global.gc();
  }
}

// ============================================================================
// LOOT PARSING
// ============================================================================

/**
 * Parses OCR text to extract loot items
 *
 * PARSING LOGIC:
 * 1. Splits OCR text into lines
 * 2. Looks for "acquired [item] from" pattern (common in game logs)
 * 3. Extracts item name from match
 * 4. Applies OCR error corrections (common misreads)
 * 5. Filters out items that are too short (likely errors)
 * 6. Filters out blacklisted items
 * 7. Returns array of loot objects
 *
 * OCR ERROR CORRECTIONS:
 * - "Sione" → "Stone" (common misread)
 * - "Bue" → "Blue" (common misread)
 * - "V1 1c" → "Viorent Heart" (specific known error)
 * - Multiple spaces → single space (normalization)
 *
 * @param {string} ocrText - Raw text extracted from OCR
 * @returns {Array<Object>} Array of loot objects with properties:
 *   - item {string}: Item name
 *   - quantity {number}: Amount (default 1)
 *   - suggestedPrice {number|null}: Price suggestion (populated later)
 *
 * @example
 * const ocrText = "You acquired Violet Heart from EGO\nYou acquired Blue Feather from LADY DALIA";
 * const loots = parseLoots(ocrText);
 * // [
 * //   { item: "Violet Heart", quantity: 1, suggestedPrice: null },
 * //   { item: "Blue Feather", quantity: 1, suggestedPrice: null }
 * // ]
 */
function parseLoots(ocrText) {
  const loots = [];
  const lines = ocrText.split("\n");

  for (const line of lines) {
    // Match the common loot pattern: "acquired [item] from [boss]"
    let match = line.match(/acquired\s+(.+?)\s+from/i);

    if (match) {
      let item = match[1].trim();

      // Fix common OCR errors that we've observed in production
      item = item.replace(/Sione/g, "Stone");           // OCR often misreads "Stone"
      item = item.replace(/Bue/g, "Blue");              // OCR often misreads "Blue"
      item = item.replace(/V1\s*1c/gi, "Viorent Heart"); // Specific known error
      item = item.replace(/\s+/g, " ");                  // Normalize multiple spaces

      // Skip items that are too short (likely OCR errors or fragments)
      if (item.length < 3) continue;

      // Skip blacklisted items (common materials we don't want to track)
      if (isBlacklisted(item)) continue;

      loots.push({
        item: item,
        quantity: 1,
        suggestedPrice: null, // Will be populated by matchHistoricalPrices()
      });
    }
  }

  return loots;
}

// ============================================================================
// PRICE SUGGESTION SYSTEM
// ============================================================================

/**
 * Fetches historical auction prices from Google Sheets
 *
 * Queries the ForDistribution tab to get the most recent starting prices
 * for items that have been auctioned before. This helps admins by suggesting
 * reasonable starting prices based on past auctions.
 *
 * SHEET INTEGRATION:
 * - Calls Apps Script with action: "getHistoricalPrices"
 * - Apps Script scans ForDistribution tab
 * - Returns map of item names to their last used starting prices
 *
 * @returns {Promise<Object>} Map of item names (lowercase) to prices
 *   Example: { "violet heart": 150, "blue feather": 200 }
 *   Returns empty object {} if fetch fails or no data available
 *
 * @example
 * const prices = await fetchHistoricalPrices();
 * // { "violet heart": 150, "blue feather": 200, ... }
 */
async function fetchHistoricalPrices() {
  try {
    console.log('📊 Fetching historical prices from ForDistribution tab...');

    const data = await sheetAPI.call('getHistoricalPrices');

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
 * Matches recognized loot items with historical prices
 *
 * MATCHING STRATEGY:
 * 1. Try exact match (case-insensitive)
 * 2. Try partial match (either direction contains the other)
 * 3. If no match, leave suggestedPrice as null
 *
 * This helps admins by pre-filling reasonable starting bid amounts
 * based on what similar items have sold for in the past.
 *
 * @param {Array<Object>} loots - Array of loot objects from parseLoots()
 * @param {Object} historicalPrices - Map from fetchHistoricalPrices()
 * @returns {Array<Object>} Loots with suggestedPrice populated where matches found
 *
 * @example
 * const loots = [
 *   { item: "Violet Heart", quantity: 1, suggestedPrice: null }
 * ];
 * const prices = { "violet heart": 150 };
 * const enriched = matchHistoricalPrices(loots, prices);
 * // [{ item: "Violet Heart", quantity: 1, suggestedPrice: 150 }]
 */
function matchHistoricalPrices(loots, historicalPrices) {
  // If no historical data, return loots unchanged
  if (!historicalPrices || Object.keys(historicalPrices).length === 0) {
    return loots;
  }

  return loots.map(loot => {
    const itemLower = loot.item.toLowerCase().trim();

    // Try exact match first (most reliable)
    for (const [historicalItem, price] of Object.entries(historicalPrices)) {
      if (historicalItem.toLowerCase().trim() === itemLower) {
        return {
          ...loot,
          suggestedPrice: price
        };
      }
    }

    // Try partial match (handles variants like "Blue Feather [1]" vs "Blue Feather")
    for (const [historicalItem, price] of Object.entries(historicalPrices)) {
      const histLower = historicalItem.toLowerCase().trim();
      if (itemLower.includes(histLower) || histLower.includes(itemLower)) {
        return {
          ...loot,
          suggestedPrice: price
        };
      }
    }

    // No match found, return unchanged
    return loot;
  });
}

// ============================================================================
// BOSS NAME MATCHING
// ============================================================================

/**
 * Finds a boss name from user input, checking exact matches and aliases
 *
 * MATCHING LOGIC:
 * 1. Normalize input (lowercase, trim)
 * 2. Check exact match against boss names
 * 3. Check exact match against boss aliases
 * 4. Return canonical boss name or null
 *
 * This allows users to use shortcuts like "LD" instead of "LADY DALIA"
 *
 * @param {string} input - User input (e.g., "EGO", "LADY DALIA", "LD")
 * @returns {string|null} Canonical boss name or null if no match
 *
 * @example
 * findBossMatch("EGO") // "EGO"
 * findBossMatch("ld") // "LADY DALIA"
 * findBossMatch("unknown") // null
 */
function findBossMatch(input) {
  const q = input.toLowerCase().trim();

  // Check all boss names and their aliases
  for (const name of Object.keys(bossPoints)) {
    // Check exact name match
    if (name.toLowerCase() === q) return name;

    // Check alias matches
    const meta = bossPoints[name];
    for (const alias of meta.aliases || []) {
      if (alias.toLowerCase() === q) return name;
    }
  }

  // No match found
  return null;
}

// ============================================================================
// COMMAND HANDLER
// ============================================================================

/**
 * Main handler for the !loot command
 *
 * COMPLETE WORKFLOW:
 * 1. VALIDATION PHASE:
 *    - Verify command used in thread (not channel)
 *    - Verify thread is in admin-logs channel
 *    - Verify user is an admin
 *    - Verify attachments exist
 *    - Parse and validate command arguments
 *
 * 2. BOSS MATCHING PHASE:
 *    - Extract boss name from command
 *    - Match against known bosses and aliases
 *    - Validate date/time format
 *
 * 3. PROCESSING PHASE:
 *    - Download each screenshot from Discord
 *    - Run OCR on each image
 *    - Parse loot items from OCR text
 *    - Aggregate items from all screenshots
 *
 * 4. ENRICHMENT PHASE:
 *    - Fetch historical prices from sheets
 *    - Match prices to recognized items
 *    - Build result embed with suggestions
 *
 * 5. CONFIRMATION PHASE:
 *    - Display results to admin
 *    - Add reaction buttons for confirm/cancel
 *    - Wait for admin response (30s timeout)
 *
 * 6. SUBMISSION PHASE (if confirmed):
 *    - Format data for BiddingItems sheet
 *    - Submit to Google Sheets via webhook
 *    - Display success/error feedback
 *
 * @param {Message} message - Discord message object from command
 * @param {Array<string>} args - Command arguments (boss name, date, time)
 * @param {Client} client - Discord client instance
 * @returns {Promise<void>}
 *
 * @example
 * // User command: !loot EGO 10/27/2025 5:57:00
 * await handleLootCommand(message, ["EGO", "10/27/2025", "5:57:00"], client);
 */
async function handleLootCommand(message, args, client) {
  // ========================================
  // VALIDATION: Thread Check
  // ========================================
  // Only allow command in threads, not regular channels
  if (!message.channel.isThread()) {
    await message.reply(
      `${EMOJI.ERROR} \`!loot\` only works in admin-logs threads, not channels.`
    );
    return;
  }

  const guild = message.guild;
  const adminLogsChannelId = message.client.config?.admin_logs_channel_id;

  // ========================================
  // VALIDATION: Admin-Logs Thread Check
  // ========================================
  // Ensure command is used in admin-logs threads only
  if (message.channel.parentId !== adminLogsChannelId) {
    await message.reply(
      `${EMOJI.ERROR} \`!loot\` only works in admin-logs threads.`
    );
    return;
  }

  // ========================================
  // VALIDATION: Admin Permission Check
  // ========================================
  const member = await guild.members.fetch(message.author.id).catch(() => null);
  if (!member || !isAdminFunc(member, config)) {
    await message.reply(`${EMOJI.ERROR} Only admins can use \`!loot\`.`);
    return;
  }

  // ========================================
  // VALIDATION: Screenshot Attachment Check
  // ========================================
  if (!message.attachments || message.attachments.size === 0) {
    await message.reply(
      `${EMOJI.ERROR} Please attach at least one screenshot of the loot.`
    );
    return;
  }

  // ========================================
  // VALIDATION: Argument Check
  // ========================================
  if (args.length < 2) {
    await message.reply(
      `${EMOJI.ERROR} Usage: \`!loot <boss> <date> <time>\`\n\n` +
        `Example: \`!loot EGO 10/27/2025 5:57:00\`\n` +
        `Example: \`!loot LADY DALIA 10/27/2025 3:32:00\`\n` +
        `Example: \`!loot GUILD BOSS 10/27/2025 21:00:00\``
    );
    return;
  }

  // ========================================
  // PARSING: Boss Name and Timestamp
  // ========================================
  // Command format: "!loot <BOSS NAME> MM/DD/YYYY HH:MM:SS"
  // Boss name can be multi-word (e.g., "LADY DALIA", "GUILD BOSS")
  // We find the date pattern to split boss name from timestamp

  let bossName = null;
  let dateStr = null;
  let timeStr = null;
  let fullBossKey = null;

  // Find the date/time pattern in the command
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

  // Extract boss name (everything between "!loot" and the date)
  const beforeDate = message.content
    .substring(0, dateMatch.index)
    .replace("!loot", "")
    .trim();
  bossName = findBossMatch(beforeDate);

  // ========================================
  // VALIDATION: Boss Name Match
  // ========================================
  if (!bossName) {
    await message.reply(
      `${EMOJI.ERROR} Unknown boss: "${beforeDate}"\n\n` +
        `Available bosses: ${Object.keys(bossPoints).join(", ")}`
    );
    return;
  }

  // Create full boss key for sheet (e.g., "EGO 10/27/2025 5:57:00")
  fullBossKey = `${bossName} ${dateStr} ${timeStr}`;

  // ========================================
  // PROCESSING: Show Loading Message
  // ========================================
  const processingMsg = await message.reply(
    `${EMOJI.LOOT} **Processing ${message.attachments.size} screenshot(s)...**\n\n` +
      `Boss: **${bossName}**\n` +
      `Time: **${dateStr} ${timeStr}**\n\n` +
      `Reading OCR... (this may take a moment)`
  );

  // ========================================
  // PROCESSING: OCR Each Screenshot
  // ========================================
  const allLoots = [];
  let successCount = 0;
  let failCount = 0;

  for (const [attachId, attachment] of message.attachments) {
    try {
      console.log(`📸 Processing: ${attachment.name}`);

      // Download image from Discord CDN
      const response = await fetch(attachment.url);
      const buffer = await response.buffer();

      // Run OCR and parse loot items
      const ocrText = await processImageOCR(buffer);
      const loots = parseLoots(ocrText);

      if (loots.length === 0) {
        console.log(`⚠️ No valid loots found in ${attachment.name}`);
        failCount++;
        continue;
      }

      // Add items from this screenshot to the aggregate list
      allLoots.push(...loots);
      successCount++;

      console.log(`✅ Found ${loots.length} items in ${attachment.name}`);
    } catch (err) {
      console.error(`❌ OCR error for ${attachment.name}:`, err.message);
      failCount++;
    }
  }

  // ========================================
  // VALIDATION: Check If Any Loot Found
  // ========================================
  if (allLoots.length === 0) {
    await processingMsg.edit(
      `${EMOJI.ERROR} **Cannot read loot from screenshots**\n\n` +
        `Processed: ${successCount}/${message.attachments.size} images\n` +
        `Valid items found: 0\n\n` +
        `Please do manual entry or provide clearer screenshots.`
    );
    return;
  }

  // ========================================
  // ENRICHMENT: Historical Price Matching
  // ========================================
  console.log('📊 Fetching historical prices for auto-pricing...');
  const historicalPrices = await fetchHistoricalPrices();
  const enrichedLoots = matchHistoricalPrices(allLoots, historicalPrices);

  // Log how many prices were matched
  const withPrices = enrichedLoots.filter(l => l.suggestedPrice !== null).length;
  if (withPrices > 0) {
    console.log(`✅ Found suggested prices for ${withPrices}/${enrichedLoots.length} items`);
  }

  // ========================================
  // DISPLAY: Build Result Embed
  // ========================================
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

  // ========================================
  // CONFIRMATION: Show Results & Add Reactions
  // ========================================
  const confirmMsg = await processingMsg.edit({
    embeds: [resultEmbed],
    content:
      `${EMOJI.LOOT} **Ready to submit to Google Sheets?**\n\n` +
      `React ${EMOJI.SUCCESS} to confirm or ${EMOJI.ERROR} to cancel.\n\n` +
      `⏱️ 30 second timeout`,
  });

  // OPTIMIZATION v6.8: Parallel reactions (2x faster)
  await Promise.all([
    confirmMsg.react(EMOJI.SUCCESS),
    confirmMsg.react(EMOJI.ERROR)
  ]);

  // Filter to only accept reactions from the command user
  const filter = (reaction, user) =>
    [EMOJI.SUCCESS, EMOJI.ERROR].includes(reaction.emoji.name) &&
    user.id === message.author.id;

  // ========================================
  // CONFIRMATION: Wait for Admin Response
  // ========================================
  try {
    const collected = await confirmMsg.awaitReactions({
      filter,
      max: 1,
      time: 30000,
      errors: ["time"],
    });

    const reaction = collected.first();

    // ========================================
    // SUBMISSION: User Confirmed
    // ========================================
    if (reaction.emoji.name === EMOJI.SUCCESS) {
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
      // ========================================
      // CANCELLATION: User Declined
      // ========================================
      await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');
      await message.reply(
        `${EMOJI.ERROR} Loot submission canceled. No data was saved.`
      );
    }
  } catch (err) {
    // ========================================
    // TIMEOUT: No Response Within 30s
    // ========================================
    await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');
    await message.reply(
      `${EMOJI.ERROR} Confirmation timed out. No data was saved.`
    );
  }
}

// ============================================================================
// SHEET SUBMISSION
// ============================================================================

/**
 * Submits loot entries to Google Sheets BiddingItems tab
 *
 * SHEET FORMAT:
 * Each item becomes a row in BiddingItems with:
 * - Item: Item name from OCR
 * - Source: "Loot" or "Guild Boss" (proper case)
 * - Quantity: Always 1 (for now)
 * - Boss: Full uppercase boss key (e.g., "EGO 10/27/2025 5:57:00")
 * - Starting Price: Suggested price if matched, blank otherwise
 *
 * WORKFLOW:
 * 1. Format entries according to sheet requirements
 * 2. Send payload to Google Apps Script webhook
 * 3. Wait for response and parse result
 * 4. Display success/error embed with details
 *
 * @param {Array<Object>} loots - Array of loot objects with suggestedPrice
 * @param {string} bossName - Canonical boss name
 * @param {string} fullBossKey - Full boss identifier (name + date + time)
 * @param {string} dateStr - Date string (MM/DD/YYYY)
 * @param {string} timeStr - Time string (HH:MM:SS)
 * @param {Message} message - Original command message
 * @param {Message} confirmMsg - Confirmation message to update
 * @returns {Promise<void>}
 *
 * @example
 * await submitLootToSheet(
 *   [{ item: "Violet Heart", quantity: 1, suggestedPrice: 150 }],
 *   "EGO",
 *   "EGO 10/27/2025 5:57:00",
 *   "10/27/2025",
 *   "5:57:00",
 *   message,
 *   confirmMsg
 * );
 */
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
    // ========================================
    // FORMAT: Determine Source Type
    // ========================================
    // Guild Boss loot uses "Guild Boss" source, others use "Loot"
    let source;
    if (bossName.toUpperCase() === "GUILD BOSS") {
      source = "Guild Boss"; // Proper case, not all caps
    } else {
      source = "Loot"; // Proper case, not all caps
    }

    // Boss key must be uppercase for sheet consistency
    const bossKeyUpperCase = fullBossKey.toUpperCase();

    // ========================================
    // FORMAT: Build Entry Payload
    // ========================================
    // Convert each loot item into sheet row format
    const lootEntries = loots.map((loot) => {
      const entry = {
        item: loot.item,
        source: source, // "Loot" or "Guild Boss" (proper case)
        quantity: loot.quantity,
        boss: bossKeyUpperCase, // All uppercase (e.g., "EGO 10/27/2025 5:57:00")
      };

      // Include suggested price if available (helps admins with pricing)
      if (loot.suggestedPrice !== null) {
        entry.startingPrice = loot.suggestedPrice;
      }

      return entry;
    });

    // ========================================
    // SUBMIT: Send to Google Sheets
    // ========================================
    console.log(`📤 Submitting ${lootEntries.length} loot entries to sheet...`);

    const data = await sheetAPI.call('submitLootEntries', {
      entries: lootEntries,
      timestamp: new Date().toISOString(),
    });

    console.log(`📊 Parsed response:`, JSON.stringify(data, null, 2));

    // ========================================
    // VALIDATE: Check Submission Success
    // ========================================
    if (data.status === "error") {
      throw new Error(`Sheet error: ${data.message || "Unknown error"}`);
    }

    if (data.submitted === 0) {
      throw new Error(
        `No items were submitted to the sheet. Check Apps Script logs.`
      );
    }

    // ========================================
    // SUCCESS: Remove Reactions & Show Results
    // ========================================
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
    // ========================================
    // ERROR: Submission Failed
    // ========================================
    console.error(`❌ Sheet submission error:`, err);
    console.error(`❌ Error stack:`, err.stack);

    await errorHandler.safeRemoveReactions(confirmMsg, 'reaction removal');

    // Build error embed with troubleshooting steps
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

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  initialize,
  handleLootCommand,
};
