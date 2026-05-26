package com.elysium.guild.utils

import androidx.compose.ui.graphics.Color
import com.elysium.guild.R
import com.elysium.guild.models.EventType
import com.elysium.guild.ui.theme.ElysiumGold
import com.elysium.guild.ui.theme.ElysiumPurple
import com.elysium.guild.ui.theme.ElysiumPurpleLight
import com.elysium.guild.ui.theme.StatusReadyGlow
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.util.Locale

object UIUtils {

    fun getStatusColor(status: String?, timeRemainingMs: Long?, isDark: Boolean): Color {
        val isReady = status == Constants.STATUS_READY || status == Constants.STATUS_OVERDUE || (timeRemainingMs != null && timeRemainingMs <= 0)
        val isSoon = !isReady && (status == Constants.STATUS_SOON || (timeRemainingMs != null && timeRemainingMs <= Constants.SPAWNING_SOON_THRESHOLD_MS))
        
        return when {
            isReady -> if (isDark) StatusReadyGlow else Color(0xFF00796B)
            isSoon -> if (isDark) Color(0xFFFFCC00) else Color(0xFFF57C00)
            else -> if (isDark) Constants.COLOR_TRACKING else Constants.COLOR_TRACKING_LIGHT
        }
    }

    fun getCountdownColor(timeRemainingMs: Long?, isDark: Boolean): Color {
        if (timeRemainingMs == null) return if (isDark) Color.White.copy(alpha = 0.6f) else Color.Gray

        val minutesRemaining = timeRemainingMs / 1000 / 60

        return when {
            minutesRemaining > 30 -> if (isDark) Color.White.copy(alpha = 0.4f) else Color.Gray.copy(alpha = 0.6f)
            minutesRemaining in 11..30 -> if (isDark) Color.White.copy(alpha = 0.9f) else Color.DarkGray
            minutesRemaining in 0..10 -> Constants.COLOR_SOON 
            else -> Constants.COLOR_OVERDUE 
        }
    }

    fun getEventStatusColor(startTime: String, endTime: String?, now: Instant, isDark: Boolean): Color {
        return try {
            val start = Instant.parse(startTime)
            val end = endTime?.let { Instant.parse(it) }

            val isLive = end?.let { now >= start && now < it } ?: (now >= start && (now - start).inWholeMinutes < 60)

            when {
                isLive -> if (isDark) StatusReadyGlow else Color(0xFF00796B) // Active: Teal
                (start - now).inWholeMinutes < 60 -> if (isDark) Color(0xFFFFCC00) else Color(0xFFF57C00) // Soon: Orange
                else -> if (isDark) ElysiumPurple else ElysiumPurpleLight // Upcoming
            }
        } catch (e: Exception) {
            if (isDark) ElysiumPurple else ElysiumPurpleLight
        }
    }

    fun getEventIcon(type: EventType): String {
        return when (type) {
            EventType.WORLD_BOSS -> "🐉"
            EventType.GUILD_DUNGEON -> "🏰"
            EventType.ARENA_BATTLE -> "⚔️"
            EventType.GUILD_BOSS -> "👹"
            EventType.GVG -> "⚔️"
            EventType.SPECIAL_EVENT -> "🎯"
            EventType.ANCIENT_CITADEL -> "🏰"
        }
    }

    fun formatEventTime(time: String, useLocalTimezone: Boolean): String {
        return try {
            val instant = Instant.parse(time)
            val targetTz = if (useLocalTimezone) TimeZone.currentSystemDefault() else TimeZone.of("Asia/Manila")
            val localDateTime = instant.toLocalDateTime(targetTz)
            val day = localDateTime.dayOfMonth
            val month = localDateTime.month.name.substring(0, 3).lowercase().replaceFirstChar { it.uppercase() }
            val year = localDateTime.year
            val hour = if (localDateTime.hour % 12 == 0) 12 else localDateTime.hour % 12
            val minute = String.format("%02d", localDateTime.minute)
            val amPm = if (localDateTime.hour < 12) "AM" else "PM"
            
            val tzLabel = if (useLocalTimezone) {
                val zoneName = targetTz.id
                if (zoneName.contains("/")) zoneName.split("/").last().replace("_", " ") else zoneName
            } else {
                "PHT"
            }

            "$month $day, $year $hour:$minute $amPm ($tzLabel)"
        } catch (e: Exception) {
            "Time TBD"
        }
    }

    fun calculateEventCountdown(startTime: String, endTime: String?, now: Instant): String {
        return try {
            val start = Instant.parse(startTime)
            val end = endTime?.let { Instant.parse(it) }
            
            if (now < start) {
                // Countdown to start
                (start - now).toComponents {
                    days, hours, minutes, seconds, _ ->
                    when {
                        days > 0 -> "Starts in ${days}d ${hours}h"
                        hours > 0 -> "Starts in ${hours}h ${minutes}m"
                        else -> "Starts in ${minutes}m ${seconds}s"
                    }
                }
            } else if (end != null && now < end) {
                // Countdown to end
                (end - now).toComponents {
                    days, hours, minutes, seconds, _ ->
                    when {
                        days > 0 -> "Ends in ${days}d ${hours}h"
                        hours > 0 -> "Ends in ${hours}h ${minutes}m"
                        else -> "Ends in ${minutes}m ${seconds}s"
                    }
                }
            } else {
                ""
            }
        } catch (e: Exception) {
            ""
        }
    }
}
