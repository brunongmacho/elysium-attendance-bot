/**
 * ============================================================================
 * BOSS IMAGES UTILITY
 * ============================================================================
 *
 * Provides helper functions for retrieving boss images from the assets folder.
 * Handles boss name normalization and provides fallback behavior for missing images.
 *
 * @module utils/boss-images
 * ============================================================================
 */

const path = require('path');
const fs = require('fs');
const { AttachmentBuilder } = require('discord.js');

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Base path to boss images directory
 */
const BOSS_IMAGES_DIR = path.join(__dirname, '..', 'assets', 'bosses');

/**
 * Supported image extensions in order of preference
 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

/**
 * Boss name normalization mappings for special cases
 * Maps in-game boss names to their image filenames (without extension)
 */
const BOSS_NAME_MAPPINGS = {
  'Baron Braudmore': 'baron-brausmore', // Note: Image has different spelling
  'General Aquleus': 'general-aquleus',
  'Lady Dalia': 'lady-dalia',
  'Guild Boss': 'guild-boss'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize boss name to match filename convention
 * Converts boss names to lowercase-hyphenated format
 * @param {string} bossName - Boss name from config or user input
 * @returns {string} Normalized filename (without extension)
 */
function normalizeBossName(bossName) {
  if (!bossName) return null;

  // Check for special mappings first
  if (BOSS_NAME_MAPPINGS[bossName]) {
    return BOSS_NAME_MAPPINGS[bossName];
  }

  // Default normalization: lowercase and replace spaces with hyphens
  return bossName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Find boss image file with any supported extension
 * @param {string} normalizedName - Normalized boss name (without extension)
 * @returns {string|null} Full path to image file, or null if not found
 */
function findBossImageFile(normalizedName) {
  if (!normalizedName) return null;

  for (const ext of IMAGE_EXTENSIONS) {
    const filePath = path.join(BOSS_IMAGES_DIR, `${normalizedName}${ext}`);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get boss image path for a given boss name
 * @param {string} bossName - Name of the boss
 * @returns {string|null} Full path to boss image file, or null if not found
 */
function getBossImagePath(bossName) {
  const normalized = normalizeBossName(bossName);
  return findBossImageFile(normalized);
}

/**
 * Check if a boss image exists
 * @param {string} bossName - Name of the boss
 * @returns {boolean} True if image exists
 */
function hasBossImage(bossName) {
  return getBossImagePath(bossName) !== null;
}

/**
 * Get Discord AttachmentBuilder for a boss image
 * @param {string} bossName - Name of the boss
 * @returns {AttachmentBuilder|null} Discord attachment, or null if image not found
 */
function getBossImageAttachment(bossName) {
  const imagePath = getBossImagePath(bossName);

  if (!imagePath) {
    console.warn(`⚠️ Boss image not found for: ${bossName}`);
    return null;
  }

  const normalized = normalizeBossName(bossName);
  const ext = path.extname(imagePath);
  const filename = `${normalized}${ext}`;

  return new AttachmentBuilder(imagePath, { name: filename });
}

/**
 * Get attachment URL for embedding in Discord embed
 * @param {string} bossName - Name of the boss
 * @returns {string|null} Attachment URL for use in embed, or null if not found
 */
function getBossImageAttachmentURL(bossName) {
  const normalized = normalizeBossName(bossName);
  const imagePath = getBossImagePath(bossName);

  if (!imagePath) {
    return null;
  }

  const ext = path.extname(imagePath);
  return `attachment://${normalized}${ext}`;
}

/**
 * Get all available boss images
 * @returns {Array<string>} Array of boss names that have images
 */
function getAvailableBossImages() {
  if (!fs.existsSync(BOSS_IMAGES_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BOSS_IMAGES_DIR);
  return files
    .filter(file => IMAGE_EXTENSIONS.some(ext => file.endsWith(ext)))
    .map(file => path.basename(file, path.extname(file)));
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  getBossImageAttachment,
  getBossImageAttachmentURL,
  getAvailableBossImages,
  normalizeBossName,
  BOSS_IMAGES_DIR
};
