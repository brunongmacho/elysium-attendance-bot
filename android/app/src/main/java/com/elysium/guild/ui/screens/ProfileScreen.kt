package com.elysium.guild.ui.screens

import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.widget.Toast
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpCenter
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavController
import com.elysium.guild.R
import com.elysium.guild.ui.components.*
import com.elysium.guild.ui.theme.ElysiumGold
import com.elysium.guild.utils.Constants
import com.elysium.guild.utils.PreferenceManager
import com.elysium.guild.utils.PermissionUtils
import com.elysium.guild.utils.HapticUtils
import com.elysium.guild.viewmodel.ProfileViewModel
import com.elysium.guild.viewmodel.UpdateState
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    navController: NavController,
    viewModel: ProfileViewModel = hiltViewModel(),
    preferenceManager: PreferenceManager
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val isDark = isAppInDarkTheme()
    val scrollState = rememberScrollState()
    
    val scrollOffset = remember { derivedStateOf { scrollState.value.toFloat() } }
    
    val themeMode by preferenceManager.themeMode.collectAsState()
    val hapticEnabled by preferenceManager.hapticEnabled.collectAsState()
    val vibrateOnly by preferenceManager.vibrateOnly.collectAsState()
    val savedSound by preferenceManager.notificationSound.collectAsState()
    val savedBossNotif by preferenceManager.bossNotificationsEnabled.collectAsState()
    val savedEventNotif by preferenceManager.eventNotificationsEnabled.collectAsState()
    val savedBubbleEnabled by preferenceManager.floatingBubbleEnabled.collectAsState()
    val savedLocalTimezone by preferenceManager.useLocalTimezone.collectAsState()

    var pendingThemeMode by remember(themeMode) { mutableIntStateOf(themeMode) }
    var pendingHapticEnabled by remember(hapticEnabled) { mutableStateOf(hapticEnabled) }
    var pendingVibrateOnly by remember(vibrateOnly) { mutableStateOf(vibrateOnly) }
    var pendingSound by remember(savedSound) { mutableStateOf(savedSound) }
    var pendingBossNotif by remember(savedBossNotif) { mutableStateOf(savedBossNotif) }
    var pendingEventNotif by remember(savedEventNotif) { mutableStateOf(savedEventNotif) }
    var pendingBubbleEnabled by remember(savedBubbleEnabled) { mutableStateOf(savedBubbleEnabled) }
    var pendingLocalTimezone by remember(savedLocalTimezone) { mutableStateOf(savedLocalTimezone) }

    var showSaveSuccess by remember { mutableStateOf(false) }

    val hasChanges = pendingThemeMode != themeMode ||
            pendingHapticEnabled != hapticEnabled ||
            pendingVibrateOnly != vibrateOnly ||
            pendingSound != savedSound ||
            pendingBossNotif != savedBossNotif ||
            pendingEventNotif != savedEventNotif ||
            pendingBubbleEnabled != savedBubbleEnabled ||
            pendingLocalTimezone != savedLocalTimezone

    val updateState by viewModel.updateState.collectAsState()

    var areNotificationsEnabled by remember { mutableStateOf(PermissionUtils.areNotificationsEnabled(context)) }
    var canScheduleExactAlarms by remember { mutableStateOf(PermissionUtils.canScheduleExactAlarms(context)) }
    var canDrawOverlays by remember { mutableStateOf(PermissionUtils.canDrawOverlays(context)) }
    var isIgnoringBatteryOptimizations by remember { mutableStateOf(PermissionUtils.isIgnoringBatteryOptimizations(context)) }

    val allPermissionsEnabled = areNotificationsEnabled && canScheduleExactAlarms && canDrawOverlays && isIgnoringBatteryOptimizations

    var showDonationSheet by remember { mutableStateOf(false) }
    val donationSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val currentVersionName = remember {
        try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            pInfo.versionName
        } catch (e: PackageManager.NameNotFoundException) {
            "Unknown"
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                areNotificationsEnabled = PermissionUtils.areNotificationsEnabled(context)
                canScheduleExactAlarms = PermissionUtils.canScheduleExactAlarms(context)
                canDrawOverlays = PermissionUtils.canDrawOverlays(context)
                isIgnoringBatteryOptimizations = PermissionUtils.isIgnoringBatteryOptimizations(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(showSaveSuccess) {
        if (showSaveSuccess) {
            delay(3000)
            showSaveSuccess = false
        }
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
                        .padding(horizontal = 16.dp)
                        .verticalScroll(scrollState),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = stringResource(R.string.settings).uppercase(),
                            style = MaterialTheme.typography.headlineMedium.copy(
                                letterSpacing = 2.sp,
                                shadow = Shadow(
                                    color = ElysiumGold.copy(alpha = 0.5f),
                                    blurRadius = 15f
                                )
                            ),
                            fontWeight = FontWeight.Black,
                            color = MaterialTheme.colorScheme.primary,
                            textAlign = TextAlign.Center
                        )
                        Text(
                            text = Constants.SUBTITLE_SETTINGS.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                            letterSpacing = 3.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                    
                    Spacer(modifier = Modifier.height(24.dp))

                    AnimatedVisibility(
                        visible = !allPermissionsEnabled,
                        enter = expandVertically() + fadeIn(),
                        exit = shrinkVertically() + fadeOut()
                    ) {
                        SettingsCard(
                            title = stringResource(R.string.system_health),
                            icon = Icons.Default.HealthAndSafety
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (!areNotificationsEnabled) {
                                    PermissionStatusItem(
                                        title = "Push Notifications",
                                        statusText = "Denied (Tap to fix)",
                                        isActive = false,
                                        icon = Icons.Default.NotificationsOff,
                                        onClick = { PermissionUtils.openNotificationSettings(context) }
                                    )
                                }
                                if (!canScheduleExactAlarms) {
                                    PermissionStatusItem(
                                        title = "Exact Alarms",
                                        statusText = "Delayed (Tap to fix)",
                                        isActive = false,
                                        icon = Icons.Default.TimerOff,
                                        onClick = { PermissionUtils.openAlarmSettings(context) }
                                    )
                                }
                                if (!canDrawOverlays) {
                                    PermissionStatusItem(
                                        title = "Overlay Bubble",
                                        statusText = "Required (Tap to fix)",
                                        isActive = false,
                                        icon = Icons.Default.LayersClear,
                                        onClick = { PermissionUtils.openOverlaySettings(context) }
                                    )
                                }
                                if (!isIgnoringBatteryOptimizations) {
                                    PermissionStatusItem(
                                        title = "Battery Optimization",
                                        statusText = "Restricted (Tap to fix)",
                                        isActive = false,
                                        icon = Icons.Default.BatteryAlert,
                                        onClick = { PermissionUtils.requestIgnoreBatteryOptimizations(context) }
                                    )
                                }
                            }
                        }
                    }

                    SettingsCard(
                        title = stringResource(R.string.app_update),
                        icon = Icons.Default.SystemUpdate
                    ) {
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Software Update",
                                        style = MaterialTheme.typography.bodyLarge,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = when (updateState) {
                                            UpdateState.Checking -> "Checking for updates..."
                                            UpdateState.Downloading -> "Downloading update..."
                                            else -> "Keep your app up to date"
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                
                                Surface(
                                    onClick = { 
                                        HapticUtils.performHapticFeedback(context, duration = 10)
                                        viewModel.checkForUpdates() 
                                    },
                                    enabled = updateState !is UpdateState.Checking && updateState !is UpdateState.Downloading,
                                    shape = RoundedCornerShape(12.dp),
                                    color = MaterialTheme.colorScheme.primary.copy(alpha = if (isDark) 0.2f else 0.1f),
                                    border = BorderStroke(
                                        width = 1.dp,
                                        brush = Brush.linearGradient(
                                            colors = listOf(
                                                MaterialTheme.colorScheme.primary.copy(alpha = 0.8f),
                                                MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                                            )
                                        )
                                    )
                                ) {
                                    Box(
                                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        if (updateState is UpdateState.Checking) {
                                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                                        } else {
                                            Text(
                                                text = "Check",
                                                style = MaterialTheme.typography.labelLarge,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                    }
                                }
                            }

                            if (updateState is UpdateState.Downloading) {
                                Spacer(modifier = Modifier.height(12.dp))
                                LinearProgressIndicator(
                                    modifier = Modifier.fillMaxWidth().height(4.dp).clip(CircleShape),
                                    color = MaterialTheme.colorScheme.primary,
                                    trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
                                )
                            }
                            
                            Spacer(modifier = Modifier.height(12.dp))
                            
                            Text(
                                text = "Current Version: $currentVersionName",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                fontSize = 10.sp,
                                modifier = Modifier.align(Alignment.End)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    SettingsCard(
                        title = stringResource(R.string.alert_interaction),
                        icon = Icons.Default.Notifications
                    ) {
                        Column {
                            NotificationToggle(
                                title = stringResource(R.string.boss_spawn_alerts),
                                description = "Precise 10m warning for world bosses",
                                checked = pendingBossNotif,
                                onCheckedChange = { 
                                    pendingBossNotif = it 
                                    HapticUtils.performHapticFeedback(context, duration = 10)
                                },
                                icon = Icons.Default.Timer,
                                iconGradient = listOf(Color(0xFF10B981), Color(0xFF059669)),
                                isModified = pendingBossNotif != savedBossNotif
                            )
                            
                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))
                            
                            NotificationToggle(
                                title = stringResource(R.string.event_reminders),
                                description = "Precise 10m warning for guild activities",
                                checked = pendingEventNotif,
                                onCheckedChange = { 
                                    pendingEventNotif = it 
                                    HapticUtils.performHapticFeedback(context, duration = 10)
                                },
                                icon = Icons.Default.Event,
                                iconGradient = listOf(Color(0xFF6366F1), Color(0xFF4F46E5)),
                                isModified = pendingEventNotif != savedEventNotif
                            )

                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))

                            NotificationToggle(
                                title = "Floating Boss Timer",
                                description = "Show a floating bubble over other apps",
                                checked = pendingBubbleEnabled,
                                onCheckedChange = { 
                                    HapticUtils.performHapticFeedback(context, duration = 10)
                                    if (it && !PermissionUtils.canDrawOverlays(context)) {
                                        pendingBubbleEnabled = false
                                        PermissionUtils.openOverlaySettings(context)
                                    } else {
                                        pendingBubbleEnabled = it
                                    }
                                },
                                icon = Icons.Default.AdsClick,
                                iconGradient = listOf(Color(0xFFF59E0B), Color(0xFFD97706)),
                                isModified = pendingBubbleEnabled != savedBubbleEnabled
                            )

                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))

                            NotificationToggle(
                                title = stringResource(R.string.notification_vibration),
                                description = "Silent alerts with haptic feedback",
                                checked = pendingVibrateOnly,
                                onCheckedChange = { 
                                    pendingVibrateOnly = it 
                                    HapticUtils.performHapticFeedback(context, duration = 10)
                                },
                                icon = Icons.Default.NotificationsPaused,
                                iconGradient = listOf(Color(0xFF94A3B8), Color(0xFF64748B)),
                                isModified = pendingVibrateOnly != vibrateOnly
                            )

                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))

                            NotificationToggle(
                                title = "Haptic Feedback",
                                description = "Vibrate on status changes and refreshes",
                                checked = pendingHapticEnabled,
                                onCheckedChange = { 
                                    pendingHapticEnabled = it 
                                    HapticUtils.performHapticFeedback(context, duration = 10)
                                },
                                icon = Icons.Default.Vibration,
                                iconGradient = listOf(Color(0xFFEC4899), Color(0xFFDB2777)),
                                isModified = pendingHapticEnabled != hapticEnabled
                            )

                            if (!pendingVibrateOnly) {
                                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))

                                SoundSelectionItem(
                                    selectedSound = pendingSound,
                                    onSoundSelected = { 
                                        pendingSound = it
                                        playSoundPreview(context, it)
                                        HapticUtils.performHapticFeedback(context, duration = 10)
                                    },
                                    isModified = pendingSound != savedSound
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    SettingsCard(
                        title = stringResource(R.string.appearance_time),
                        icon = Icons.Default.Palette
                    ) {
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                ThemePreviewCard(
                                    label = "Light",
                                    isSelected = pendingThemeMode == Constants.THEME_LIGHT,
                                    onClick = { 
                                        pendingThemeMode = Constants.THEME_LIGHT 
                                        HapticUtils.performHapticFeedback(context, duration = 10)
                                    },
                                    isDark = false,
                                    modifier = Modifier.weight(1f),
                                    isModified = pendingThemeMode == Constants.THEME_LIGHT && themeMode != Constants.THEME_LIGHT
                                )
                                ThemePreviewCard(
                                    label = "Dark",
                                    isSelected = pendingThemeMode == Constants.THEME_DARK,
                                    onClick = { 
                                        pendingThemeMode = Constants.THEME_DARK 
                                        HapticUtils.performHapticFeedback(context, duration = 10)
                                    },
                                    isDark = true,
                                    modifier = Modifier.weight(1f),
                                    isModified = pendingThemeMode == Constants.THEME_DARK && themeMode != Constants.THEME_DARK
                                )
                                ThemePreviewCard(
                                    label = "System",
                                    isSelected = pendingThemeMode == Constants.THEME_SYSTEM,
                                    onClick = { 
                                        pendingThemeMode = Constants.THEME_SYSTEM 
                                        HapticUtils.performHapticFeedback(context, duration = 10)
                                    },
                                    isDark = isDark,
                                    isSystem = true,
                                    modifier = Modifier.weight(1f),
                                    isModified = pendingThemeMode == Constants.THEME_SYSTEM && themeMode != Constants.THEME_SYSTEM
                                )
                            }

                            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.outline.copy(alpha = 0.1f))

                            NotificationToggle(
                                title = "Use Local Timezone",
                                description = "Show times in your device's timezone",
                                checked = pendingLocalTimezone,
                                onCheckedChange = { 
                                    pendingLocalTimezone = it 
                                    HapticUtils.performHapticFeedback(context, duration = 10)
                                },
                                icon = Icons.Default.Language,
                                iconGradient = listOf(Color(0xFF06B6D4), Color(0xFF0891B2)),
                                isModified = pendingLocalTimezone != savedLocalTimezone
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    SettingsCard(
                        title = stringResource(R.string.help_onboarding),
                        icon = Icons.AutoMirrored.Filled.HelpCenter
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { 
                                    HapticUtils.performHapticFeedback(context, duration = 10)
                                    preferenceManager.resetFirstRun() 
                                }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.secondary.copy(alpha = 0.2f), MaterialTheme.colorScheme.secondary.copy(alpha = 0.1f)))),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(imageVector = Icons.Default.RestartAlt, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(18.dp))
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "Rerun Tutorial",
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "Revisit the initial setup and permissions guide",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    SettingsCard(
                        title = stringResource(R.string.guild_support),
                        icon = Icons.Default.Favorite
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { 
                                    HapticUtils.performHapticFeedback(context, duration = 10)
                                    showDonationSheet = true 
                                }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(CircleShape)
                                        .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary.copy(alpha = 0.2f), MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)))),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(imageVector = Icons.Default.VolunteerActivism, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        text = "Donate to Guild",
                                        style = MaterialTheme.typography.bodyLarge,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "Help us keep the servers running",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            Icon(
                                imageVector = Icons.Default.QrCode2,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(32.dp))
                    
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                    ) {
                        Text(
                            text = "Made with ❤️ for the Elysium Guild",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "⚔️ Where Chaos Becomes Strategy ⚔️",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.7f),
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(80.dp))
                }

                AnimatedVisibility(
                    visible = hasChanges,
                    enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                    exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 24.dp)
                ) {
                    ElysiumGlassCard(
                        modifier = Modifier
                            .padding(horizontal = 16.dp)
                            .fillMaxWidth()
                            .height(72.dp),
                        cornerRadius = 36.dp,
                        glowColor = MaterialTheme.colorScheme.primary
                    ) {
                        Row(
                            modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            TextButton(
                                onClick = {
                                    HapticUtils.performHapticFeedback(context, duration = 20)
                                    pendingThemeMode = themeMode
                                    pendingHapticEnabled = hapticEnabled
                                    pendingVibrateOnly = vibrateOnly
                                    pendingSound = savedSound
                                    pendingBossNotif = savedBossNotif
                                    pendingEventNotif = savedEventNotif
                                    pendingBubbleEnabled = savedBubbleEnabled
                                    pendingLocalTimezone = savedLocalTimezone
                                },
                                modifier = Modifier.weight(1f).fillMaxHeight(),
                                shape = CircleShape
                            ) {
                                Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(stringResource(R.string.discard_changes))
                            }

                            VerticalDivider(modifier = Modifier.padding(vertical = 20.dp), thickness = 1.dp, color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))

                            TextButton(
                                onClick = {
                                    HapticUtils.performHapticFeedback(context, duration = 30)
                                    preferenceManager.setThemeMode(pendingThemeMode)
                                    preferenceManager.setHapticFeedbackEnabled(pendingHapticEnabled)
                                    preferenceManager.setVibrateOnlyEnabled(pendingVibrateOnly)
                                    preferenceManager.setNotificationSound(pendingSound)
                                    preferenceManager.setBossNotificationsEnabled(pendingBossNotif)
                                    preferenceManager.setEventNotificationsEnabled(pendingEventNotif)
                                    preferenceManager.setFloatingBubbleEnabled(pendingBubbleEnabled)
                                    preferenceManager.setUseLocalTimezone(pendingLocalTimezone)
                                    showSaveSuccess = true
                                },
                                modifier = Modifier.weight(1f).fillMaxHeight(),
                                shape = CircleShape,
                                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.primary)
                            ) {
                                Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(stringResource(R.string.save_settings), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                AnimatedVisibility(
                    visible = showSaveSuccess,
                    enter = slideInVertically(initialOffsetY = { -it }) + fadeIn(),
                    exit = slideOutVertically(targetOffsetY = { -it }) + fadeOut(),
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 40.dp)
                ) {
                    ElysiumGlassCard(
                        modifier = Modifier.padding(horizontal = 32.dp).widthIn(max = 300.dp),
                        statusColor = Constants.COLOR_SUCCESS,
                        cornerRadius = 20.dp
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Constants.COLOR_SUCCESS, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(12.dp))
                            Text(text = stringResource(R.string.configuration_saved), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }

                if (showDonationSheet) {
                    ModalBottomSheet(
                        onDismissRequest = { showDonationSheet = false },
                        sheetState = donationSheetState,
                        containerColor = Color.Transparent,
                        dragHandle = null
                    ) {
                        ElysiumGlassCard(
                            modifier = Modifier.fillMaxWidth().padding(16.dp).padding(bottom = 32.dp),
                            cornerRadius = 28.dp
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth().padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Box(modifier = Modifier.size(40.dp, 4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f)))
                                Spacer(modifier = Modifier.height(24.dp))
                                Text(text = Constants.DONATION_TITLE, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(text = Constants.DONATION_DESC, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(modifier = Modifier.height(24.dp))
                                Surface(
                                    modifier = Modifier.size(240.dp).shadow(8.dp, RoundedCornerShape(24.dp)),
                                    shape = RoundedCornerShape(24.dp),
                                    color = Color.White
                                ) {
                                    val qrResId = context.resources.getIdentifier(Constants.RES_QR_DONATION, "drawable", context.packageName)
                                    if (qrResId != 0) {
                                        Image(painter = painterResource(id = qrResId), contentDescription = "QR Code", modifier = Modifier.fillMaxSize().padding(16.dp), contentScale = ContentScale.Fit)
                                    }
                                }
                                Spacer(modifier = Modifier.height(24.dp))
                                Button(onClick = { 
                                    HapticUtils.performHapticFeedback(context, duration = 10)
                                    showDonationSheet = false 
                                }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                    Text("Done", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private var mediaPlayer: MediaPlayer? = null

private fun playSoundPreview(context: Context, soundName: String) {
    try {
        mediaPlayer?.stop()
        mediaPlayer?.release()
        val resId = context.resources.getIdentifier(soundName, "raw", context.packageName)
        if (resId != 0) {
            mediaPlayer = MediaPlayer.create(context, resId)
            mediaPlayer?.start()
        }
    } catch (e: Exception) {
        e.printStackTrace()
    }
}
