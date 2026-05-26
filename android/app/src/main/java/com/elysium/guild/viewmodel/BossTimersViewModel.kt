package com.elysium.guild.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.elysium.guild.models.*
import com.elysium.guild.repository.BossTimersRepository
import com.elysium.guild.utils.Constants
import com.elysium.guild.utils.NotificationHelper
import com.elysium.guild.utils.PreferenceManager
import com.elysium.guild.utils.ErrorUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import javax.inject.Inject
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@HiltViewModel
class BossTimersViewModel @Inject constructor(
    private val repository: BossTimersRepository,
    private val preferenceManager: PreferenceManager,
    private val notificationHelper: NotificationHelper,
    @ApplicationContext private val context: Context
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(BossTimersUiState(
        notificationsEnabled = preferenceManager.bossNotificationsEnabled.value
    ))
    val uiState: StateFlow<BossTimersUiState> = _uiState.asStateFlow()

    private val _currentTime = MutableStateFlow(Clock.System.now())
    val currentTime: StateFlow<Instant> = _currentTime.asStateFlow()

    private val _refreshEvents = MutableSharedFlow<Boolean>(extraBufferCapacity = 1)
    val refreshEvents: SharedFlow<Boolean> = _refreshEvents.asSharedFlow()
    
    private val refreshedBossIds = mutableSetOf<String>()
    private var refreshJob: Job? = null

    init {
        refreshTimers(isInitial = true)
        startTicker()
        startAutoRefresh()
    }

    fun isHapticEnabled(): Boolean = preferenceManager.hapticEnabled.value

    private fun startTicker() {
        viewModelScope.launch {
            while (true) {
                val now = Clock.System.now()
                _currentTime.value = now
                checkProximityRefresh(now)
                delay(1000L)
            }
        }
    }

    private fun checkProximityRefresh(now: Instant) {
        val bosses = _uiState.value.bosses
        if (bosses.isEmpty()) return

        bosses.forEach { boss ->
            val spawnTime = boss.nextSpawnTime?.let { try { Instant.parse(it) } catch(e: Exception) { null } } ?: return@forEach
            val diffMs = spawnTime.toEpochMilliseconds() - now.toEpochMilliseconds()
            val refreshKey = "${boss.bossName}_${boss.nextSpawnTime}"

            when {
                diffMs in (Constants.SPAWNING_SOON_THRESHOLD_MS - 1000)..Constants.SPAWNING_SOON_THRESHOLD_MS &&
                        !refreshedBossIds.contains("${refreshKey}_30m") -> {
                    refreshedBossIds.add("${refreshKey}_30m")
                    refreshTimers(isBackground = true)
                }
                diffMs in -2000..0 && !refreshedBossIds.contains("${refreshKey}_spawned") -> {
                    refreshedBossIds.add("${refreshKey}_spawned")
                    refreshTimers(isBackground = true)
                }
            }
        }
    }

    private fun startAutoRefresh() {
        viewModelScope.launch {
            while (true) {
                val hasReadyBoss = _uiState.value.bosses.any { it.isReady() }
                val nextDelay = if (hasReadyBoss) 30_000L else 300_000L
                delay(nextDelay)
                refreshTimers(isBackground = true)
                if (refreshedBossIds.size > 200) refreshedBossIds.clear()
            }
        }
    }
    
    fun refreshTimers(isBackground: Boolean = false, isInitial: Boolean = false) {
        if (refreshJob?.isActive == true && !isBackground) return
        
        refreshJob = viewModelScope.launch {
            if (!isBackground) {
                if (isInitial || _uiState.value.bosses.isEmpty()) {
                    _uiState.value = _uiState.value.copy(isLoading = true, error = null)
                } else {
                    _uiState.value = _uiState.value.copy(isRefreshing = true, error = null)
                }
            }
            
            try {
                if (!isBackground && !isInitial) delay(300)
                
                withTimeout(15000) {
                    val rawBosses = repository.getBossTimers()
                    updateBossData(rawBosses, isBackground)
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isRefreshing = false,
                    error = ErrorUtils.parseError(context, e)
                )
            }
        }
    }

    private suspend fun updateBossData(rawBosses: List<BossTimer>, isBackground: Boolean) {
        val processedBosses = withContext(Dispatchers.Default) {
            val bosses = recalculateTimeRemaining(rawBosses)
            bosses to applyFilter(
                bosses,
                _uiState.value.selectedFilter,
                _uiState.value.searchQuery,
                _uiState.value.onlyElysiumTurn
            )
        }

        _uiState.value = _uiState.value.copy(
            isLoading = false,
            isRefreshing = false,
            bosses = processedBosses.first,
            filteredBosses = processedBosses.second
        )
        _refreshEvents.tryEmit(!isBackground)
    }

    fun toggleAlertOverride(boss: BossTimer) {
        viewModelScope.launch {
            val nextOverride = when (boss.alertOverride) {
                AlertOverride.DEFAULT -> AlertOverride.SOUND
                AlertOverride.SOUND -> AlertOverride.VIBRATE
                AlertOverride.VIBRATE -> AlertOverride.DEFAULT
            }
            repository.updateAlertOverride(boss.bossName, nextOverride)
            refreshTimers(isBackground = true)
        }
    }

    fun setFilter(filter: String) {
        viewModelScope.launch {
            val filtered = withContext(Dispatchers.Default) {
                applyFilter(
                    _uiState.value.bosses,
                    filter,
                    _uiState.value.searchQuery,
                    _uiState.value.onlyElysiumTurn
                )
            }
            _uiState.value = _uiState.value.copy(
                selectedFilter = filter,
                filteredBosses = filtered
            )
        }
    }

    fun onSearchQueryChanged(query: String) {
        viewModelScope.launch {
            val filtered = withContext(Dispatchers.Default) {
                applyFilter(
                    _uiState.value.bosses,
                    _uiState.value.selectedFilter,
                    query,
                    _uiState.value.onlyElysiumTurn
                )
            }
            _uiState.value = _uiState.value.copy(
                searchQuery = query,
                filteredBosses = filtered
            )
        }
    }

    fun toggleElysiumTurnFilter() {
        viewModelScope.launch {
            val next = !_uiState.value.onlyElysiumTurn
            val filtered = withContext(Dispatchers.Default) {
                applyFilter(
                    _uiState.value.bosses,
                    _uiState.value.selectedFilter,
                    _uiState.value.searchQuery,
                    next
                )
            }
            _uiState.value = _uiState.value.copy(
                onlyElysiumTurn = next,
                filteredBosses = filtered
            )
        }
    }

    private fun recalculateTimeRemaining(bosses: List<BossTimer>): List<BossTimer> {
        val now = Clock.System.now()
        return bosses.map { boss ->
            val nextSpawn = boss.nextSpawnTime?.let {
                try { Instant.parse(it) } catch (e: Exception) { null }
            }
            val newTimeRemaining = if (nextSpawn != null) (nextSpawn - now).inWholeMilliseconds else boss.timeRemaining

            val updatedStatus = when {
                (newTimeRemaining ?: 1L) <= 0L -> Constants.STATUS_READY
                (newTimeRemaining ?: Long.MAX_VALUE) <= Constants.SPAWNING_SOON_THRESHOLD_MS -> Constants.STATUS_SOON
                else -> Constants.STATUS_TRACKING
            }

            boss.copy(timeRemaining = newTimeRemaining, status = updatedStatus)
        }
    }
    
    private fun applyFilter(
        bosses: List<BossTimer>,
        filter: String,
        searchQuery: String,
        onlyElysiumTurn: Boolean
    ): List<BossTimer> {
        var result = bosses

        if (onlyElysiumTurn) {
            result = result.filter { it.rotation?.isOurTurn == true }
        }

        if (searchQuery.isNotBlank()) {
            result = result.filter { it.bossName.contains(searchQuery, ignoreCase = true) }
        }

        return when (filter) {
            "Ready" -> result.filter { it.isReady() }
            "Soon" -> result.filter { it.isSoon() }
            "Tracking" -> result.filter { it.isTracking() }
            else -> result
        }
    }
}

data class BossTimersUiState(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val bosses: List<BossTimer> = emptyList(),
    val filteredBosses: List<BossTimer> = emptyList(),
    val selectedFilter: String = "All",
    val searchQuery: String = "",
    val onlyElysiumTurn: Boolean = false,
    val notificationsEnabled: Boolean = true,
    val error: String? = null
)
