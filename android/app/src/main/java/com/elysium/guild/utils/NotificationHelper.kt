package com.elysium.guild.utils

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.elysium.guild.MainActivity
import com.elysium.guild.R
import com.elysium.guild.models.AlertOverride
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationHelper @Inject constructor(
    private val context: Context,
    private val preferenceManager: PreferenceManager
) {

    companion object {
        private const val BASE_CHANNEL_ID = "boss_event_alerts"
    }

    init {
        createNotificationChannel()
    }

    private fun getChannelIdForCurrentSound(override: AlertOverride = AlertOverride.DEFAULT): String {
        val soundName = preferenceManager.notificationSound.value
        val globalVibrateOnly = preferenceManager.vibrateOnly.value
        val hapticEnabled = preferenceManager.hapticEnabled.value
        
        val effectiveVibrateOnly = when (override) {
            AlertOverride.VIBRATE -> true
            AlertOverride.SOUND -> false
            AlertOverride.DEFAULT -> globalVibrateOnly
        }
        
        return if (effectiveVibrateOnly) {
            "${BASE_CHANNEL_ID}_vibrate_mode"
        } else {
            "${BASE_CHANNEL_ID}_${soundName}_haptic_${hapticEnabled}"
        }
    }

    fun createNotificationChannel(override: AlertOverride = AlertOverride.DEFAULT) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val soundName = preferenceManager.notificationSound.value
            val globalVibrateOnly = preferenceManager.vibrateOnly.value
            val hapticEnabled = preferenceManager.hapticEnabled.value
            
            val effectiveVibrateOnly = when (override) {
                AlertOverride.VIBRATE -> true
                AlertOverride.SOUND -> false
                AlertOverride.DEFAULT -> globalVibrateOnly
            }
            
            val channelId = getChannelIdForCurrentSound(override)
            val name = if (effectiveVibrateOnly) "Boss Alerts (Vibrate)" else "Boss Alerts (Sound)"
            val descriptionText = "Notifications for boss spawns and guild events."

            val importance = NotificationManager.IMPORTANCE_HIGH
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            val channel = NotificationChannel(channelId, name, importance).apply {
                description = descriptionText
                enableVibration(effectiveVibrateOnly || hapticEnabled)
                setShowBadge(true)
                
                if (effectiveVibrateOnly) {
                    setSound(null, null)
                    vibrationPattern = longArrayOf(0, 500, 200, 500)
                } else {
                    val resId = try {
                        val id = context.resources.getIdentifier(soundName, "raw", context.packageName)
                        if (id != 0) id else R.raw.terran_launch
                    } catch (e: Exception) {
                        R.raw.terran_launch
                    }
                    
                    val soundUri = Uri.parse("android.resource://${context.packageName}/$resId")
                    val audioAttributes = AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .build()

                    try {
                        setSound(soundUri, audioAttributes)
                    } catch (e: Exception) {
                        Log.e("NotificationHelper", "Failed to set sound on channel: ${e.message}")
                    }
                }
            }

            notificationManager.createNotificationChannel(channel)
        }
    }

    fun showBossNotification(bossName: String, minutesRemaining: Int, override: AlertOverride = AlertOverride.DEFAULT) {
        createNotificationChannel(override)
        
        val globalVibrateOnly = preferenceManager.vibrateOnly.value
        val hapticEnabled = preferenceManager.hapticEnabled.value
        
        val effectiveVibrateOnly = when (override) {
            AlertOverride.VIBRATE -> true
            AlertOverride.SOUND -> false
            AlertOverride.DEFAULT -> globalVibrateOnly
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        val pendingIntent: PendingIntent = PendingIntent.getActivity(
            context, 
            bossName.hashCode(), 
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val title = "$bossName in $minutesRemaining mins!"
        val message = "Prepare for the kill! The boss spawns in $minutesRemaining minutes."

        val builder = NotificationCompat.Builder(context, getChannelIdForCurrentSound(override))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        if (effectiveVibrateOnly) {
            builder.setSound(null)
            builder.setVibrate(longArrayOf(0, 500, 200, 500))
            builder.setDefaults(NotificationCompat.DEFAULT_VIBRATE)
        } else {
            val soundName = preferenceManager.notificationSound.value
            val resId = try {
                val id = context.resources.getIdentifier(soundName, "raw", context.packageName)
                if (id != 0) id else R.raw.terran_launch
            } catch (e: Exception) {
                R.raw.terran_launch
            }
            val soundUri = Uri.parse("android.resource://${context.packageName}/$resId")
            builder.setSound(soundUri)

            if (hapticEnabled) {
                builder.setDefaults(NotificationCompat.DEFAULT_ALL)
            } else {
                builder.setDefaults(NotificationCompat.DEFAULT_LIGHTS)
            }
        }

        try {
            val notificationManager = NotificationManagerCompat.from(context)
            notificationManager.notify(bossName.hashCode(), builder.build())
        } catch (e: SecurityException) {
            Log.e("NotificationHelper", "SecurityException: Notification permission may have been revoked.", e)
        } catch (e: Exception) {
            Log.e("NotificationHelper", "Failed to show notification: ${e.message}")
        }
    }
}
