# Elysium Guild App Enhancement Checklist

This document tracks planned UI/UX enhancements and code fixes to improve the application's polish, performance, and maintainability.

## 🏆 Core & Global Enhancements
- [x] **Centralized Haptics:** Move vibration logic to a `HapticManager` utility.
- [x] **Shimmer UI:** Replace generic loaders with skeleton/shimmer layouts for all screens.
- [x] **Parallax Polish:** Refine `DynamicElysiumBackground` to respond more fluidly to scroll offsets.
- [x] **Transition Safety:** Audit all `sharedElement` keys for global uniqueness.
- [x] **Permission Handling:** Consolidate permission-checking logic into `PermissionUtils.kt`.

## 📦 Centralization & Stability (Critical)
- [x] **Variable Consolidation:** Move all hardcoded animation durations, scales, and alpha values to `Constants.kt`.
- [x] **Unified Palette:** Audit all screens to ensure they ONLY use colors defined in `Color.kt`.
- [x] **Status Logic Sync:** Ensure `isReady`, `isSoon`, and `isTracking` logic is identical across App, Bubble Service, and Notifications.
- [x] **Device Compatibility Audit:** 
    - Ensure all text uses `sp` for accessibility.
    - Test all layouts on small (320dp width) and large (tablet) screen sizes.
    - Wrap version-specific APIs (S+ Haptics, Exact Alarms) in safe wrappers.

## 🔮 Relic Screen (New)
- [x] **ViewModel Migration:** Move business logic and state management from the Composable to a `RelicViewModel`.
- [x] **Owned Pieces Inventory:** Add a section to input current Temporal Pieces to calculate "Remaining Needed".
- [x] **Market Shopping List:** Implement an automatic calculator that breaks down the required pieces into T1-T5 market packs.
- [x] **Visual Tier Differentiation:** Apply unique colors/glows for each market tier (T1-T5).
- [x] **Input Polish:** Add +/- buttons for quick level adjustments and validate level ranges (1-100).
- [x] **Accessibility:** Add `contentDescription` to all relic icons and cost indicators.

## ⚔️ Boss Timers Screen
- [x] **Visual Hierarchy:** Add animated "Legendary" borders for `isOurTurn` bosses.
- [x] **Performance:** Move list filtering to `Dispatchers.Default` to prevent UI lag.
- [x] **Monospace Countdowns:** Standardize countdown fonts to prevent text jitter.
- [x] **Interactive Progress:** Add a "Pulse" effect when the spawn progress bar reaches >90%.
- [x] **Status Feedback:** Implement color-fade transitions when boss status updates in real-time.

## 📅 Guild Events Screen
- [x] **Iconography:** Add unique icons for World Boss, GVG, Arena, and Guild Boss types.
- [x] **Event Status:** Clearly label events as "ACTIVE", "SOON", or "COMPLETED".
- [x] **Reminder Feedback:** Add subtle haptic and visual confirmation for reminder toggles.
- [x] **Contextual Time:** Show relative time (e.g., "Starts in 15m") for upcoming events.

## 📊 Leaderboard Screen
- [x] **Podium Glow:** Add a "Champion" effect for the Rank 1 member.
- [x] **Search Highlighting:** Highlight matching text in member names during search.
- [x] **Podium Transitions:** Ensure the podium collapses/expands smoothly when searching.
- [x] **Avatar Consistency:** Use the centralized `BossAvatar` component for better caching.

## ⚙️ Settings Screen (`ProfileScreen.kt`)
- [x] **Pending Changes Highlight:** Add a visual indicator (glow/highlight) to settings that are modified but not saved.
- [x] **Instant Feedback:** Provide immediate haptic/sound feedback on toggle/selection changes.
- [x] **System Health Affordance:** Make the "Tap to fix" permission items more prominent (e.g., button-like).
- [x] **Save Confirmation:** Replace the "Saved" toast with a more engaging animated checkmark.
- [x] **Theme Preview Polish:** Add an animated checkmark to the selected theme preview card.

## 🛠️ Code Maintenance & Fixes
- [x] **ViewModel State:** Refactor to use `StateFlow` consistently without redundant object creation.
- [x] **Error Handling:** Centralize API error parsing via `ErrorUtils.kt` to handle all network/timeout states.
- [x] **String Externalization:** Move all hardcoded UI strings to `strings.xml`.
- [x] **Null Safety:** Audit `kotlinx.datetime` parsing across all repositories.

---
*Generated for the Elysium Guild Development Team*
