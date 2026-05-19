/**
 * Reaction management utilities.
 */

const state = require('./state');

// ═══════════════════════════════════════════════════════════════════════════════
// REACTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Removes all reactions from a message with retry logic for reliability.
 * Discord API can be unreliable, so this implements multiple retry attempts.
 *
 * @param {Message} message - Discord message object to remove reactions from
 * @param {number} [attempts=TIMING.REACTION_RETRY_ATTEMPTS] - Number of retry attempts
 * @returns {Promise<boolean>} True if successful, false if all attempts failed
 */
async function removeAllReactionsWithRetry(
  message,
  attempts = state.TIMING.REACTION_RETRY_ATTEMPTS
) {
  for (let i = 0; i < attempts; i++) {
    try {
      await message.reactions.removeAll();
      return true;
    } catch (err) {
      if (i < attempts - 1)
        await new Promise((resolve) =>
          setTimeout(resolve, state.TIMING.REACTION_RETRY_DELAY)
        );
    }
  }
  return false;
}

/**
 * Removes all reactions from all messages in a thread.
 * Used when closing attendance threads to clean up verification reactions.
 * Processes up to 100 most recent messages with rate limiting between removals.
 *
 * @param {ThreadChannel} thread - Discord thread to clean up
 * @returns {Promise<Object>} Result object with success and failed counts
 */
async function cleanupAllThreadReactions(thread) {
  try {
    // Fetch recent messages (limit 100 for memory optimization)
    const messages = await thread.messages
      .fetch({ limit: 100 })
      .catch(() => null);
    if (!messages) return { success: 0, failed: 0 };

    let successCount = 0,
      failCount = 0;

    // Filter messages with reactions
    const messagesWithReactions = Array.from(messages.values()).filter(
      msg => msg.reactions.cache.size > 0
    );

    // Process in batches of 5 for parallel execution (4-5x faster)
    const BATCH_SIZE = 5;
    for (let i = 0; i < messagesWithReactions.length; i += BATCH_SIZE) {
      const batch = messagesWithReactions.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const results = await Promise.all(
        batch.map(msg => removeAllReactionsWithRetry(msg))
      );

      // Count successes/failures
      results.forEach(success => {
        success ? successCount++ : failCount++;
      });

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < messagesWithReactions.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return { success: successCount, failed: failCount };
  } catch (err) {
    return { success: 0, failed: 0 };
  }
}

module.exports = { removeAllReactionsWithRetry, cleanupAllThreadReactions };
