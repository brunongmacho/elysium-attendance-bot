# Narrative Hero Page Design

**Date:** 2026-05-28
**Project:** Tenchu Dashboard
**Status:** Approved

## Overview

Redesign the homepage hero section to feel like a living guild narrative rather than a templated dashboard. Replace the current three separate rotating sections (Guild Stats, Member Chronicles, Legendary Specialties) with a single cohesive "Guild Pulse" block that rotates between content types.

## Current Problems

- Three separate rotating sections feel repetitive and templated
- Auto-generated stat cards ("Ztig's Ally Precision Score") read as formulaic
- Random member shuffles without narrative context feel like name-dropping
- Page structure is a feature list, not a story

## New Structure

The new homepage layout:

```
1. Hero Banner (guild name, tagline, special user greetings)
2. Quick Access Navigation (Boss Timers, Events, Leaderboards, etc.)
3. Live Guild Stats (QuickStats — boss timer counts)
4. Guild Pulse (NEW — replaces 3 old sections)
5. About Tenchu (streamlined, one column)
```

## Guild Pulse Section

A single `motion.div` block that cycles between 3 content types, rotating every 30 seconds with fade transitions:

### Cycle A — Voices of Tenchu
Shows 2 members with their lore icon and `reputation` text. The heading reads "🗣 Voices of Tenchu" with subtitle "What the guild is saying..." Only 2 members visible at a time — rotated from shuffled list of all lore members.

### Cycle B — Guild Pulse Stats
Shows 4 compact stat cards using **hand-written guild-wide stats only** (no auto-generated member-specific stats). Same visual style as current stat cards but content comes from a curated set of ~8-12 permanent guild stat groups, not the 42 auto-generated ones.

Stat groups should be guild-wide metrics like:
- "Bovo Leadership Approval: 100% (Unanimous)"
- "Active Members: 50 (All Legendary)"
- "Guild Treasury: Growing"
- "Chaos Level: Maximum"
- etc.

### Cycle C — Titles of Renown
Shows 2 member spotlights with their full title and lore text. Heading reads "🏆 Guild Legends — Titles of Renown" with the subtitle "Members who shape the guild's story." Each shows:
- Icon from `getIconForMember()`
- Member name (link to profile)
- Full title
- A short lore excerpt (first 120 chars of `lore` field)

Only 2 members visible at a time, rotated from shuffled list.

## Removed Sections

- **Guild Stats Overview** (the 4 rotating stat cards) — replaced by Cycle B
- **Guild Member Chronicles** (6 random members) — replaced by Cycles A and C
- **Legendary Specialties column** (right side of About) — replaced by Cycle C
- **Guild-stats.json** — the 42 auto-generated stat groups are no longer needed on the homepage (can keep file for other uses)

## Implementation Notes

- All cycles source from the existing `memberLore` SWR data and `guildStats` SWR data
- `guildStatsRotation` useMemo simplified to just cycle through hand-picked groups
- Remove `currentActivities` and `legendaryAchievements` useMemo logic
- Remove unused `memberIdMap` state/fetch (profile links still work via member name)
- Framer Motion `AnimatePresence` for fade transitions between cycles
- About section reduced to a single column, right column removed
- QuickStats component stays as-is (live data)
- Quick Access navigation stays as-is
- Hero banner stays as-is
- Special user themes and greetings stay as-is
- `guild-stats.json` file kept for potential future use but no longer used on homepage

## File Changes

### Modified
- `dashboard/app/page.tsx` — Major restructuring (est. -150 to -200 lines)
- `dashboard/guild-stats.json` — Optionally prune down to keep only guild-wide stat groups

## Acceptance Criteria

1. Single "Guild Pulse" section with 3 rotating content types
2. No auto-generated member stat cards on homepage
3. No repetitive random member shuffles
4. Each rotation cycle feels intentional and narrative-driven
5. Fade transitions between cycles
6. All link-to-profile functionality preserved
7. Special user themes/greetings preserved
8. About section cleaner (single column)
