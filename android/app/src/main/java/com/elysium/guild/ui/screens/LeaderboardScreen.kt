package com.elysium.guild.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.elysium.guild.ui.components.*
import com.elysium.guild.ui.theme.ElysiumGold
import com.elysium.guild.viewmodel.LeaderboardViewModel
import com.elysium.guild.models.LeaderboardType
import com.elysium.guild.viewmodel.LeaderboardPeriod
import com.elysium.guild.viewmodel.PointsFilter
import com.elysium.guild.utils.Constants

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun LeaderboardScreen(
    navController: NavController,
    viewModel: LeaderboardViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val configuration = LocalConfiguration.current
    val screenWidth = configuration.screenWidthDp.dp
    val listState = rememberLazyListState()

    val scrollOffset = remember { 
        derivedStateOf { 
            listState.firstVisibleItemScrollOffset.toFloat() + listState.firstVisibleItemIndex * 500f 
        } 
    }

    val contentPadding = if (screenWidth < 360.dp) 8.dp else 16.dp
    val headerSpacing = if (screenWidth < 360.dp) 8.dp else 16.dp

    LaunchedEffect(Unit) {
        viewModel.refreshLeaderboard()
    }
    
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        DynamicElysiumBackground(scrollOffset = scrollOffset.value) {
            Box(modifier = Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = contentPadding)
                ) {
                    Spacer(modifier = Modifier.height(headerSpacing))
                    
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        val baseStyle = if (screenWidth < 360.dp) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.headlineMedium
                        Text(
                            text = Constants.TITLE_LEADERBOARD.uppercase(),
                            style = baseStyle.copy(
                                letterSpacing = 2.sp,
                                shadow = Shadow(
                                    color = ElysiumGold.copy(alpha = 0.5f),
                                    blurRadius = 15f
                                )
                            ),
                            fontWeight = FontWeight.Black,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center
                        )
                        Text(
                            text = Constants.SUBTITLE_LEADERBOARD.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center,
                            letterSpacing = 3.sp
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(headerSpacing))

                    ElysiumGlassSearchBar(
                        query = uiState.searchQuery,
                        onQueryChange = { viewModel.onSearchQueryChanged(it) },
                        onClear = { viewModel.onSearchQueryChanged("") },
                        placeholder = "Search members...",
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(headerSpacing))
                    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        ElysiumFilterChip(
                            modifier = Modifier.weight(1f),
                            selected = uiState.leaderboardType == LeaderboardType.ATTENDANCE,
                            onClick = { viewModel.setLeaderboardType(LeaderboardType.ATTENDANCE) },
                            label = "Attendance"
                        )

                        ElysiumFilterChip(
                            modifier = Modifier.weight(1f),
                            selected = uiState.leaderboardType == LeaderboardType.POINTS,
                            onClick = { viewModel.setLeaderboardType(LeaderboardType.POINTS) },
                            label = "Points"
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(8.dp))

                    val subFilterScrollState = rememberScrollState()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(subFilterScrollState),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        if (uiState.leaderboardType == LeaderboardType.ATTENDANCE) {
                            LeaderboardPeriod.entries.forEach { period ->
                                ElysiumFilterChip(
                                    selected = uiState.selectedPeriod == period,
                                    onClick = { viewModel.setPeriod(period) },
                                    label = period.label
                                )
                            }
                        } else {
                            PointsFilter.entries.forEach { filter ->
                                ElysiumFilterChip(
                                    selected = uiState.selectedPointsFilter == filter,
                                    onClick = { viewModel.setPointsFilter(filter) },
                                    label = filter.label
                                )
                            }
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))

                    Box(modifier = Modifier.weight(1f)) {
                        when {
                            uiState.isLoading && uiState.filteredLeaderboard.isEmpty() -> {
                                LeaderboardShimmerList()
                            }

                            uiState.error != null && uiState.filteredLeaderboard.isEmpty() -> {
                                ErrorMessage(
                                    message = uiState.error ?: "Unknown error",
                                    onRetry = { viewModel.refreshLeaderboard() }
                                )
                            }

                            uiState.filteredLeaderboard.isEmpty() -> {
                                EmptyState(uiState.searchQuery)
                            }

                            else -> {
                                val sortedList = uiState.sortedLeaderboard
                                Column(modifier = Modifier.fillMaxSize()) {
                                    AnimatedVisibility(
                                        visible = uiState.searchQuery.isEmpty(),
                                        enter = expandVertically() + fadeIn(),
                                        exit = shrinkVertically() + fadeOut()
                                    ) {
                                        LeaderboardPodium(
                                            topThree = sortedList.take(3),
                                            leaderboardType = uiState.leaderboardType,
                                            pointsFilter = uiState.selectedPointsFilter,
                                            searchQuery = uiState.searchQuery
                                        )
                                    }

                                    val itemsToShow = if (uiState.searchQuery.isEmpty()) sortedList.drop(3) else uiState.filteredLeaderboard
                                    
                                    LazyColumn(
                                        state = listState,
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier.weight(1f),
                                        contentPadding = PaddingValues(bottom = 80.dp)
                                    ) {
                                        itemsIndexed(
                                            items = itemsToShow,
                                            key = { _, it -> "${it.memberId}_${uiState.leaderboardType}" }
                                        ) { index, member ->
                                            LeaderboardMemberCard(
                                                modifier = Modifier.animateItem(
                                                    fadeInSpec = tween(300, delayMillis = (index % 10) * 50),
                                                    fadeOutSpec = tween(300),
                                                    placementSpec = spring(
                                                        dampingRatio = Spring.DampingRatioMediumBouncy,
                                                        stiffness = Spring.StiffnessLow
                                                    )
                                                ),
                                                member = member,
                                                rank = sortedList.indexOfFirst { it.memberId == member.memberId } + 1,
                                                type = uiState.leaderboardType,
                                                pointsFilter = uiState.selectedPointsFilter,
                                                searchQuery = uiState.searchQuery
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
    }
}

@Composable
private fun EmptyState(query: String) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = if (query.isEmpty()) "No data available" else "No members found matching \"$query\"",
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(16.dp)
        )
    }
}
