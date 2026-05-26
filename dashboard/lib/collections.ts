/**
 * MongoDB Collection Names
 * Centralized configuration for all collection name references.
 * The bot uses a `-tenchu` suffix on all collections.
 * Update COLLECTION_SUFFIX here if it ever changes.
 */
const COLLECTION_SUFFIX = 'tenchu';

export const COLLECTIONS = {
  members: `members-${COLLECTION_SUFFIX}`,
  attendance: `attendance-${COLLECTION_SUFFIX}`,
  bossTimers: `bossTimers-${COLLECTION_SUFFIX}`,
  bossRotation: `bossRotation-${COLLECTION_SUFFIX}`,
  bossIndex: `bosses-${COLLECTION_SUFFIX}`,
  pointsIndex: `points-${COLLECTION_SUFFIX}`,
  bidsIndex: `bids-${COLLECTION_SUFFIX}`,
} as const;
