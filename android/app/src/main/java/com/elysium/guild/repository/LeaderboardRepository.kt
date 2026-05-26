package com.elysium.guild.repository

import android.util.Log
import com.elysium.guild.database.LeaderboardDao
import com.elysium.guild.models.*
import com.elysium.guild.network.ElysiumApiService
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.first
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LeaderboardRepository @Inject constructor(
    private val apiService: ElysiumApiService,
    private val leaderboardDao: LeaderboardDao
) {
    private val gson = Gson()
    
    suspend fun getAttendanceLeaderboard(period: String? = null, subPeriod: String? = null): List<AttendanceLeaderboardEntry> {
        val dbPeriod = period ?: "all_time"
        return try {
            val response = apiService.getLeaderboard("attendance", period, subPeriod, 100)
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null && body.success == true) {
                    val dataElement = body.data
                    if (dataElement != null) {
                        val typeToken = object : TypeToken<List<AttendanceLeaderboardEntry>>() {}.type
                        val list: List<AttendanceLeaderboardEntry> = gson.fromJson(dataElement, typeToken)
                        
                        // Cache for offline stability with specific period
                        saveLeaderboardToLocal(list, "attendance", dbPeriod)
                        
                        return list
                    }
                }
            }
            Log.w("LeaderboardRepository", "Attendance API failed, using cache for $dbPeriod")
            getCachedAttendance(dbPeriod)
        } catch (e: Exception) {
            Log.e("LeaderboardRepository", "Attendance load failed for $dbPeriod, using cache", e)
            getCachedAttendance(dbPeriod)
        }
    }
    
    suspend fun getPointsLeaderboard(): List<PointsLeaderboardEntry> {
        val dbPeriod = "all_time" // Points currently doesn't have period in API call here
        return try {
            val response = apiService.getLeaderboard("points", null, null, 100)
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null && body.success == true) {
                    val dataElement = body.data
                    if (dataElement != null) {
                        val typeToken = object : TypeToken<List<PointsLeaderboardEntry>>() {}.type
                        val list: List<PointsLeaderboardEntry> = gson.fromJson(dataElement, typeToken)
                        
                        // Cache for offline stability
                        saveLeaderboardToLocal(list, "points", dbPeriod)
                        
                        return list
                    }
                }
            }
            Log.w("LeaderboardRepository", "Points API failed, using cache")
            getCachedPoints(dbPeriod)
        } catch (e: Exception) {
            Log.e("LeaderboardRepository", "Points load failed, using cache", e)
            getCachedPoints(dbPeriod)
        }
    }

    private suspend fun getCachedAttendance(period: String): List<AttendanceLeaderboardEntry> {
        return try {
            val entities = leaderboardDao.getLeaderboardByTypeAndPeriod("attendance", period).first()
            entities.map { it.toAttendanceEntry() }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private suspend fun getCachedPoints(period: String): List<PointsLeaderboardEntry> {
        return try {
            val entities = leaderboardDao.getLeaderboardByTypeAndPeriod("points", period).first()
            entities.map { it.toPointsEntry() }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private suspend fun saveLeaderboardToLocal(entries: List<LeaderboardEntry>, type: String, period: String) {
        try {
            val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())
            val entities = entries.map { entry ->
                when (entry) {
                    is AttendanceLeaderboardEntry -> entry.toEntity(type, period, timestamp)
                    is PointsLeaderboardEntry -> entry.toEntity(type, period, timestamp)
                    else -> throw IllegalArgumentException("Unknown entry type")
                }
            }
            leaderboardDao.clearByTypeAndPeriod(type, period)
            leaderboardDao.insertAll(entities)
        } catch (e: Exception) {
            Log.e("LeaderboardRepository", "Failed to cache leaderboard", e)
        }
    }
}

// Extension functions for mapping
fun AttendanceLeaderboardEntry.toEntity(type: String, period: String, timestamp: String): LeaderboardEntryEntity {
    return LeaderboardEntryEntity(
        memberId = this.memberId,
        memberName = this.username,
        avatarUrl = null,
        totalPoints = this.pointsEarned,
        availablePoints = 0,
        attendanceRate = this.attendanceRate.toDouble(),
        currentStreak = this.currentStreak,
        weeklyRank = this.rank,
        role = "",
        type = type,
        period = period,
        lastUpdated = timestamp
    )
}

fun PointsLeaderboardEntry.toEntity(type: String, period: String, timestamp: String): LeaderboardEntryEntity {
    return LeaderboardEntryEntity(
        memberId = this.memberId,
        memberName = this.username,
        avatarUrl = null,
        totalPoints = this.pointsEarned,
        availablePoints = this.pointsAvailable,
        attendanceRate = 0.0,
        currentStreak = 0,
        weeklyRank = this.rank,
        role = "",
        type = type,
        period = period,
        lastUpdated = timestamp
    )
}

fun LeaderboardEntryEntity.toAttendanceEntry(): AttendanceLeaderboardEntry {
    return AttendanceLeaderboardEntry(
        rank = this.weeklyRank,
        username = this.memberName,
        memberId = this.memberId,
        totalKills = 0,
        pointsEarned = this.totalPoints,
        attendanceRate = this.attendanceRate.toInt(),
        currentStreak = this.currentStreak
    )
}

fun LeaderboardEntryEntity.toPointsEntry(): PointsLeaderboardEntry {
    return PointsLeaderboardEntry(
        rank = this.weeklyRank,
        username = this.memberName,
        memberId = this.memberId,
        pointsAvailable = this.availablePoints,
        pointsEarned = this.totalPoints,
        pointsSpent = 0,
        consumptionRate = 0
    )
}
