package com.elysium.guild.utils

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

@Singleton
class PreferenceManager @Inject constructor(
    @ApplicationContext context: Context
) {
    private val prefs: SharedPreferences = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)

    private val _themeMode = MutableStateFlow(prefs.getInt(Constants.KEY_THEME_MODE, Constants.THEME_SYSTEM))
    val themeMode: StateFlow<Int> = _themeMode.asStateFlow()

    private val _hapticEnabled = MutableStateFlow(prefs.getBoolean(Constants.KEY_HAPTIC_ENABLED, true))
    val hapticEnabled: StateFlow<Boolean> = _hapticEnabled.asStateFlow()

    private val _vibrateOnly = MutableStateFlow(prefs.getBoolean(Constants.KEY_VIBRATE_ONLY, false))
    val vibrateOnly: StateFlow<Boolean> = _vibrateOnly.asStateFlow()

    private val _notificationSound = MutableStateFlow(prefs.getString(Constants.KEY_NOTIFICATION_SOUND, "terran_launch") ?: "terran_launch")
    val notificationSound: StateFlow<String> = _notificationSound.asStateFlow()

    private val _bossNotificationsEnabled = MutableStateFlow(prefs.getBoolean(Constants.KEY_BOSS_SPAWN_ALERTS, true))
    val bossNotificationsEnabled: StateFlow<Boolean> = _bossNotificationsEnabled.asStateFlow()

    private val _eventNotificationsEnabled = MutableStateFlow(prefs.getBoolean(Constants.KEY_EVENT_REMINDERS, true))
    val eventNotificationsEnabled: StateFlow<Boolean> = _eventNotificationsEnabled.asStateFlow()

    private val _floatingBubbleEnabled = MutableStateFlow(prefs.getBoolean(Constants.KEY_FLOATING_BUBBLE_ENABLED, false))
    val floatingBubbleEnabled: StateFlow<Boolean> = _floatingBubbleEnabled.asStateFlow()
    
    private val _useLocalTimezone = MutableStateFlow(prefs.getBoolean(Constants.KEY_USE_LOCAL_TIMEZONE, false))
    val useLocalTimezone: StateFlow<Boolean> = _useLocalTimezone.asStateFlow()

    private val _isFirstRun = MutableStateFlow(prefs.getBoolean(Constants.KEY_IS_FIRST_RUN, true))
    val isFirstRun: StateFlow<Boolean> = _isFirstRun.asStateFlow()

    private val preferenceChangeListener = SharedPreferences.OnSharedPreferenceChangeListener { sharedPrefs, key ->
        when (key) {
            Constants.KEY_THEME_MODE -> _themeMode.value = sharedPrefs.getInt(key, Constants.THEME_SYSTEM)
            Constants.KEY_HAPTIC_ENABLED -> _hapticEnabled.value = sharedPrefs.getBoolean(key, true)
            Constants.KEY_VIBRATE_ONLY -> _vibrateOnly.value = sharedPrefs.getBoolean(key, false)
            Constants.KEY_NOTIFICATION_SOUND -> _notificationSound.value = sharedPrefs.getString(key, "terran_launch") ?: "terran_launch"
            Constants.KEY_BOSS_SPAWN_ALERTS -> _bossNotificationsEnabled.value = sharedPrefs.getBoolean(key, true)
            Constants.KEY_EVENT_REMINDERS -> _eventNotificationsEnabled.value = sharedPrefs.getBoolean(key, true)
            Constants.KEY_FLOATING_BUBBLE_ENABLED -> _floatingBubbleEnabled.value = sharedPrefs.getBoolean(key, false)
            Constants.KEY_USE_LOCAL_TIMEZONE -> _useLocalTimezone.value = sharedPrefs.getBoolean(key, false)
            Constants.KEY_IS_FIRST_RUN -> _isFirstRun.value = sharedPrefs.getBoolean(key, true)
        }
    }

    init {
        prefs.registerOnSharedPreferenceChangeListener(preferenceChangeListener)
    }

    var bossNotificationOffset: Int
        get() = prefs.getInt(Constants.KEY_BOSS_NOTIFICATION_OFFSET, 10)
        set(value) = prefs.edit().putInt(Constants.KEY_BOSS_NOTIFICATION_OFFSET, value).apply()

    fun setBossNotificationsEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(Constants.KEY_BOSS_SPAWN_ALERTS, enabled).apply()
    }

    fun setEventNotificationsEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(Constants.KEY_EVENT_REMINDERS, enabled).apply()
    }

    fun setHapticFeedbackEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(Constants.KEY_HAPTIC_ENABLED, enabled).apply()
    }

    fun setVibrateOnlyEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(Constants.KEY_VIBRATE_ONLY, enabled).apply()
    }

    fun setNotificationSound(sound: String) {
        prefs.edit().putString(Constants.KEY_NOTIFICATION_SOUND, sound).apply()
    }

    fun setThemeMode(mode: Int) {
        prefs.edit().putInt(Constants.KEY_THEME_MODE, mode).apply()
    }

    fun setFloatingBubbleEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(Constants.KEY_FLOATING_BUBBLE_ENABLED, enabled).apply()
    }
    
    fun setUseLocalTimezone(enabled: Boolean) {
        prefs.edit().putBoolean(Constants.KEY_USE_LOCAL_TIMEZONE, enabled).apply()
    }

    fun setFirstRunCompleted() {
        prefs.edit().putBoolean(Constants.KEY_IS_FIRST_RUN, false).apply()
    }

    fun resetFirstRun() {
        prefs.edit().putBoolean(Constants.KEY_IS_FIRST_RUN, true).apply()
    }
}
