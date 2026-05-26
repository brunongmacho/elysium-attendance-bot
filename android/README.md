# ⚔️ Elysium Guild Mobile App

[![Version](https://img.shields.io/badge/Version-2.1.2-gold.svg?style=for-the-badge)](https://github.com/brunongmacho/elysium-guild/releases)
[![Platform](https://img.shields.io/badge/Platform-Android_8.0+-000000.svg?style=for-the-badge&logo=android)](https://developer.android.com)
[![Engine](https://img.shields.io/badge/UI-Jetpack_Compose-4285F4.svg?style=for-the-badge&logo=jetpackcompose)](https://developer.android.com)

A premium, high-performance Android utility built for the **Elysium Guild**. This application serves as a real-time tactical hub, integrating world boss tracking, guild event scheduling, and competitive performance metrics into a single, cohesive experience.

## ✨ Premium Visuals: Glassmorphism 2.0
The app features a custom-built **Glassmorphism Design System**, utilizing:
*   **Legendary Orb Effects**: Real-time path-drawing animations that trace the borders of high-tier cards.
*   **Dynamic Backgrounds**: Parallax-shifted nebulas and blurred blobs that react to user scrolling.
*   **Haptic Interface**: Tactile feedback for every critical action, from refreshing timers to permission toggles.

---

## 🚀 Core Features

### 1. Boss Timers & Tactical HUD
*   **Real-Time Tracking**: Precise countdowns for all world bosses with 1-second resolution.
*   **Rotation Logic**: Intelligent filtering for "Our Turn" vs. "Enemy Turn" rotations.
*   **Floating Bubble Overlay**: A persistent, circular HUD that floats over other apps (including the game). 
    *   *Features*: Drag-to-close zone, adaptive orientation (Landscape/Portrait), and auto-hiding during active app use.
*   **Smart Statuses**: Automatic categorization into `READY`, `SOON` (within 30m), and `TRACKING`.

### 2. Multi-Relic Calculator (New in v2.0)
*   **Concurrent Tracking**: Manage and estimate costs for all four relics (*Origin, Barrier, Crystal, Magic Storm*) simultaneously.
*   **Temporal PC Estimator**: Accurate cost progression logic for standard and specialized relics.
*   **Selective Inclusion**: Toggle specific relics to calculate exactly what you need for your next session.
*   **Auto-Validation**: Intelligent level clamping (1-100) and range correction.

### 3. Guild Events & Schedule
*   **Automated Sync**: Fetches the latest guild activities directly from the Elysium API.
*   **Alarm Integration**: One-tap scheduling of Exact Alarms (Android 14 compliant) to notify you 10 minutes before an event starts.
*   **Glassy Visuals**: Shared component architecture ensures events look as premium as boss cards.

### 4. Advanced Leaderboards
*   **Multi-Metric Tracking**: Switch between `Attendance` and `Points` leaderboards.
*   **Dynamic Podium**: Visual highlight for Top 3 performers with custom gold, silver, and bronze gradients.
*   **Historical Data**: Filter attendance by Weekly, Monthly, or All-Time periods.

### 5. System Health & Settings
*   **Permission Center**: Centralized management for Notifications, Overlay permissions, Exact Alarms, and Battery Optimization.
*   **Theme Engine**: Instant switching between Light, Dark, and System modes.
*   **Notification Customization**: Select from a library of custom alert sounds (e.g., *Terran Launch*).

---

## 🛠 Tech Stack & Architecture

### Modern Android Development
*   **Language**: Kotlin 1.9+ (Coroutines & Flow for reactive data)
*   **UI Framework**: Jetpack Compose (Material 3)
*   **Architecture**: MVVM with Repository Pattern and Clean Architecture
*   **Dependency Injection**: Hilt (Dagger)
*   **Local Database**: Room (with automated migration paths)
*   **Network Layer**: Retrofit 2 + OkHttp 4 + GSON
*   **Async Work**: WorkManager (for background notification scheduling)
*   **Image Loading**: Coil (with custom 50MB disk caching)
*   **Animations**: Lottie + Compose Animation API

### Project Structure
```bash
com.elysium.guild/
├── di/                  # Hilt modules (Network, Database, Preference)
├── ui/
│   ├── components/      # Glassy UI, Legendary Orbs, Custom SearchBars
│   ├── screens/         # BossTimers, Leaderboard, Events, Profile, Onboarding, Relic
│   └── theme/           # Elysium Gold & Deep Sea color schemes
├── viewmodel/           # State management with StateFlow
├── repository/          # SSOT (Single Source of Truth) data management
├── network/             # Retrofit interfaces and Update Manifest API
├── database/            # Room DB, DAOs, and Entities
├── widget/              # Floating Bubble Service (Overlay HUD)
└── utils/               # Constants, NotificationHelpers, and UI Tools
```

---

## 📦 Setup & Deployment

### Developer Prerequisites
1.  **IDE**: Android Studio Ladybug (2024.2.1) or newer.
2.  **JDK**: Version 17.
3.  **API**: Set your `BASE_URL` in `Constants.kt`.

### Automated Release Workflow
The app uses a fully automated **GitHub Actions** CI/CD pipeline:
1.  **Version Bump**: Update `versionCode` and `versionName` in `app/build.gradle`.
2.  **Manifest Update**: Synchronize `update-manifest.json` at the root.
3.  **Deploy**: 
    ```bash
    git tag v2.1.2
    git push origin v2.1.2
    ```
4.  **Result**: GitHub automatically builds the signed APK and attaches it to a new Release.

---

## 🛡 System Requirements & Permissions
To ensure 100% notification reliability on modern Android versions, the app requests:
*   **POST_NOTIFICATIONS**: For boss and event alerts.
*   **SYSTEM_ALERT_WINDOW**: For the Floating Bubble HUD.
*   **SCHEDULE_EXACT_ALARM**: To ensure alerts fire exactly when needed.
*   **REQUEST_IGNORE_BATTERY_OPTIMIZATIONS**: Prevents the system from killing the background timer service.

---
**Built with ❤️ for the Elysium Guild**
