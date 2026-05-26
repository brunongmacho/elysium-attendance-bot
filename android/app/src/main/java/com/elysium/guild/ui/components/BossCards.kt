package com.elysium.guild.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import com.elysium.guild.models.*
import com.elysium.guild.ui.theme.*
import com.elysium.guild.utils.Constants
import com.elysium.guild.utils.UIUtils
import com.elysium.guild.utils.HapticUtils
import kotlinx.datetime.Instant

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun BossTimerCard(
    boss: BossTimer,
    currentTime: State<Instant>,
    modifier: Modifier = Modifier,
    useLocalTimezone: Boolean = false,
    searchQuery: String = "",
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    onAlertOverrideToggle: (BossTimer) -> Unit = {}
) {
    val context = LocalContext.current
    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    
    val isElysiumTurn = boss.rotation?.isOurTurn == true
    val isReady = boss.isReady()
    val isSoon = boss.isSoon()

    val baseStatusColor = remember(boss.status, boss.timeRemaining, isElysiumTurn, isDark) {
        when {
            isReady -> if (isDark) StatusReadyGlow else Color(0xFF00796B)
            isElysiumTurn && isSoon -> if (isDark) ElysiumAmethyst else ElysiumAmethystDark
            isElysiumTurn -> if (isDark) ElysiumGold else Color(0xFF8D6E63)
            isSoon -> if (isDark) Color(0xFFFFD600) else Color(0xFFF57C00)
            else -> if (isDark) Color(0xFF90A4AE) else Color(0xFF546E7A)
        }
    }
    
    val animatedColor by animateColorAsState(
        targetValue = baseStatusColor,
        animationSpec = tween(durationMillis = Constants.COLOR_TRANSITION_DURATION, easing = LinearOutSlowInEasing),
        label = "CardColorAnimation"
    )

    val infiniteTransition = rememberInfiniteTransition(label = "ElysiumGlow")
    val borderAlpha by infiniteTransition.animateFloat(
        initialValue = Constants.BORDER_ALPHA_MIN,
        targetValue = Constants.BORDER_ALPHA_MAX,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = LinearOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "BorderAlpha"
    )

    ElysiumGlassCard(
        modifier = modifier.padding(vertical = Constants.CARD_PADDING_VERTICAL.dp),
        statusColor = animatedColor,
        glowColor = if (isElysiumTurn || isReady) animatedColor.copy(alpha = Constants.GLOW_ALPHA) else Color.Transparent,
        showLegendaryEffect = isElysiumTurn,
        onClick = { 
            HapticUtils.performHapticFeedback(context, duration = 10)
        }
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .pointerInput(Unit) {
                    detectTapGestures(
                        onLongPress = { 
                            HapticUtils.performHapticFeedback(context, duration = 30)
                            shareBossStatus(context, boss, currentTime.value) 
                        }
                    )
                }
        ) {
            Column {
                Row(
                    modifier = Modifier.padding(Constants.CARD_PADDING_HORIZONTAL.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    with(sharedTransitionScope) {
                        BossAvatar(
                            boss = boss,
                            statusColor = animatedColor,
                            isUrgent = isReady || (isElysiumTurn && isSoon),
                            modifier = Modifier.sharedElement(
                                rememberSharedContentState(key = "boss-image-${boss.bossName}-${boss.type}"),
                                animatedVisibilityScope = animatedVisibilityScope
                            )
                        )
                    }

                    Spacer(modifier = Modifier.width(16.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = highlightSearchText(boss.bossName, searchQuery, MaterialTheme.colorScheme.primary),
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        shadow = Shadow(
                                            color = if (isDark) Color.Black.copy(alpha = 0.6f) else Color.Transparent,
                                            blurRadius = 8f
                                        )
                                    ),
                                    fontWeight = FontWeight.Black,
                                    color = if (isReady) animatedColor else MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1
                                )
                                
                                val typeLabel = when(boss.type.lowercase()) {
                                    "timer" -> "TIMED"
                                    "schedule" -> "SCHEDULED"
                                    else -> boss.type.uppercase()
                                }
                                
                                Text(
                                    text = "${boss.bossPoints} BP • $typeLabel",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isElysiumTurn && isDark) animatedColor else if (isElysiumTurn) Color(0xFF5D4037) else MaterialTheme.colorScheme.primary.copy(alpha = 0.7f),
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.sp
                                )
                            }
                            
                            StatusBadge(boss = boss, currentTime = currentTime, statusColor = animatedColor)
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        boss.rotation?.let {
                            RotationStatus(it, animatedColor)
                        }

                        Column {
                            SpawnTimeText(boss, useLocalTimezone)
                            Spacer(modifier = Modifier.height(4.dp))
                            AlertOverrideRow(boss = boss, onToggle = onAlertOverrideToggle)
                        }
                    }
                }
                
                DynamicProgressBar(boss, animatedColor)
            }
        }
    }
}

@Composable
private fun AlertOverrideRow(boss: BossTimer, onToggle: (BossTimer) -> Unit) {
    val context = LocalContext.current
    val (icon, label, color) = when (boss.alertOverride) {
        AlertOverride.DEFAULT -> Triple(Icons.Default.NotificationsNone, "System Default", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
        AlertOverride.SOUND -> Triple(Icons.Default.NotificationsActive, "Force Sound", MaterialTheme.colorScheme.primary)
        AlertOverride.VIBRATE -> Triple(Icons.Default.Vibration, "Force Vibrate", MaterialTheme.colorScheme.secondary)
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .clickable {
                HapticUtils.performHapticFeedback(context, duration = 15)
                onToggle(boss)
                // Determine the next label for the Toast so it matches the new state
                val nextLabel = when (boss.alertOverride) {
                    AlertOverride.DEFAULT -> "Force Sound"
                    AlertOverride.SOUND -> "Force Vibrate"
                    AlertOverride.VIBRATE -> "System Default"
                }
                Toast.makeText(context, "Alert: $nextLabel", Toast.LENGTH_SHORT).show()
            }
            .padding(vertical = 2.dp, horizontal = 4.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = color,
            modifier = Modifier.size(14.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Black,
            letterSpacing = 0.5.sp
        )
    }
}

@Composable
fun highlightSearchText(text: String, query: String, highlightColor: Color): AnnotatedString {
    if (query.isEmpty()) return AnnotatedString(text)
    val queries = query.split(" ").filter { it.isNotEmpty() }
    return buildAnnotatedString {
        var lastAppendedIndex = 0
        val matches = mutableListOf<IntRange>()
        queries.forEach { q ->
            var start = 0
            while (true) {
                val index = text.indexOf(q, start, ignoreCase = true)
                if (index == -1) break
                matches.add(index until index + q.length)
                start = index + q.length
            }
        }
        val mergedMatches = matches.sortedBy { it.first }.fold(mutableListOf<IntRange>()) { acc, range ->
            if (acc.isEmpty()) acc.add(range)
            else {
                val last = acc.last()
                if (range.first <= last.last) acc[acc.size - 1] = last.first until maxOf(last.last, range.last)
                else acc.add(range)
            }
            acc
        }
        mergedMatches.forEach { range ->
            append(text.substring(lastAppendedIndex, range.first))
            withStyle(style = SpanStyle(color = highlightColor, fontWeight = FontWeight.Black, background = highlightColor.copy(alpha = 0.15f))) {
                append(text.substring(range.first, range.last))
            }
            lastAppendedIndex = range.last
        }
        append(text.substring(lastAppendedIndex))
    }
}

@Composable
private fun StatusBadge(
    boss: BossTimer,
    currentTime: State<Instant>,
    statusColor: Color
) {
    val isReady = boss.isReady()
    val isElysiumTurn = boss.rotation?.isOurTurn == true
    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f

    if (isReady) {
        val infiniteTransition = rememberInfiniteTransition(label = "Pulse")
        val badgeScale by infiniteTransition.animateFloat(
            initialValue = 1f, targetValue = Constants.SCALE_TARGET_URGENT,
            animationSpec = infiniteRepeatable(animation = tween(800, easing = FastOutSlowInEasing), repeatMode = RepeatMode.Reverse),
            label = "BadgeScale"
        )
        Surface(
            color = statusColor, shape = RoundedCornerShape(8.dp),
            modifier = Modifier.scale(badgeScale), shadowElevation = 4.dp
        ) {
            Text(
                text = "READY",
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Black,
                color = if (isDark) Color.Black else Color.White
            )
        }
    } else {
        val countdownText = remember(boss.nextSpawnTime, currentTime.value) {
            boss.nextSpawnTime?.let { calculateBossCountdown(it, currentTime.value) } ?: ""
        }
        if (countdownText.isNotEmpty() || isElysiumTurn) {
            Surface(
                color = statusColor.copy(alpha = 0.1f), shape = RoundedCornerShape(8.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, statusColor.copy(alpha = 0.5f))
            ) {
                Text(
                    text = if (isElysiumTurn && countdownText.isEmpty()) "GUILD TURN" else countdownText,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = statusColor
                )
            }
        }
    }
}

@Composable
private fun RotationStatus(rotation: RotationInfo, highlightColor: Color) {
    val isElysium = rotation.isOurTurn == true
    if (rotation.currentGuild == null) return
    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f

    Surface(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        shape = RoundedCornerShape(8.dp),
        color = if (isElysium) highlightColor.copy(alpha = if (isDark) 0.1f else 0.2f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f),
        border = if (isElysium) androidx.compose.foundation.BorderStroke(1.dp, highlightColor.copy(alpha = 0.4f)) else null
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (isElysium) Icons.Default.Shield else Icons.Default.Groups,
                contentDescription = null,
                tint = if (isElysium) highlightColor else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (isElysium) "Current: ${rotation.currentGuild} (GUILD TURN)" else "Current: ${rotation.currentGuild}",
                style = MaterialTheme.typography.labelSmall,
                color = if (isElysium) highlightColor else MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = if (isElysium) FontWeight.ExtraBold else FontWeight.Medium
            )
        }
    }
}

@Composable
private fun SpawnTimeText(boss: BossTimer, useLocalTimezone: Boolean) {
    boss.nextSpawnTime?.let { spawnTime ->
        val formattedTime = remember(spawnTime, useLocalTimezone) {
            UIUtils.formatEventTime(spawnTime, useLocalTimezone)
        }
        Text(
            text = "Expected: $formattedTime",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            modifier = Modifier.padding(top = 2.dp)
        )
    }
}

@Composable
private fun DynamicProgressBar(boss: BossTimer, animatedColor: Color) {
    val threshold = Constants.SPAWNING_SOON_THRESHOLD_MS
    val timeRemaining = boss.timeRemaining ?: return
    val isReady = boss.isReady()
    
    if (!isReady && timeRemaining <= threshold) {
        val progress = (1f - (timeRemaining.toFloat() / threshold.toFloat())).coerceIn(0f, 1f)
        val animatedProgress by animateFloatAsState(targetValue = progress, animationSpec = tween(1000), label = "Progress")

        val isNearingSpawn = progress > 0.9f
        val infiniteTransition = rememberInfiniteTransition(label = "ProgressBarPulse")
        val pulseAlpha by if (isNearingSpawn) {
            infiniteTransition.animateFloat(
                initialValue = 0.6f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(500, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "PulseAlpha"
            )
        } else {
            remember { mutableStateOf(1f) }
        }

        Box(
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .fillMaxWidth()
                .height(4.dp)
                .background(animatedColor.copy(alpha = 0.1f), CircleShape)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(animatedProgress)
                    .fillMaxHeight()
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                animatedColor.copy(alpha = 0.5f * pulseAlpha),
                                animatedColor.copy(alpha = pulseAlpha)
                            )
                        ),
                        CircleShape
                    )
            )
        }
    }
}

@Composable
fun BossAvatar(boss: BossTimer, statusColor: Color, modifier: Modifier = Modifier, size: Int = Constants.AVATAR_SIZE, isUrgent: Boolean = false) {
    val context = LocalContext.current
    val infiniteTransition = rememberInfiniteTransition(label = "Pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f, targetValue = Constants.SCALE_TARGET_URGENT,
        animationSpec = infiniteRepeatable(animation = tween(Constants.SCALE_ANIMATION_DURATION, easing = FastOutSlowInEasing), repeatMode = RepeatMode.Reverse),
        label = "PulseScale"
    )

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.size((size + 12).dp).then(if (isUrgent) Modifier.scale(pulseScale) else Modifier)
    ) {
        Box(
            modifier = Modifier.fillMaxSize().border(Constants.AVATAR_BORDER_WIDTH.dp, Brush.sweepGradient(listOf(statusColor.copy(0.2f), statusColor, statusColor.copy(0.2f))), CircleShape)
        )

        val imageSource = remember(boss.bossName, boss.imageUrl) {
            val resourceName = boss.bossName.lowercase().replace(Regex("[^a-z0-9]"), "_").replace(Regex("_+"), "_").trim('_')
            val resId = context.resources.getIdentifier(resourceName, "drawable", context.packageName)
            if (resId != 0) resId else boss.imageUrl
        }

        if (imageSource != null) {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(context).data(imageSource).crossfade(true).build(),
                contentDescription = null,
                modifier = Modifier.size(size.dp).clip(CircleShape),
                contentScale = ContentScale.Crop,
                error = { BossInitialAvatar(boss.bossName, statusColor, size) }
            )
        } else {
            BossInitialAvatar(boss.bossName, statusColor, size)
        }
    }
}

@Composable
fun BossInitialAvatar(name: String, backgroundColor: Color, size: Int) {
    Box(modifier = Modifier.size(size.dp).clip(CircleShape).background(backgroundColor.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
        Text(text = name.take(1).uppercase(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, color = backgroundColor)
    }
}

@Composable
fun BossTimerShimmerItem() {
    val infiniteTransition = rememberInfiniteTransition(label = "shimmer")
    val alpha by infiniteTransition.animateFloat(0.1f, 0.3f, infiniteRepeatable(tween(Constants.SHIMMER_DURATION), RepeatMode.Reverse), label = "alpha")
    Surface(
        modifier = Modifier.fillMaxWidth().padding(vertical = Constants.CARD_PADDING_VERTICAL.dp),
        shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.3f)
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(Constants.AVATAR_SIZE.dp).background(MaterialTheme.colorScheme.onSurface.copy(alpha = alpha), CircleShape))
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Box(modifier = Modifier.size(120.dp, 16.dp).background(MaterialTheme.colorScheme.onSurface.copy(alpha = alpha), RoundedCornerShape(4.dp)))
                Spacer(modifier = Modifier.height(8.dp))
                Box(modifier = Modifier.size(80.dp, 12.dp).background(MaterialTheme.colorScheme.onSurface.copy(alpha = alpha), RoundedCornerShape(4.dp)))
            }
        }
    }
}

private fun shareBossStatus(context: Context, boss: BossTimer, now: Instant) {
    val countdown = boss.nextSpawnTime?.let { calculateBossCountdown(it, now) } ?: ""
    val message = if (boss.isReady()) "⚔️ [ELYSIUM] ${boss.bossName.uppercase()} ACTIVE! ⚔️"
    else "⏳ [ELYSIUM] ${boss.bossName.uppercase()} in $countdown! ⏳"
    (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Boss", message))
    Toast.makeText(context, "Call to Arms copied!", Toast.LENGTH_SHORT).show()
}

private fun calculateBossCountdown(spawnTime: String, now: Instant): String {
    return try {
        val duration = Instant.parse(spawnTime) - now
        if (duration.isNegative()) "" else duration.toComponents { d, h, m, s, _ ->
            when { 
                d > 0 -> "${d}d ${h}h" 
                h > 0 -> "${h}h ${m}m" 
                else -> "${m}m ${s}s" 
            }
        }
    } catch (e: Exception) { "" }
}
