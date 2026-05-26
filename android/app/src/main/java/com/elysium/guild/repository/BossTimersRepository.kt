package com.elysium.guild.repository

import android.util.Log
import com.elysium.guild.database.BossTimerDao
import com.elysium.guild.models.*
import com.elysium.guild.network.ElysiumApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BossTimersRepository @Inject constructor(
    private val apiService: ElysiumApiService,
    private val bossTimerDao: BossTimerDao
) {
    private val _bossDataChanged = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val bossDataChanged: SharedFlow<Unit> = _bossDataChanged.asSharedFlow()

    private val previousStatuses = ConcurrentHashMap<String, String>()

    suspend fun getBossTimers(): List<BossTimer> = withContext(Dispatchers.IO) {
        val overrides = try {
            bossTimerDao.getAllAlertOverrides().associateBy { it.bossName }
        } catch (e: Exception) {
            Log.e("BossTimersRepository", "Failed to fetch overrides", e)
            emptyMap()
        }

        try {
            val response = apiService.getBossTimers()
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    val bossesList = body.bosses ?: body.data ?: emptyList()
                    if (bossesList.isNotEmpty() || body.success == true) {
                        val bosses = bossesList.map { boss ->
                            val overrideOrdinal = overrides[boss.bossName]?.alertOverride ?: AlertOverride.DEFAULT.ordinal
                            val override = AlertOverride.entries.getOrElse(overrideOrdinal) { AlertOverride.DEFAULT }
                            boss.copy(alertOverride = override)
                        }

                        val hasStatusChanged = detectStatusChanges(bosses)
                        saveBossesToLocal(bosses)

                        if (hasStatusChanged) {
                            _bossDataChanged.tryEmit(Unit)
                        }
                        return@withContext bosses
                    }
                }
            }
            Log.w("BossTimersRepository", "API unsuccessful, falling back to cache")
            getCachedBossesInternal(overrides)
        } catch (e: Exception) {
            Log.e("BossTimersRepository", "Error fetching boss timers", e)
            getCachedBossesInternal(overrides)
        }
    }

    suspend fun updateAlertOverride(bossName: String, override: AlertOverride) = withContext(Dispatchers.IO) {
        try {
            bossTimerDao.insertAlertOverride(BossAlertOverrideEntity(bossName, override.ordinal))
            _bossDataChanged.tryEmit(Unit)
        } catch (e: Exception) {
            Log.e("BossTimersRepository", "Failed to update alert override", e)
        }
    }

    private fun detectStatusChanges(newBosses: List<BossTimer>): Boolean {
        var anyChange = false
        newBosses.forEach { boss ->
            val oldStatus = previousStatuses[boss.bossName]
            if (oldStatus != boss.status) {
                anyChange = true
            }
            previousStatuses[boss.bossName] = boss.status
        }
        return anyChange
    }

    private suspend fun getCachedBossesInternal(overrides: Map<String, BossAlertOverrideEntity>): List<BossTimer> {
        return try {
            val entities = bossTimerDao.getAllBossTimers().first()
            entities.map { entity ->
                val overrideOrdinal = overrides[entity.name]?.alertOverride ?: AlertOverride.DEFAULT.ordinal
                val override = AlertOverride.entries.getOrElse(overrideOrdinal) { AlertOverride.DEFAULT }
                entity.toDomainModel().copy(alertOverride = override)
            }
        } catch (e: Exception) {
            Log.e("BossTimersRepository", "Failed to fetch from cache", e)
            emptyList()
        }
    }

    private suspend fun saveBossesToLocal(bosses: List<BossTimer>) {
        try {
            val entities = bosses.map { it.toEntity() }
            bossTimerDao.clearAll()
            bossTimerDao.insertAll(entities)
        } catch (e: Exception) {
            Log.e("BossTimersRepository", "Failed to save to local DB", e)
        }
    }
}

fun BossTimer.toEntity(): BossTimerEntity {
    return BossTimerEntity(
        id = this.bossName,
        name = this.bossName,
        points = this.bossPoints,
        type = this.type,
        nextSpawnTime = this.nextSpawnTime,
        status = this.status,
        imageUrl = this.imageUrl,
        isRotating = this.rotation?.isRotating ?: false,
        currentGuild = this.rotation?.currentGuild
    )
}

fun BossTimerEntity.toDomainModel(): BossTimer {
    return BossTimer(
        bossName = this.name,
        bossPoints = this.points,
        type = this.type,
        imageUrl = this.imageUrl,
        nextSpawnTime = this.nextSpawnTime,
        status = this.status,
        timeRemaining = null,
        rotation = RotationInfo(
            isRotating = this.isRotating,
            currentGuild = this.currentGuild
        )
    )
}
