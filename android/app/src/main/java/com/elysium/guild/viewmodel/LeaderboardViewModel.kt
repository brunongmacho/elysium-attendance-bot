package com.elysium.guild.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.elysium.guild.models.*
import com.elysium.guild.repository.LeaderboardRepository
import com.elysium.guild.repository.BossTimersRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class LeaderboardPeriod(val value: String?, val label: String) {
    ALL_TIME(null, "All Time"),
    MONTHLY("monthly", "Monthly"),
    WEEKLY("weekly", "Weekly")
}

enum class PointsFilter(val label: String) {
    EARNED("Earned"),
    SPENT("Spent"),
    AVAILABLE("Available")
}

@HiltViewModel
class LeaderboardViewModel @Inject constructor(
    private val repository: LeaderboardRepository,
    private val bossRepository: BossTimersRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(LeaderboardUiState())
    val uiState: StateFlow<LeaderboardUiState> = _uiState.asStateFlow()
    
    private var refreshJob: Job? = null
    
    init {
        refreshLeaderboard()
        observeBossDataChanges()
    }

    private fun observeBossDataChanges() {
        viewModelScope.launch {
            bossRepository.bossDataChanged.collect {
                refreshLeaderboard()
            }
        }
    }
    
    fun refreshLeaderboard(isFilterChange: Boolean = false) {
        refreshJob?.cancel()
        
        refreshJob = viewModelScope.launch {
            val isInitial = _uiState.value.attendanceLeaderboard.isEmpty() && _uiState.value.pointsLeaderboard.isEmpty()
            
            if (isInitial || isFilterChange) {
                _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            } else {
                _uiState.value = _uiState.value.copy(isRefreshing = true, error = null)
            }
            
            if (isFilterChange) delay(300)
            
            try {
                when (_uiState.value.leaderboardType) {
                    LeaderboardType.ATTENDANCE -> {
                        val period = _uiState.value.selectedPeriod.value
                        val leaderboard = repository.getAttendanceLeaderboard(period)

                        val processed = withContext(Dispatchers.Default) {
                            applyCurrentFilter(leaderboard, _uiState.value.searchQuery)
                        }

                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isRefreshing = false,
                            attendanceLeaderboard = leaderboard,
                            filteredLeaderboard = processed
                        )
                    }
                    LeaderboardType.POINTS -> {
                        val leaderboard = repository.getPointsLeaderboard()

                        val processed = withContext(Dispatchers.Default) {
                            applyCurrentFilter(sortPoints(leaderboard, _uiState.value.selectedPointsFilter), _uiState.value.searchQuery)
                        }

                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isRefreshing = false,
                            pointsLeaderboard = leaderboard,
                            filteredLeaderboard = processed
                        )
                    }
                }
            } catch (e: Exception) {
                if (e !is kotlinx.coroutines.CancellationException) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message ?: "Failed to load leaderboard"
                    )
                }
            }
        }
    }
    
    fun setLeaderboardType(type: LeaderboardType) {
        if (type != _uiState.value.leaderboardType) {
            _uiState.value = _uiState.value.copy(
                leaderboardType = type, 
                searchQuery = "",
                attendanceLeaderboard = if (type == LeaderboardType.ATTENDANCE) emptyList() else _uiState.value.attendanceLeaderboard,
                pointsLeaderboard = if (type == LeaderboardType.POINTS) emptyList() else _uiState.value.pointsLeaderboard
            )
            refreshLeaderboard(isFilterChange = true)
        }
    }

    fun setPeriod(period: LeaderboardPeriod) {
        if (period != _uiState.value.selectedPeriod) {
            _uiState.value = _uiState.value.copy(
                selectedPeriod = period, 
                searchQuery = "",
                attendanceLeaderboard = emptyList()
            )
            refreshLeaderboard(isFilterChange = true)
        }
    }

    fun setPointsFilter(filter: PointsFilter) {
        if (filter != _uiState.value.selectedPointsFilter) {
            viewModelScope.launch {
                val sorted = withContext(Dispatchers.Default) {
                    applyCurrentFilter(sortPoints(_uiState.value.pointsLeaderboard, filter), _uiState.value.searchQuery)
                }
                _uiState.value = _uiState.value.copy(
                    selectedPointsFilter = filter,
                    filteredLeaderboard = sorted
                )
            }
        }
    }

    fun onSearchQueryChanged(query: String) {
        viewModelScope.launch {
            val list = if (_uiState.value.leaderboardType == LeaderboardType.ATTENDANCE) {
                _uiState.value.attendanceLeaderboard
            } else {
                sortPoints(_uiState.value.pointsLeaderboard, _uiState.value.selectedPointsFilter)
            }

            val filtered = withContext(Dispatchers.Default) {
                applyCurrentFilter(list, query)
            }

            _uiState.value = _uiState.value.copy(
                searchQuery = query,
                filteredLeaderboard = filtered
            )
        }
    }

    private fun sortPoints(list: List<PointsLeaderboardEntry>, filter: PointsFilter): List<PointsLeaderboardEntry> {
        return when (filter) {
            PointsFilter.EARNED -> list.sortedByDescending { it.pointsEarned }
            PointsFilter.SPENT -> list.sortedByDescending { it.pointsSpent }
            PointsFilter.AVAILABLE -> list.sortedByDescending { it.pointsAvailable }
        }
    }

    private fun applyCurrentFilter(list: List<LeaderboardEntry>, query: String): List<LeaderboardEntry> {
        return if (query.isBlank()) list else list.filter { it.username.contains(query, ignoreCase = true) }
    }
}

data class LeaderboardUiState(
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val attendanceLeaderboard: List<AttendanceLeaderboardEntry> = emptyList(),
    val pointsLeaderboard: List<PointsLeaderboardEntry> = emptyList(),
    val filteredLeaderboard: List<LeaderboardEntry> = emptyList(),
    val leaderboardType: LeaderboardType = LeaderboardType.ATTENDANCE,
    val selectedPeriod: LeaderboardPeriod = LeaderboardPeriod.ALL_TIME,
    val selectedPointsFilter: PointsFilter = PointsFilter.EARNED,
    val searchQuery: String = "",
    val error: String? = null
) {
    val sortedLeaderboard: List<LeaderboardEntry>
        get() {
            return if (leaderboardType == LeaderboardType.ATTENDANCE) {
                attendanceLeaderboard
            } else {
                when (selectedPointsFilter) {
                    PointsFilter.EARNED -> pointsLeaderboard.sortedByDescending { it.pointsEarned }
                    PointsFilter.SPENT -> pointsLeaderboard.sortedByDescending { it.pointsSpent }
                    PointsFilter.AVAILABLE -> pointsLeaderboard.sortedByDescending { it.pointsAvailable }
                }
            }
        }
}
