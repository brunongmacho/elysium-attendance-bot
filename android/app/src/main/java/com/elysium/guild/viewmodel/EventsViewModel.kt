package com.elysium.guild.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.elysium.guild.models.*
import com.elysium.guild.repository.EventsRepository
import com.elysium.guild.utils.PreferenceManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.util.Log

@HiltViewModel
class EventsViewModel @Inject constructor(
    private val repository: EventsRepository,
    private val preferenceManager: PreferenceManager
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(EventsUiState(
        notificationsEnabled = preferenceManager.eventNotificationsEnabled.value
    ))
    val uiState: StateFlow<EventsUiState> = _uiState.asStateFlow()

    private val _currentTime = MutableStateFlow(Clock.System.now())
    val currentTime: StateFlow<Instant> = _currentTime.asStateFlow()
    
    private var refreshJob: Job? = null
    
    init {
        refreshEvents(isInitial = true)
        startTicker()
    }

    private fun startTicker() {
        viewModelScope.launch {
            while (true) {
                _currentTime.value = Clock.System.now()
                delay(1000L)
            }
        }
    }
    
    fun refreshEvents(isInitial: Boolean = false, isSilent: Boolean = false) {
        // Only skip if it's a background refresh and one is already running
        if (refreshJob?.isActive == true && isSilent) return
        
        // Cancel existing job if we're forcing a refresh (like after an override toggle)
        refreshJob?.cancel()
        
        refreshJob = viewModelScope.launch {
            try {
                if (!isSilent) {
                    if (isInitial || _uiState.value.events.isEmpty()) {
                        _uiState.value = _uiState.value.copy(isLoading = true, error = null)
                    } else {
                        _uiState.value = _uiState.value.copy(isRefreshing = true, error = null)
                    }
                }

                if (!isInitial && !isSilent) delay(300)

                val events = repository.getEvents()
                val now = Clock.System.now()

                val sortedEvents = withContext(Dispatchers.Default) {
                    sortEvents(events, now)
                }

                _uiState.value = _uiState.value.copy(
                    events = sortedEvents,
                    error = null,
                    isLoading = false,
                    isRefreshing = false
                )
            } catch (e: Exception) {
                Log.e("EventsViewModel", "Error refreshing events", e)
                _uiState.value = _uiState.value.copy(
                    error = e.message ?: "Failed to refresh events",
                    isLoading = false,
                    isRefreshing = false
                )
            }
        }
    }

    private fun sortEvents(events: List<GuildEvent>, now: Instant): List<GuildEvent> {
        return try {
            events.sortedWith(compareByDescending<GuildEvent> {
                it.isLive(now)
            }.thenBy {
                try { Instant.parse(it.startTime) } catch (e: Exception) { now }
            })
        } catch (e: Exception) {
            events
        }
    }

    fun toggleAlertOverride(event: GuildEvent) {
        viewModelScope.launch {
            try {
                val nextOverride = when (event.alertOverride) {
                    AlertOverride.DEFAULT -> AlertOverride.SOUND
                    AlertOverride.SOUND -> AlertOverride.VIBRATE
                    AlertOverride.VIBRATE -> AlertOverride.DEFAULT
                }
                repository.updateAlertOverride(event.id, nextOverride)
                // Trigger a silent refresh to update the UI without showing progress bars
                refreshEvents(isSilent = true)
            } catch (e: Exception) {
                Log.e("EventsViewModel", "Error toggling alert override", e)
            }
        }
    }

    fun toggleNotifications() {
        val newValue = !_uiState.value.notificationsEnabled
        preferenceManager.setEventNotificationsEnabled(newValue)
        _uiState.value = _uiState.value.copy(notificationsEnabled = newValue)
    }
}

data class EventsUiState(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val events: List<GuildEvent> = emptyList(),
    val notificationsEnabled: Boolean = true,
    val error: String? = null
)
