# Android App: Elysium → Tenchu Migration Design

> **Date:** 2026-05-29
> **Status:** Draft
> **Applies to:** `android/` (elysium-guild APK)

## Goal

Migrate the Elysium Guild Android APK from `com.elysium.guild` (v2.1.3) to `com.tenchu.guild`, fully rebranding the identity, theme, API endpoint, and codebase to align with the Tenchu bot + dashboard ecosystem.

## Architecture

The app is a Kotlin + Jetpack Compose Android application using:
- **MVVM** with Hilt DI (dagger-hilt)
- **Room** local database
- **Retrofit** + OkHttp for API calls
- **Coil** for image loading
- **WorkManager** for background boss notification polling
- **Floating bubble service** for overlay boss timers
- **Compose Navigation** for screen routing

55 Kotlin source files, ~333 `Elysium`/`elysium` references.

## Migration Phases

The migration follows a **dependency-first order**. Each phase must be completed before the next begins, because Phase 1 (package rename) changes the import paths that all subsequent phases depend on.

### Phase 1: Build Config + Package Rename (Highest Impact)

**Build files:**
- `android/app/build.gradle`: Change `namespace 'com.elysium.guild'` → `'com.tenchu.guild'`
- `android/app/build.gradle`: Change `applicationId "com.elysium.guild"` → `"com.tenchu.guild"`
- Version bump: v2.1.3 (versionCode 39) → v2.2.0 (versionCode 40) for the rebrand release

**Directory structure:**
- Move all source from `app/src/main/java/com/elysium/guild/` to `app/src/main/java/com/tenchu/guild/`
- Update all 55 `package com.elysium.guild.*` declarations → `package com.tenchu.guild.*`

**AndroidManifest.xml:**
- `android:name=".ElysiumApplication"` → `.TenchuApplication`
- `@style/Theme.ElysiumGuild` → `@style/Theme.TenchuGuild`
- `@style/Theme.ElysiumGuild.Splash` → `@style/Theme.TenchuGuild.Splash`

**Class file renames:**
- `ElysiumApplication.kt` → `TenchuApplication.kt`
- `ElysiumDatabase.kt` → `TenchuDatabase.kt`
- `ElysiumNavigation.kt` → `TenchuNavigation.kt`

**Intent actions (BossBubbleService.kt):**
- `com.elysium.guild.SHOW_BUBBLE` → `com.tenchu.guild.SHOW_BUBBLE`
- `com.elysium.guild.HIDE_BUBBLE` → `com.tenchu.guild.HIDE_BUBBLE`

### Phase 2: Theme & Colors

**Color.kt** — rename 7 constants:
| Before                   | After                    |
| ------------------------ | ------------------------ |
| `ElysiumGold`            | `TenchuGold`             |
| `ElysiumGoldVariant`     | `TenchuGoldVariant`      |
| `ElysiumPurple`          | `TenchuPurple`           |
| `ElysiumPurpleLight`     | `TenchuPurpleLight`      |
| `ElysiumAmethyst`        | `TenchuAmethyst`         |
| `ElysiumAmethystDark`    | `TenchuAmethystDark`     |
| `StatusElysiumSoonGlow`  | `StatusTenchuSoonGlow`   |

**Theme.kt:**
- `fun ElysiumGuildTheme(` → `fun TenchuGuildTheme(`
- All color references updated

**UIUtils.kt:** Update 3 Elysium color imports

**themes.xml:** `<style name="Theme.ElysiumGuild"` → `Theme.TenchuGuild`

### Phase 3: Constants & API

**Constants.kt:**
| Field            | Before                                                               | After                                          |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `BASE_URL`       | `https://initial-michelina-1elysium-87b4172a.koyeb.app/`               | Cloudflare tunnel URL (set at build time)      |
| `DATABASE_NAME`  | `"elysium_guild_v2_database"`                                         | `"tenchu_guild_v2_database"`                   |
| `PREFS_NAME`     | `"elysium_prefs"`                                                    | `"tenchu_prefs"`                                |
| `DONATION_TITLE` | `"Support Elysium Guild"`                                            | `"Support Tenchu Guild"`                        |
| `DONATION_DESC`  | References "Elysium"                                                 | Updates guild name                              |

### Phase 4: String Resources

**strings.xml:** `<string name="app_name">Elysium Guild</string>` → `Tenchu Guild`

### Phase 5: Kotlin Code (Bulk Rename)

All remaining code-level references across 55 files:

| Pattern                        | Replace With                   | Files                                             |
| ------------------------------ | ------------------------------ | ------------------------------------------------- |
| `onlyElysiumTurn`              | `onlyTenchuTurn`               | BossTimersViewModel.kt, BossTimersScreen.kt       |
| `toggleElysiumTurnFilter()`    | `toggleTenchuTurnFilter()`     | BossTimersViewModel.kt                            |
| `"Elysium Bubble Active"`      | `"Tenchu Bubble Active"`       | BossBubbleService.kt                              |
| `"ElysiumGuild.apk"`           | `"TenchuGuild.apk"`            | ProfileViewModel.kt                               |
| `"Elysium Guild Update"`       | `"Tenchu Guild Update"`        | UpdateManager.kt                                  |
| `DynamicElysiumBackground`     | `DynamicTenchuBackground`      | Backgrounds.kt, screens, etc.                     |
| `ElysiumGlassCard`             | `TenchuGlassCard`              | GlassComponents.kt, screens                       |
| `import com.elysium.guild.*`   | `import com.tenchu.guild.*`    | All files                                         |

**ENHANCEMENTS_CHECKLIST.md:** Title + header line updated

### Phase 6: Drawables & Assets

- `ic_launcher_foreground.xml`: Replace with Tenchu logo (reuse `Tenchu.png` as adaptive icon foreground)
- `ic_splash.xml`: Replace Elysium splash with Tenchu splash
- `ic_splash_rotating.xml`: Same treatment
- `ic_notification.xml`: Update Tenchu notification icon
- `zoomed_logo.xml`: Remove or update Elysium branding

### Phase 7: Database Schema

- `TenchuDatabase.kt`: Verify entity declarations clean (no Elysium references)
- `Dao.kt`: Check for any Elysium references in SQL queries or table names

## Acceptance Criteria

1. APK builds successfully with `./gradlew assembleDebug`
2. App runs on device, shows "Tenchu Guild" as app name
3. Theme colors render as Tenchu (gold/purple) correctly
4. API calls reach the dashboard backend (not old Koyeb)
5. All boss timers, leaderboard, events screens display data
6. Floating bubble shows "Tenchu" branding
7. Notifications show "Tenchu" not "Elysium"
8. Room database creates fresh `tenchu_guild_v2_database` (not caches old data)
9. App icon shows Tenchu logo
10. Splash screen shows Tenchu branding
