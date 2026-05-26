package com.elysium.guild

import android.Manifest
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.elysium.guild.ui.navigation.ElysiumNavigation
import com.elysium.guild.ui.theme.ElysiumGuildTheme
import com.elysium.guild.utils.BossNotificationWorker
import com.elysium.guild.utils.Constants
import com.elysium.guild.utils.PreferenceManager
import com.elysium.guild.viewmodel.BossTimersViewModel
import com.elysium.guild.viewmodel.EventsViewModel
import com.elysium.guild.viewmodel.LeaderboardViewModel
import com.elysium.guild.viewmodel.ProfileViewModel
import com.elysium.guild.viewmodel.UpdateState
import com.elysium.guild.widget.BossBubbleService
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var preferenceManager: PreferenceManager

    private val profileViewModel: ProfileViewModel by viewModels()
    private val bossTimersViewModel: BossTimersViewModel by viewModels()
    private val eventsViewModel: EventsViewModel by viewModels()
    private val leaderboardViewModel: LeaderboardViewModel by viewModels()

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            Toast.makeText(this, "Notifications enabled", Toast.LENGTH_SHORT).show()
            BossNotificationWorker.schedule(this)
        } else {
            Toast.makeText(this, "Notification permission denied", Toast.LENGTH_LONG).show()
        }
    }

    private val overlayPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        if (Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Overlay permission granted", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Overlay permission denied", Toast.LENGTH_LONG).show()
            lifecycleScope.launch {
                preferenceManager.setFloatingBubbleEnabled(false)
            }
        }
    }

    private val exactAlarmPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (alarmManager.canScheduleExactAlarms()) {
                Toast.makeText(this, "Exact alarms enabled", Toast.LENGTH_SHORT).show()
                BossNotificationWorker.schedule(this)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        
        askNotificationPermission()
        checkExactAlarmPermission()
        BossNotificationWorker.schedule(this)
        profileViewModel.checkForUpdates(silent = true)

        // Item 10: Data Pre-fetching
        lifecycleScope.launch {
            bossTimersViewModel.refreshTimers()
            eventsViewModel.refreshEvents(isInitial = true)
            leaderboardViewModel.refreshLeaderboard()
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                preferenceManager.floatingBubbleEnabled.collectLatest { enabled ->
                    if (enabled) {
                        if (Settings.canDrawOverlays(this@MainActivity)) {
                            startBubbleService()
                        } else {
                            requestOverlayPermission()
                        }
                    } else {
                        stopService(Intent(this@MainActivity, BossBubbleService::class.java))
                    }
                }
            }
        }

        setContent {
            val themeMode by preferenceManager.themeMode.collectAsState()
            val updateState by profileViewModel.updateState.collectAsState()
            
            ElysiumGuildTheme(themeMode = themeMode) {
                Box {
                    ElysiumNavigation(
                        preferenceManager = preferenceManager
                    )

                    if (updateState is UpdateState.UpdateAvailable) {
                        val state = updateState as UpdateState.UpdateAvailable
                        UpdateDialog(state)
                    }
                }
            }
        }
    }

    @Composable
    private fun UpdateDialog(state: UpdateState.UpdateAvailable) {
        AlertDialog(
            onDismissRequest = { profileViewModel.resetUpdateState() },
            title = { Text("Update Available") },
            text = {
                Column {
                    Text("A new version (${state.updateInfo.latestVersionName}) is available.")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(state.updateInfo.releaseNotes, style = MaterialTheme.typography.bodySmall)
                    
                    val canInstall = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        packageManager.canRequestPackageInstalls()
                    } else true

                    if (!canInstall) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            "Note: You need to allow 'Install from Unknown Sources' in settings for the update to run.",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            },
            confirmButton = {
                Button(onClick = { profileViewModel.downloadAndInstall(state.updateInfo) }) {
                    Text("Update Now")
                }
            },
            dismissButton = {
                TextButton(onClick = { profileViewModel.resetUpdateState() }) {
                    Text("Later")
                }
            }
        )
    }

    private fun startBubbleService() {
        try {
            val serviceIntent = Intent(this, BossBubbleService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to start bubble service", Toast.LENGTH_SHORT).show()
        }
    }

    private fun requestOverlayPermission() {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            overlayPermissionLauncher.launch(intent)
        } catch (e: Exception) {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
            overlayPermissionLauncher.launch(intent)
        }
    }

    private fun checkExactAlarmPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (!alarmManager.canScheduleExactAlarms()) {
                try {
                    val intent = Intent(
                        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:$packageName")
                    )
                    exactAlarmPermissionLauncher.launch(intent)
                } catch (e: Exception) {
                    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                    exactAlarmPermissionLauncher.launch(intent)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (Settings.canDrawOverlays(this)) {
            val intent = Intent(this, BossBubbleService::class.java).apply {
                action = BossBubbleService.ACTION_HIDE
            }
            try { startService(intent) } catch (e: Exception) {}
        }
    }

    override fun onPause() {
        super.onPause()
        // Only show bubble if the user has enabled it in settings
        if (Settings.canDrawOverlays(this) && preferenceManager.floatingBubbleEnabled.value) {
            val intent = Intent(this, BossBubbleService::class.java).apply {
                action = BossBubbleService.ACTION_SHOW
            }
            try { startService(intent) } catch (e: Exception) {}
        }
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}
