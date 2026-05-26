package com.elysium.guild.repository

import android.util.Log
import com.elysium.guild.database.EventsDao
import com.elysium.guild.models.*
import com.elysium.guild.network.ElysiumApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.datetime.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class EventsRepository @Inject constructor(
    private val apiService: ElysiumApiService,
    private val eventsDao: EventsDao
) {
    // Cache AlertOverride values to avoid repeated .values() calls
    private val alertOverridesArray = AlertOverride.values()

    private fun getSafeOverride(ordinal: Int): AlertOverride {
        return if (ordinal in alertOverridesArray.indices) {
            alertOverridesArray[ordinal]
        } else {
            AlertOverride.DEFAULT
        }
    }
    
    suspend fun getEvents(): List<GuildEvent> = withContext(Dispatchers.IO) {
        val overrides = try {
            // FIX: Removed .first() because getAllAlertOverrides() returns a List, not a Flow
            eventsDao.getAllAlertOverrides().associateBy { it.eventId }
        } catch (e: Exception) {
            Log.e("EventsRepository", "Failed to fetch overrides from DB", e)
            emptyMap()
        }

        try {
            val response = apiService.getEvents()
            val apiEvents = if (response.isSuccessful && response.body()?.success == true) {
                val events = (response.body()?.data?.events ?: emptyList()).map { event ->
                    val overrideOrdinal = overrides[event.id]?.alertOverride ?: AlertOverride.DEFAULT.ordinal
                    event.copy(alertOverride = getSafeOverride(overrideOrdinal))
                }
                saveEventsToLocal(events)
                events
            } else {
                Log.w("EventsRepository", "API response unsuccessful, trying cache")
                getCachedEventsInternal(overrides)
            }

            if (apiEvents.isEmpty()) {
                getMockEventsWithOverrides(overrides)
            } else {
                apiEvents
            }
        } catch (e: Exception) {
            Log.e("EventsRepository", "Error fetching events, using cache/mock", e)
            val cached = getCachedEventsInternal(overrides)
            if (cached.isEmpty()) {
                getMockEventsWithOverrides(overrides)
            } else cached
        }
    }

    suspend fun updateAlertOverride(eventId: String, override: AlertOverride) = withContext(Dispatchers.IO) {
        try {
            eventsDao.insertAlertOverride(EventAlertOverrideEntity(eventId, override.ordinal))
        } catch (e: Exception) {
            Log.e("EventsRepository", "Failed to update alert override", e)
        }
    }

    private suspend fun getCachedEventsInternal(overrides: Map<String, EventAlertOverrideEntity>): List<GuildEvent> {
        return try {
            val entities = eventsDao.getAllEvents().first()
            entities.map { entity ->
                val overrideOrdinal = overrides[entity.id]?.alertOverride ?: AlertOverride.DEFAULT.ordinal
                entity.toDomainModel().copy(alertOverride = getSafeOverride(overrideOrdinal))
            }
        } catch (e: Exception) {
            Log.e("EventsRepository", "Failed to fetch events from cache", e)
            emptyList()
        }
    }

    private fun getMockEventsWithOverrides(overrides: Map<String, EventAlertOverrideEntity>): List<GuildEvent> {
        return getMockEvents().map { event ->
            val overrideOrdinal = overrides[event.id]?.alertOverride ?: AlertOverride.DEFAULT.ordinal
            event.copy(alertOverride = getSafeOverride(overrideOrdinal))
        }
    }

    private suspend fun saveEventsToLocal(events: List<GuildEvent>) = withContext(Dispatchers.IO) {
        try {
            val entities = events.map { it.toEntity() }
            eventsDao.clearAll()
            eventsDao.insertAll(entities)
        } catch (e: Exception) {
            Log.e("EventsRepository", "Failed to save events to cache", e)
        }
    }

    private fun getMockEvents(): List<GuildEvent> {
        val now = Clock.System.now()
        val tz = TimeZone.of("Asia/Manila")
        val today = now.toLocalDateTime(tz).date

        return listOf(
            createGuildEvent(
                "1", "World Boss Event (Morning)", EventType.WORLD_BOSS,
                today, 11, 0, 30, "Daily World Boss - 11:00 AM (30m duration)"
            ),
            createGuildEvent(
                "2", "World Boss Event (Evening)", EventType.WORLD_BOSS,
                today, 20, 0, 30, "Daily World Boss - 8:00 PM (30m duration)"
            ),
            createGuildEvent(
                "3", "Individual Arena", EventType.ARENA_BATTLE,
                getNextDayOfWeek(today, listOf(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY)),
                20, 30, 60, "Mon, Wed, Fri Arena Battle - 8:30 PM (60m duration)"
            ),
            createGuildEvent(
                "4", "Guild Boss", EventType.GUILD_BOSS,
                getNextDayOfWeek(today, listOf(DayOfWeek.MONDAY)),
                21, 30, 5, "Monday Guild Boss - 9:30 PM (5m duration)"
            ),
            createGuildEvent(
                "5", "Coop Round Arena", EventType.ARENA_BATTLE,
                getNextDayOfWeek(today, listOf(DayOfWeek.TUESDAY, DayOfWeek.THURSDAY, DayOfWeek.SATURDAY)),
                20, 30, 60, "Tue, Thu, Sat Coop Arena - 8:30 PM (60m duration)"
            ),
            createGuildEvent(
                "6", "Guild War Queue Reminder", EventType.SPECIAL_EVENT,
                getNextDayOfWeek(today, listOf(DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY)),
                23, 0, 120, "Thu, Fri, Sat GvG Queue - 11:00 PM (120m duration)"
            ),
            createGuildEvent(
                "7", "GvG / Guild War", EventType.GVG,
                getNextDayOfWeek(today, listOf(DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY)),
                20, 25, 3, "Fri, Sat, Sun Guild War - 8:25 PM (3m duration)"
            )
            /* Temporarily disabled Ancient Citadel Events
            // Ancient Citadel Events
            // Monday
            createGuildEvent("8", "Ancient Citadel - Duplican", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.MONDAY)), 12, 0, 60, "Monday AC - 12:00 PM"
            ),
            createGuildEvent("9", "Ancient Citadel - Wannitas", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.MONDAY)), 21, 0, 60, "Monday AC - 9:00 PM"
            ),
            // Tuesday
            createGuildEvent("10", "Ancient Citadel - Metus", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.TUESDAY)), 12, 0, 60, "Tuesday AC - 12:00 PM"
            ),
            createGuildEvent("11", "Ancient Citadel - Saphirus", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.TUESDAY)), 21, 0, 60, "Tuesday AC - 9:00 PM"
            ),
            // Wednesday
            createGuildEvent("12", "Ancient Citadel - Clemantis", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.WEDNESDAY)), 12, 0, 60, "Wednesday AC - 12:00 PM"
            ),
            createGuildEvent("13", "Ancient Citadel - Secreta", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.WEDNESDAY)), 21, 0, 60, "Wednesday AC - 9:00 PM"
            ),
            // Thursday
            createGuildEvent("14", "Ancient Citadel - Neutro", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.THURSDAY)), 12, 0, 60, "Thursday AC - 12:00 PM"
            ),
            createGuildEvent("15", "Ancient Citadel - Roderick", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.THURSDAY)), 21, 0, 60, "Thursday AC - 9:00 PM"
            ),
            // Friday
            createGuildEvent("16", "Ancient Citadel - Auraq", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.FRIDAY)), 12, 0, 60, "Friday AC - 12:00 PM"
            ),
            createGuildEvent("17", "Ancient Citadel - Thymele", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.FRIDAY)), 21, 0, 60, "Friday AC - 9:00 PM"
            ),
            // Saturday
            createGuildEvent("18", "Ancient Citadel - Titore", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.SATURDAY)), 12, 0, 60, "Saturday AC - 12:00 PM"
            ),
            createGuildEvent("19", "Ancient Citadel - Ringor", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.SATURDAY)), 21, 0, 60, "Saturday AC - 9:00 PM"
            ),
            // Sunday
            createGuildEvent("20", "Ancient Citadel - Chaiflock", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.SUNDAY)), 12, 0, 60, "Sunday AC - 12:00 PM"
            ),
            createGuildEvent("21", "Ancient Citadel - Benji", EventType.ANCIENT_CITADEL,
                getNextDayOfWeek(today, listOf(DayOfWeek.SUNDAY)), 21, 0, 60, "Sunday AC - 9:00 PM"
            )
            */
        ).sortedBy { it.startTime }
    }

    private fun createGuildEvent(
        id: String, name: String, type: EventType,
        date: LocalDate, hour: Int, minute: Int, durationMinutes: Int, description: String
    ): GuildEvent {
        val tz = TimeZone.of("Asia/Manila")
        val eventDateTime = LocalDateTime(date.year, date.month, date.dayOfMonth, hour, minute)
        var startInstant = eventDateTime.toInstant(tz)
        var endInstant = startInstant.plus(durationMinutes, DateTimeUnit.MINUTE)

        if (endInstant < Clock.System.now()) {
            val nextDay = date.plus(1, DateTimeUnit.DAY)
            val nextEventDateTime = LocalDateTime(nextDay.year, nextDay.month, nextDay.dayOfMonth, hour, minute)
            startInstant = nextEventDateTime.toInstant(tz)
            endInstant = startInstant.plus(durationMinutes, DateTimeUnit.MINUTE)
        }

        return GuildEvent(
            id = id,
            name = name,
            type = type,
            startTime = startInstant.toString(),
            endTime = endInstant.toString(),
            description = description,
            reminderSet = false
        )
    }

    private fun getNextDayOfWeek(today: LocalDate, allowedDays: List<DayOfWeek>): LocalDate {
        var current = today
        repeat(7) {
            if (allowedDays.contains(current.dayOfWeek)) {
                return current
            }
            current = current.plus(1, DateTimeUnit.DAY)
        }
        return today
    }
}

fun GuildEvent.toEntity(): EventEntity {
    return EventEntity(
        id = this.id,
        name = this.name,
        type = this.type.name,
        startTime = this.startTime,
        endTime = this.endTime,
        description = this.description,
        reminderSet = this.reminderSet
    )
}

fun EventEntity.toDomainModel(): GuildEvent {
    return GuildEvent(
        id = this.id,
        name = this.name,
        type = try { EventType.valueOf(this.type) } catch(e: Exception) { EventType.SPECIAL_EVENT },
        startTime = this.startTime,
        endTime = this.endTime,
        description = this.description,
        reminderSet = this.reminderSet
    )
}
