package com.elysium.guild.utils

import androidx.compose.ui.graphics.Color

object Constants {
    
    // API Configuration
    const val BASE_URL = "https://initial-michelina-1elysium-87b4172a.koyeb.app/"
    const val API_TIMEOUT = 30L
    
    // Database Configuration
    const val DATABASE_NAME = "elysium_guild_v2_database" // Changed name to force a fresh start
    
    // Shared Preferences Keys
    const val PREFS_NAME = "elysium_prefs"
    const val KEY_THEME_MODE = "theme_mode"
    const val KEY_NOTIFICATION_SOUND = "notification_sound"
    const val KEY_BOSS_SPAWN_ALERTS = "boss_spawn_alerts"
    const val KEY_EVENT_REMINDERS = "event_reminders"
    const val KEY_HAPTIC_ENABLED = "haptic_feedback_enabled"
    const val KEY_VIBRATE_ONLY = "vibrate_only_alerts"
    const val KEY_BOSS_NOTIFICATION_OFFSET = "boss_notification_offset"
    const val KEY_FLOATING_BUBBLE_ENABLED = "floating_bubble_enabled"
    const val KEY_BUBBLE_LAST_X = "bubble_last_x"
    const val KEY_BUBBLE_LAST_Y = "bubble_last_y"
    const val KEY_USE_LOCAL_TIMEZONE = "use_local_timezone"
    const val KEY_IS_FIRST_RUN = "is_first_run"

    // Theme Modes
    const val THEME_SYSTEM = 0
    const val THEME_LIGHT = 1
    const val THEME_DARK = 2
    
    // Notification & Alarm Configuration
    const val DEFAULT_NOTIFICATION_OFFSET_MINUTES = 10
    const val BOSS_NOTIFICATION_CHANNEL_ID_BASE = "boss_event_alerts"
    const val BOSS_NOTIFICATION_CHANNEL_NAME = "Boss & Event Alerts"
    const val BOSS_NOTIFICATION_CHANNEL_DESC = "Notifications for boss spawns and guild events."
    
    // Bubble Service Configuration
    const val BUBBLE_NOTIFICATION_CHANNEL_ID = "bubble_service_channel"
    const val BUBBLE_NOTIFICATION_CHANNEL_NAME = "Floating Bubble Service"
    const val BUBBLE_NOTIFICATION_ID = 1001
    const val BUBBLE_SNAP_ANIMATION_DURATION = 300L
    const val BUBBLE_SPAWNED_GRACE_PERIOD_SECONDS = -600L // 10 minutes after spawn
    const val BUBBLE_VISIBLE_THRESHOLD_SECONDS = 3600L // 1 hour before spawn
    
    const val BUBBLE_INITIAL_Y_DP = 200
    const val BUBBLE_EXPANDED_Y_DP = 50
    const val BUBBLE_HEADER_HEIGHT_DP = 65
    const val BUBBLE_DRAG_THRESHOLD_PX = 10
    const val BUBBLE_TEXT_SIZE_TITLE_SP = 18f
    const val BUBBLE_TEXT_SIZE_SUBTITLE_SP = 12f
    const val BUBBLE_TEXT_SIZE_HEADER_SP = 16f
    const val BUBBLE_TEXT_SIZE_ROW_SP = 14f
    const val BUBBLE_ROW_PADDING_HORIZONTAL_DP = 16
    const val BUBBLE_ROW_PADDING_VERTICAL_DP = 6
    const val BUBBLE_MAX_WIDTH_DP = 300
    const val BUBBLE_MAX_ITEMS = 50 
    
    const val BUBBLE_PORTRAIT_MAX_ITEMS = 10
    const val BUBBLE_LANDSCAPE_MAX_ITEMS = 6
    const val BUBBLE_ROW_ESTIMATED_HEIGHT_DP = 32
    const val BUBBLE_HEADER_ESTIMATED_HEIGHT_DP = 72

    // Intent Extras
    const val EXTRA_BOSS_NAME = "extra_boss_name"
    const val EXTRA_MINUTES_REMAINING = "extra_minutes_remaining"
    const val EXTRA_IS_EVENT = "extra_is_event"
    
    // Work Manager
    const val WORK_NAME_PERIODIC = "BossNotificationWorkPeriodic"
    const val WORK_NAME_IMMEDIATE = "BossNotificationWorkImmediate"
    
    // Status Thresholds
    const val SPAWNING_SOON_THRESHOLD_MINUTES = 30
    const val SPAWNING_SOON_THRESHOLD_MS = SPAWNING_SOON_THRESHOLD_MINUTES * 60 * 1000L
    
    // UI Values
    const val CARD_PADDING_VERTICAL = 4
    const val CARD_PADDING_HORIZONTAL = 16
    const val AVATAR_SIZE = 60
    const val AVATAR_BORDER_WIDTH = 2
    const val SHIMMER_DURATION = 1000
    const val COLOR_TRANSITION_DURATION = 600
    const val SCALE_ANIMATION_DURATION = 1000
    const val SCALE_TARGET_URGENT = 1.1f
    const val BORDER_ALPHA_MIN = 0.3f
    const val BORDER_ALPHA_MAX = 0.7f
    const val GLOW_ALPHA = 0.4f
    
    // UI Alphas
    const val ALPHA_COMPLETED = 0.6f
    const val ALPHA_ACTIVE = 1.0f
    const val ALPHA_ICON_BG_DARK = 0.15f
    const val ALPHA_ICON_BG_LIGHT = 0.1f
    const val ALPHA_BORDER_DEFAULT = 0.5f
    const val ALPHA_COUNTDOWN_BG_DARK = 0.1f
    const val ALPHA_COUNTDOWN_BG_LIGHT = 0.05f
    const val ALPHA_COUNTDOWN_BORDER = 0.3f
    const val ALPHA_PROGRESS_TRACK = 0.1f
    const val ALPHA_PROGRESS_BORDER = 0.2f
    const val ALPHA_PROGRESS_FILL = 0.7f
    const val ALPHA_BADGE_MIN = 0.5f
    
    // Status Strings
    const val STATUS_READY = "ready"
    const val STATUS_SOON = "soon"
    const val STATUS_TRACKING = "tracking"
    const val STATUS_OVERDUE = "overdue"

    // UI Colors - Status (Consolidated in Color.kt primarily, but keeping mapping here)
    val COLOR_READY = Color(0xFF10B981) // Green
    val COLOR_SOON = Color(0xFFF59E0B) // Amber/Gold
    val COLOR_OVERDUE = Color(0xFFEF4444) // Red
    val COLOR_TRACKING = Color(0xFF6366F1) // Indigo/Blue
    val COLOR_TRACKING_LIGHT = Color(0xFF0284C7) // Azure Blue
    val COLOR_SUCCESS = Color(0xFF4CAF50)
    
    // UI Colors - Podium
    val COLOR_GOLD = Color(0xFFF59E0B)
    val COLOR_SILVER = Color(0xFF94A3B8)
    val COLOR_BRONZE = Color(0xFFB45309)
    
    // UI Colors - Backgrounds
    val COLOR_BACKGROUND_DEEP = Color(0xFF0B0B1A)
    val COLOR_BLOB_PURPLE = Color(0xFF4A148C)
    val COLOR_BLOB_BLUE = Color(0xFF0D47A1)
    val COLOR_BLOB_ORANGE = Color(0xFFFFA000)
    
    // Labels
    const val LABEL_READY = "READY"
    const val LABEL_SOON = "SOON"
    const val LABEL_TRACKING = "TRACKING"

    // Donation Strings
    const val DONATION_TITLE = "Support Elysium Guild"
    const val DONATION_DESC = "Scan the GCASH QR code to support our guild's server and development costs. Any amount is greatly appreciated!"

    // Page Titles & Subtitles
    const val TITLE_BOSS_TIMERS = "Boss Timers"
    const val SUBTITLE_BOSS_TIMERS = "Track spawns & rotations"
    
    const val TITLE_GUILD_EVENTS = "Guild Events"
    const val SUBTITLE_GUILD_EVENTS = "Stay synced with guild activities"
    
    const val TITLE_LEADERBOARD = "Leaderboard"
    const val SUBTITLE_LEADERBOARD = "Track the guild's top performers"
    
    const val TITLE_SETTINGS = "Settings"
    const val SUBTITLE_SETTINGS = "Manage your preferences"

    const val TITLE_RELIC_CALC = "Relic Calculator"
    const val SUBTITLE_RELIC_CALC = "Market-aware estimator"

    // Resource Names
    const val RES_QR_DONATION = "qr"
    const val RES_DEFAULT_SOUND = "terran_launch"
}
