package com.elysium.guild.database

import androidx.room.*
import kotlinx.coroutines.flow.Flow
import com.elysium.guild.models.*

@Dao
interface BossTimerDao {
    
    @Query("SELECT * FROM boss_timers ORDER BY name ASC")
    fun getAllBossTimers(): Flow<List<BossTimerEntity>>
    
    @Query("SELECT * FROM boss_timers WHERE id = :id")
    suspend fun getBossTimerById(id: String): BossTimerEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(bossTimers: List<BossTimerEntity>): List<Long>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBossTimer(bossTimer: BossTimerEntity): Long
    
    @Query("DELETE FROM boss_timers")
    suspend fun clearAll(): Int

    // Alert Overrides
    @Query("SELECT * FROM boss_alert_overrides")
    suspend fun getAllAlertOverrides(): List<BossAlertOverrideEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAlertOverride(override: BossAlertOverrideEntity)

    @Query("SELECT * FROM boss_alert_overrides WHERE bossName = :bossName")
    suspend fun getAlertOverrideForBoss(bossName: String): BossAlertOverrideEntity?
}

@Dao
interface LeaderboardDao {
    
    @Query("SELECT * FROM leaderboard WHERE type = :type AND period = :period ORDER BY weeklyRank ASC")
    fun getLeaderboardByTypeAndPeriod(type: String, period: String): Flow<List<LeaderboardEntryEntity>>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(entries: List<LeaderboardEntryEntity>): List<Long>
    
    @Query("DELETE FROM leaderboard WHERE type = :type AND period = :period")
    suspend fun clearByTypeAndPeriod(type: String, period: String): Int
}

@Dao
interface EventsDao {
    
    @Query("SELECT * FROM events ORDER BY startTime ASC")
    fun getAllEvents(): Flow<List<EventEntity>>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(events: List<EventEntity>): List<Long>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEvent(event: EventEntity): Long
    
    @Query("DELETE FROM events")
    suspend fun clearAll(): Int

    // Alert Overrides
    @Query("SELECT * FROM event_alert_overrides")
    suspend fun getAllAlertOverrides(): List<EventAlertOverrideEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAlertOverride(override: EventAlertOverrideEntity)

    @Query("SELECT * FROM event_alert_overrides WHERE eventId = :eventId")
    suspend fun getAlertOverrideForEvent(eventId: String): EventAlertOverrideEntity?
}

@Dao
interface MemberProfileDao {
    
    @Query("SELECT * FROM member_profile WHERE memberId = :memberId")
    suspend fun getMemberProfile(memberId: String): MemberProfileEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProfile(profile: MemberProfileEntity): Long
    
    @Query("DELETE FROM member_profile WHERE memberId = :memberId")
    suspend fun deleteProfile(memberId: String): Int
}
