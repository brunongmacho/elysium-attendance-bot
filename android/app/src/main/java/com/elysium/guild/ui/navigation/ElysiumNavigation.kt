package com.elysium.guild.ui.navigation

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.elysium.guild.ui.components.*
import com.elysium.guild.ui.screens.*
import com.elysium.guild.utils.PreferenceManager
import com.elysium.guild.viewmodel.ProfileViewModel

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun ElysiumNavigation(
    preferenceManager: PreferenceManager,
    profileViewModel: ProfileViewModel = hiltViewModel()
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val isFirstRun by preferenceManager.isFirstRun.collectAsState()

    if (isFirstRun) {
        OnboardingScreen(
            preferenceManager = preferenceManager,
            onComplete = {
                // navController start destination is already correct
            }
        )
    } else {
        Scaffold(
            bottomBar = {
                CustomElysiumNavigationBar {
                    bottomNavItems.forEach { item ->
                        val isSelected = currentDestination?.hierarchy?.any { it.route == item.route } == true

                        NavigationBarItem(
                            icon = {
                                when (item.route) {
                                    Screen.BossTimers.route -> {
                                        BossTimerIcon(isSelected = isSelected)
                                    }
                                    Screen.Events.route -> {
                                        EventCalendarIcon(isSelected = isSelected)
                                    }
                                    Screen.Relic.route -> {
                                        RelicNavIcon(isSelected = isSelected)
                                    }
                                    Screen.Leaderboard.route -> {
                                        LeaderboardIcon(isSelected = isSelected)
                                    }
                                    Screen.Settings.route -> {
                                        SettingsIcon(isSelected = isSelected)
                                    }
                                    else -> {
                                        // Fallback if needed
                                    }
                                }
                            },
                            label = {
                                Text(
                                    item.label,
                                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (isSelected) androidx.compose.ui.text.font.FontWeight.Bold else androidx.compose.ui.text.font.FontWeight.Medium
                                )
                            },
                            selected = isSelected,
                            onClick = {
                                navController.navigate(item.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            colors = NavigationBarItemDefaults.colors(
                                indicatorColor = Color.Transparent
                            )
                        )
                    }
                }
            }
        ) { paddingValues ->
            SharedTransitionLayout {
                NavHost(
                    navController = navController,
                    startDestination = Screen.BossTimers.route,
                    modifier = Modifier.padding(paddingValues)
                ) {
                    composable(Screen.BossTimers.route) {
                        BossTimersScreen(
                            preferenceManager = preferenceManager,
                            sharedTransitionScope = this@SharedTransitionLayout,
                            animatedVisibilityScope = this@composable
                        )
                    }
                    composable(Screen.Events.route) {
                        EventsScreen(
                            navController = navController,
                            preferenceManager = preferenceManager,
                            sharedTransitionScope = this@SharedTransitionLayout,
                            animatedVisibilityScope = this@composable
                        )
                    }
                    composable(Screen.Relic.route) {
                        RelicScreen()
                    }
                    composable(Screen.Leaderboard.route) {
                        LeaderboardScreen(navController)
                    }
                    composable(Screen.Settings.route) {
                        ProfileScreen(
                            navController = navController,
                            viewModel = profileViewModel,
                            preferenceManager = preferenceManager
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CustomElysiumNavigationBar(
    content: @Composable RowScope.() -> Unit
) {
    Surface(
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
        tonalElevation = 12.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(
                        brush = Brush.horizontalGradient(
                            colors = listOf(
                                Color.Transparent,
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.5f),
                                Color.Transparent
                            )
                        )
                    )
            )
            
            NavigationBar(
                containerColor = Color.Transparent,
                contentColor = MaterialTheme.colorScheme.onSurface,
                tonalElevation = 0.dp,
                modifier = Modifier.height(80.dp),
                content = content
            )
        }
    }
}

data class BottomNavItem(
    val route: String,
    val label: String
)

private val bottomNavItems = listOf(
    BottomNavItem(
        route = Screen.BossTimers.route,
        label = "Boss"
    ),
    BottomNavItem(
        route = Screen.Events.route,
        label = "Events"
    ),
    BottomNavItem(
        route = Screen.Relic.route,
        label = "Relic"
    ),
    BottomNavItem(
        route = Screen.Leaderboard.route,
        label = "Ranks"
    ),
    BottomNavItem(
        route = Screen.Settings.route,
        label = "Settings"
    )
)

sealed class Screen(val route: String) {
    object BossTimers : Screen("boss_timers")
    object Events : Screen("events")
    object Relic : Screen("relic")
    object Leaderboard : Screen("leaderboard")
    object Settings : Screen("settings")
}
