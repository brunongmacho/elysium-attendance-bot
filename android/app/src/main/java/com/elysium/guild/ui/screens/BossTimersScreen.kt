package com.elysium.guild.ui.screens

import android.content.Context
import androidx.compose.animation.*
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.airbnb.lottie.compose.*
import com.elysium.guild.R
import com.elysium.guild.ui.components.*
import com.elysium.guild.ui.theme.ElysiumGold
import com.elysium.guild.utils.Constants
import com.elysium.guild.utils.PreferenceManager
import com.elysium.guild.utils.HapticUtils
import com.elysium.guild.viewmodel.BossTimersViewModel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalSharedTransitionApi::class)
@Composable
fun BossTimersScreen(
    viewModel: BossTimersViewModel = hiltViewModel(),
    preferenceManager: PreferenceManager,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope
) {
    val uiState by viewModel.uiState.collectAsState()
    val currentTime = viewModel.currentTime.collectAsState()
    val useLocalTimezone by preferenceManager.useLocalTimezone.collectAsState()
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current
    val pullRefreshState = rememberPullToRefreshState()
    
    val scrollOffset = remember { derivedStateOf { 
        if (listState.layoutInfo.visibleItemsInfo.isEmpty()) 0f 
        else listState.firstVisibleItemIndex * 500f + listState.firstVisibleItemScrollOffset.toFloat() 
    } }

    var previousBossStatuses by remember { mutableStateOf(mapOf<String, String>()) }

    LaunchedEffect(uiState.bosses) {
        val currentStatuses = uiState.bosses.associate { it.bossName to it.status }
        if (previousBossStatuses.isNotEmpty()) {
            val hasChangedToTracking = uiState.bosses.any { boss ->
                val prevStatus = previousBossStatuses[boss.bossName]
                (prevStatus == Constants.STATUS_READY || prevStatus == Constants.STATUS_SOON) && boss.status == Constants.STATUS_TRACKING
            }
            if (hasChangedToTracking) {
                listState.animateScrollToItem(0)
            }
        }
        previousBossStatuses = currentStatuses
    }
    
    LaunchedEffect(Unit) {
        viewModel.refreshEvents.collectLatest { shouldScrollToTop ->
            if (viewModel.isHapticEnabled()) {
                HapticUtils.performHapticFeedback(context)
            }
            if (shouldScrollToTop) {
                listState.animateScrollToItem(0)
            }
        }
    }

    LaunchedEffect(uiState.isRefreshing) {
        if (uiState.isRefreshing && viewModel.isHapticEnabled()) {
            HapticUtils.performHapticFeedback(context, duration = 15)
        }
    }

    // Force scroll to top when filters or search changes to ensure user sees the start of the results
    // and doesn't "follow" the previous position which might be in the middle of a now-shorter list
    LaunchedEffect(uiState.onlyElysiumTurn, uiState.selectedFilter, uiState.searchQuery) {
        if (uiState.filteredBosses.isNotEmpty()) {
            listState.animateScrollToItem(0)
        }
    }
    
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        DynamicElysiumBackground(scrollOffset = scrollOffset.value) {
            PullToRefreshBox(
                state = pullRefreshState,
                isRefreshing = uiState.isRefreshing,
                onRefresh = { viewModel.refreshTimers() },
                modifier = Modifier.fillMaxSize(),
                indicator = {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(top = 48.dp)
                    ) {
                        val composition by rememberLottieComposition(LottieCompositionSpec.RawRes(R.raw.loading_orb))
                        LottieAnimation(
                            composition = composition,
                            iterations = LottieConstants.IterateForever,
                            modifier = Modifier.size(80.dp)
                        )
                    }
                }
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp)
                ) {
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    if (uiState.error != null && uiState.bosses.isNotEmpty()) {
                        OfflineBanner()
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    Box(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = Constants.TITLE_BOSS_TIMERS.uppercase(),
                                style = MaterialTheme.typography.headlineMedium.copy(
                                    letterSpacing = 2.sp,
                                    shadow = androidx.compose.ui.graphics.Shadow(
                                        color = ElysiumGold.copy(alpha = 0.5f),
                                        blurRadius = 15f
                                    )
                                ),
                                fontWeight = FontWeight.Black,
                                color = MaterialTheme.colorScheme.primary,
                                textAlign = TextAlign.Center
                            )
                            Text(
                                text = Constants.SUBTITLE_BOSS_TIMERS.uppercase(),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                                letterSpacing = 3.sp,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(20.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        ElysiumGlassSearchBar(
                            query = uiState.searchQuery,
                            onQueryChange = { 
                                viewModel.onSearchQueryChanged(it)
                            },
                            onClear = { viewModel.onSearchQueryChanged("") },
                            placeholder = "Search encounter...",
                            modifier = Modifier.weight(1f)
                        )

                        IconButton(
                            onClick = { 
                                viewModel.toggleElysiumTurnFilter()
                            },
                            modifier = Modifier
                                .size(56.dp)
                                .background(
                                    color = if (uiState.onlyElysiumTurn) 
                                        MaterialTheme.colorScheme.primary.copy(alpha = 0.2f) 
                                    else 
                                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f),
                                    shape = RoundedCornerShape(16.dp)
                                )
                        ) {
                            Icon(
                                imageVector = Icons.Default.Shield,
                                contentDescription = "Guild Filter",
                                tint = if (uiState.onlyElysiumTurn) 
                                    MaterialTheme.colorScheme.primary 
                                else 
                                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                    
                    val filters = listOf("All", "Ready", "Soon", "Tracking")
                    val displayBossesForCounts = if (uiState.onlyElysiumTurn) {
                        uiState.bosses.filter { it.rotation?.isOurTurn == true }
                    } else {
                        uiState.bosses
                    }

                    val filterCounts = remember(displayBossesForCounts) {
                        mapOf(
                            "All" to displayBossesForCounts.size,
                            "Ready" to displayBossesForCounts.count { it.status == Constants.STATUS_READY || it.status == Constants.STATUS_OVERDUE || (it.timeRemaining ?: 1L) <= 0L },
                            "Soon" to displayBossesForCounts.count {
                                val isReady = it.status == Constants.STATUS_READY || it.status == Constants.STATUS_OVERDUE || (it.timeRemaining ?: 1L) <= 0L
                                !isReady && (it.status == Constants.STATUS_SOON || (it.timeRemaining != null && it.timeRemaining <= Constants.SPAWNING_SOON_THRESHOLD_MS))
                            },
                            "Tracking" to displayBossesForCounts.count {
                                 val isReady = it.status == Constants.STATUS_READY || it.status == Constants.STATUS_OVERDUE || (it.timeRemaining ?: 1L) <= 0L
                                 val isSoon = !isReady && (it.status == Constants.STATUS_SOON || (it.timeRemaining != null && it.timeRemaining <= Constants.SPAWNING_SOON_THRESHOLD_MS))
                                 !isReady && !isSoon
                            }
                        )
                    }

                    FilterChipsWithCounts(
                        selectedFilter = uiState.selectedFilter,
                        onFilterSelected = { filter ->
                            viewModel.setFilter(filter)
                        },
                        filters = filters,
                        counts = filterCounts
                    )
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    Box(modifier = Modifier.weight(1f)) {
                        if (uiState.isLoading && uiState.bosses.isEmpty()) {
                            BossShimmerList()
                        } else if (uiState.error != null && uiState.bosses.isEmpty()) {
                            ErrorMessage(message = uiState.error!!, onRetry = { viewModel.refreshTimers() })
                        } else if (uiState.filteredBosses.isEmpty()) {
                            EmptyBossState(
                                query = uiState.searchQuery,
                                isElysiumFilterActive = uiState.onlyElysiumTurn,
                                onClearFilters = {
                                    viewModel.onSearchQueryChanged("")
                                    viewModel.setFilter("All")
                                    if (uiState.onlyElysiumTurn) viewModel.toggleElysiumTurnFilter()
                                }
                            )
                        } else {
                            LazyColumn(
                                state = listState,
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                                contentPadding = PaddingValues(bottom = 100.dp),
                                modifier = Modifier.fillMaxSize()
                            ) {
                                itemsIndexed(
                                    items = uiState.filteredBosses,
                                    key = { _, boss -> boss.bossName }
                                ) { index, boss ->
                                    BossTimerCard(
                                        modifier = Modifier.animateItem(
                                            fadeInSpec = tween(300, delayMillis = (index % 8) * 40),
                                            fadeOutSpec = tween(200),
                                            placementSpec = spring(
                                                dampingRatio = Spring.DampingRatioLowBouncy,
                                                stiffness = Spring.StiffnessLow
                                            )
                                        ),
                                        boss = boss,
                                        currentTime = currentTime,
                                        useLocalTimezone = useLocalTimezone,
                                        searchQuery = uiState.searchQuery,
                                        sharedTransitionScope = sharedTransitionScope,
                                        animatedVisibilityScope = animatedVisibilityScope,
                                        onAlertOverrideToggle = { viewModel.toggleAlertOverride(it) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun FilterChipsWithCounts(
    selectedFilter: String,
    onFilterSelected: (String) -> Unit,
    filters: List<String>,
    counts: Map<String, Int>
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        for (filter in filters) {
            ElysiumFilterChip(
                modifier = Modifier.weight(1f),
                selected = selectedFilter == filter,
                onClick = { onFilterSelected(filter) },
                label = filter,
                count = counts[filter]
            )
        }
    }
}

@Composable
fun EmptyBossState(
    query: String,
    isElysiumFilterActive: Boolean = false,
    onClearFilters: () -> Unit = {}
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        val composition by rememberLottieComposition(LottieCompositionSpec.RawRes(R.raw.empty_search))
        LottieAnimation(
            composition = composition,
            iterations = LottieConstants.IterateForever,
            modifier = Modifier.size(150.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = when {
                query.isNotEmpty() -> "No encounter matches \"$query\""
                isElysiumFilterActive -> "No guild bosses active"
                else -> "The archives are empty"
            },
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(24.dp))

        TextButton(onClick = onClearFilters) {
            Text("RESET FILTERS", fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
        }
    }
}
