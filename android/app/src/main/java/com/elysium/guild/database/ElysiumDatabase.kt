package com.elysium.guild.database

import androidx.room.*
import com.elysium.guild.models.*

@Database(
    entities = [
        BossTimerEntity::class,
        BossAlertOverrideEntity::class,
        EventAlertOverrideEntity::class,
        LeaderboardEntryEntity::class,
        EventEntity::class,
        MemberProfileEntity::class
    ],
    version = 15, // Force a clean start to resolve schema mismatches
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class ElysiumDatabase : RoomDatabase() {
    
    abstract fun bossTimerDao(): BossTimerDao
    abstract fun leaderboardDao(): LeaderboardDao
    abstract fun eventsDao(): EventsDao
    abstract fun memberProfileDao(): MemberProfileDao
}

class Converters {
    @TypeConverter
    fun fromStringList(value: List<String>): String {
        return value.joinToString(",")
    }
    
    @TypeConverter
    fun toStringList(value: String): List<String> {
        return if (value.isEmpty()) emptyList() else value.split(",")
    }
}
