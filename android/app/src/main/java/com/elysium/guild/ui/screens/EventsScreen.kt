package com.elysium.guild.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.airbnb.lottie.compose.*
import com.elysium.guild.R
import com.elysium.guild.ui.components.*
import com.elysium.guild.ui.theme.ElysiumGold
import com.elysium.guild.utils.PreferenceManager
import com.elysium.guild.viewmodel.EventsViewModel
import com.elysium.guild.utils.Constants

@OptIn(ExperimentalMaterial3Api::class, ExperimentalSharedTransitionApi::class)
@Composable
fun EventsScreen(
    navController: NavController,
    viewModel: EventsViewModel = hiltViewModel(),
    preferenceManager: PreferenceManager,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope
) {
    val uiState by viewModel.uiState.collectAsState()
    val currentTime = viewModel.currentTime.collectAsState()
    val useLocalTimezone by preferenceManager.useLocalTimezone.collectAsState()
    val pullToRefreshState = rememberPullToRefreshState()
    val listState = rememberLazyListState()

    val scrollOffset = remember {
        derivedStateOf {
            if (listState.layoutInfo.visibleItemsInfo.isEmpty()) 0f
            else listState.firstVisibleItemScrollOffset.toFloat() + listState.firstVisibleItemIndex * 500f
        }
    }

    LaunchedEffect(Unit) {
        viewModel.refreshEvents(isInitial = true)
    }
    
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        DynamicElysiumBackground(scrollOffset = scrollOffset.value) {
            PullToRefreshBox(
                state = pullToRefreshState,
                isRefreshing = uiState.isRefreshing,
                onRefresh = { viewModel.refreshEvents() },
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
                    
                    if (uiState.error != null && uiState.events.isNotEmpty()) {
                        OfflineBanner()
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = Constants.TITLE_GUILD_EVENTS.uppercase(),
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
                            text = Constants.SUBTITLE_GUILD_EVENTS.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                            letterSpacing = 3.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(20.dp))
                    
                    Box(modifier = Modifier.weight(1f)) {
                        when {
                            uiState.isLoading && uiState.events.isEmpty() -> {
                                EventShimmerList()
                            }
                            
                            uiState.error != null && uiState.events.isEmpty() -> {
                                ErrorMessage(
                                    message = uiState.error ?: "Unknown error",
                                    onRetry = { viewModel.refreshEvents() }
                                )
                            }
                            
                            else -> {
                                LazyColumn(
                                    state = listState,
                                    modifier = Modifier.fillMaxSize(),
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                    contentPadding = PaddingValues(bottom = 100.dp)
                                ) {
                                    itemsIndexed(
                                        items = uiState.events,
                                        key = { _, event -> event.id }
                                    ) { index, event ->
                                        ElysiumEventCard(
                                            modifier = Modifier.animateItem(
                                                fadeInSpec = tween(300, delayMillis = (index % 8) * 40),
                                                fadeOutSpec = tween(200),
                                                placementSpec = spring(
                                                    dampingRatio = Spring.DampingRatioLowBouncy,
                                                    stiffness = Spring.StiffnessLow
                                                )
                                            ),
                                            event = event,
                                            currentTime = currentTime,
                                            useLocalTimezone = useLocalTimezone,
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
}
