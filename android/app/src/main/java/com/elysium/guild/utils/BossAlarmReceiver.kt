package com.elysium.guild.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.elysium.guild.models.AlertOverride
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class BossAlarmReceiver : BroadcastReceiver() {

    @Inject
    lateinit var notificationHelper: NotificationHelper

    override fun onReceive(context: Context, intent: Intent) {
        // Do not call super.onReceive(context, intent) as BroadcastReceiver is an abstract class
        val bossName = intent.getStringExtra(Constants.EXTRA_BOSS_NAME) ?: "Unknown Boss"
        val minutesRemaining = intent.getIntExtra(Constants.EXTRA_MINUTES_REMAINING, 0)
        val overrideOrdinal = intent.getIntExtra("extra_alert_override", AlertOverride.DEFAULT.ordinal)
        val override = AlertOverride.entries.getOrElse(overrideOrdinal) { AlertOverride.DEFAULT }
        
        Log.d("BossAlarmReceiver", "Alarm triggered for $bossName ($minutesRemaining mins before spawn) with override: $override")
        
        notificationHelper.showBossNotification(bossName, minutesRemaining, override)
    }
}
