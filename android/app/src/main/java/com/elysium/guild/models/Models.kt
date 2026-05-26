package com.elysium.guild.models

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName
import com.google.gson.JsonElement
import com.elysium.guild.utils.Constants
import kotlinx.datetime.Instant

// Boss Timer Models
@Immutable
data class BossTimer(
    @SerializedName("boss_name", alternate = ["name", "bossName"]) val bossName: String,
    @SerializedName("boss_points", alternate = ["points", "bossPoints"]) val bossPoints: Int,
    val type: String, // "timer" or "schedule"
    @SerializedName("killed_by", alternate = ["killedBy"]) val killedBy: String? = null,
    @SerializedName("last_kill_time", alternate = ["lastKillTime", "last_killed"]) val lastKillTime: String? = null,
    @SerializedName("next_spawn_time", alternate = ["nextSpawnTime", "next_spawn"]) val nextSpawnTime: String? = null,
    val interval: Int? = null,
    @SerializedName("time_remaining", alternate = ["timeRemaining"]) val timeRemaining: Long? = null,
    val status: String,
    @SerializedName("kill_count", alternate = ["killCount"]) val killCount: Int = 0,
    @SerializedName("is_predicted", alternate = ["isPredicted"]) val isPredicted: Boolean = false,
    val rotation: RotationInfo? = null,
    @SerializedName("image_url", alternate = ["imageUrl"]) val imageUrl: String? = null,
    val alertOverride: AlertOverride = AlertOverride.DEFAULT
) {
    fun isReady() = status == Constants.STATUS_READY || status == Constants.STATUS_OVERDUE || (timeRemaining ?: 1L) <= 0L
    fun isSoon() = !isReady() && (status == Constants.STATUS_SOON || (timeRemaining != null && timeRemaining <= Constants.SPAWNING_SOON_THRESHOLD_MS))
    fun isTracking() = !isReady() && !isSoon()
}

enum class AlertOverride {
    DEFAULT, SOUND, VIBRATE
}

@Immutable
data class RotationInfo(
    @SerializedName("is_rotating", alternate = ["isRotating"]) val isRotating: Boolean,
    @SerializedName("current_index", alternate = ["currentIndex"]) val currentIndex: Int? = null,
    @SerializedName("current_guild", alternate = ["currentGuild"]) val currentGuild: String? = null,
    @SerializedName("is_our_turn", alternate = ["isOurTurn"]) val isOurTurn: Boolean? = null,
    val guilds: List<String>? = null,
    @SerializedName("next_guild", alternate = ["nextGuild"]) val nextGuild: String? = null
)

// Leaderboard Models
@Stable
interface LeaderboardEntry {
    val rank: Int
    val username: String
    val memberId: String
}

@Immutable
data class AttendanceLeaderboardEntry(
    override val rank: Int,
    @SerializedName("username", alternate = ["name", "memberName"]) override val username: String,
    @SerializedName("member_id", alternate = ["memberId", "id"]) override val memberId: String,
    @SerializedName("total_kills", alternate = ["totalKills", "kills"]) val totalKills: Int,
    @SerializedName("points_earned", alternate = ["pointsEarned", "earned"]) val pointsEarned: Int,
    @SerializedName("attendance_rate", alternate = ["attendanceRate", "rate"]) val attendanceRate: Int,
    @SerializedName("current_streak", alternate = ["currentStreak", "streak"]) val currentStreak: Int
) : LeaderboardEntry

@Immutable
data class PointsLeaderboardEntry(
    override val rank: Int,
    @SerializedName("username", alternate = ["name", "memberName"]) override val username: String,
    @SerializedName("member_id", alternate = ["memberId", "id"]) override val memberId: String,
    @SerializedName("points_available", alternate = ["pointsAvailable", "available"]) val pointsAvailable: Int,
    @SerializedName("points_earned", alternate = ["pointsEarned", "earned"]) val pointsEarned: Int,
    @SerializedName("points_spent", alternate = ["pointsSpent", "spent"]) val pointsSpent: Int,
    @SerializedName("consumption_rate", alternate = ["consumptionRate", "rate"]) val consumptionRate: Int
) : LeaderboardEntry

enum class LeaderboardType {
    ATTENDANCE,
    POINTS
}

@Immutable
data class GuildEvent(
    val id: String,
    val name: String,
    val type: EventType,
    @SerializedName("start_time", alternate = ["startTime"]) val startTime: String,
    @SerializedName("end_time", alternate = ["endTime"]) val endTime: String?,
    val description: String,
    @SerializedName("reminder_set", alternate = ["reminderSet"]) val reminderSet: Boolean,
    val alertOverride: AlertOverride = AlertOverride.DEFAULT
) {
    fun getStatus(now: Instant): EventStatus {
        return try {
            val start = Instant.parse(startTime)
            val end = endTime?.let { Instant.parse(it) }
            
            when {
                end != null && now >= end -> EventStatus.COMPLETED
                now >= start && (end == null || now < end) -> EventStatus.ACTIVE
                (start - now).inWholeMinutes < 60 -> EventStatus.SOON
                else -> EventStatus.UPCOMING
            }
        } catch (e: Exception) { EventStatus.UPCOMING }
    }

    fun isLive(now: Instant): Boolean = getStatus(now) == EventStatus.ACTIVE
}

enum class EventStatus {
    ACTIVE, SOON, UPCOMING, COMPLETED
}

enum class EventType {
    WORLD_BOSS,
    GUILD_DUNGEON,
    ARENA_BATTLE,
    GUILD_BOSS,
    GVG,
    SPECIAL_EVENT,
    ANCIENT_CITADEL
}

@Immutable
data class MemberProfile(
    @SerializedName("member_id", alternate = ["memberId", "id"]) val memberId: String,
    val name: String,
    @SerializedName("avatar_url", alternate = ["avatarUrl"]) val avatarUrl: String?,
    val rank: String,
    @SerializedName("total_points", alternate = ["totalPoints"]) val totalPoints: Int,
    @SerializedName("available_points", alternate = ["availablePoints"]) val availablePoints: Int,
    @SerializedName("attendance_rate", alternate = ["attendanceRate"]) val attendanceRate: Double,
    @SerializedName("current_streak", alternate = ["currentStreak"]) val currentStreak: Int,
    @SerializedName("weekly_rank", alternate = ["weeklyRank"]) val weeklyRank: Int,
    val role: String,
    @SerializedName("recent_activities", alternate = ["recentActivities"]) val recentActivities: List<ActivityEntry>
)

@Immutable
data class ActivityEntry(
    val id: String,
    val type: ActivityType,
    val description: String,
    val timestamp: String,
    val points: Int?
)

enum class ActivityType {
    BOSS_KILL,
    ATTENDANCE_VERIFIED,
    AUCTION_WON,
    POINTS_EARNED,
    POINTS_SPENT
}

data class ApiResponse<T>(
    val success: Boolean?,
    val data: T?,
    val message: String?,
    val error: String?
)

data class BossTimerResponse(
    val success: Boolean?,
    val count: Int?,
    val bosses: List<BossTimer>?,
    val data: List<BossTimer>?,
    val timestamp: String?
)

data class LeaderboardResponse(
    val success: Boolean?,
    val type: String?,
    val period: String?,
    val count: Int?,
    val total: Int?,
    val data: JsonElement?,
    val timestamp: String?
)

data class EventsResponse(
    val events: List<GuildEvent>?
)

data class MemberProfileResponse(
    val profile: MemberProfile?
)

// Database Models
@Entity(tableName = "boss_timers")
data class BossTimerEntity(
    @PrimaryKey val id: String,
    val name: String,
    val points: Int,
    val type: String,
    val nextSpawnTime: String?,
    val status: String,
    val imageUrl: String?,
    val isRotating: Boolean,
    val currentGuild: String?
)

@Entity(tableName = "boss_alert_overrides")
data class BossAlertOverrideEntity(
    @PrimaryKey val bossName: String,
    val alertOverride: Int // 0: DEFAULT, 1: SOUND, 2: VIBRATE
)

@Entity(tableName = "event_alert_overrides")
data class EventAlertOverrideEntity(
    @PrimaryKey val eventId: String,
    val alertOverride: Int // 0: DEFAULT, 1: SOUND, 2: VIBRATE
)

@Entity(tableName = "leaderboard", primaryKeys = ["memberId", "type", "period"])
data class LeaderboardEntryEntity(
    val memberId: String,
    val memberName: String,
    val avatarUrl: String?,
    val totalPoints: Int,
    val availablePoints: Int,
    val attendanceRate: Double,
    val currentStreak: Int,
    val weeklyRank: Int,
    val role: String,
    val type: String,
    val period: String, // added to distinguish weekly/monthly/all_time
    val lastUpdated: String
)

@Entity(tableName = "events")
data class EventEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
    val startTime: String,
    val endTime: String?,
    val description: String,
    val reminderSet: Boolean
)

@Entity(tableName = "member_profile")
data class MemberProfileEntity(
    @PrimaryKey val memberId: String,
    val name: String,
    val avatarUrl: String?,
    val rank: String,
    val totalPoints: Int,
    val availablePoints: Int,
    val attendanceRate: Double,
    val currentStreak: Int,
    val weeklyRank: Int,
    val role: String,
    val lastUpdated: String
)
