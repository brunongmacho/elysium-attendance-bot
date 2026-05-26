package com.elysium.guild.ui.components

import android.widget.Toast
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.elysium.guild.R
import com.elysium.guild.models.AlertOverride
import com.elysium.guild.models.EventStatus
import com.elysium.guild.models.GuildEvent
import com.elysium.guild.utils.Constants
import com.elysium.guild.utils.HapticUtils
import com.elysium.guild.utils.UIUtils
import kotlinx.datetime.Instant

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun ElysiumEventCard(
    event: GuildEvent,
    currentTime: State<Instant>,
    useLocalTimezone: Boolean = false,
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
    onAlertOverrideToggle: (GuildEvent) -> Unit = {}
) {
    val context = LocalContext.current
    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    val now = currentTime.value
    
    val status = event.getStatus(now)
    val isLive = status == EventStatus.ACTIVE
    
    val targetColor = remember(event.startTime, event.endTime, now, isDark) {
        UIUtils.getEventStatusColor(event.startTime, event.endTime, now, isDark)
    }

    val animatedColor by animateColorAsState(
        targetValue = if (status == EventStatus.COMPLETED) Color.Gray else targetColor,
        animationSpec = tween(durationMillis = Constants.COLOR_TRANSITION_DURATION),
        label = "EventColorAnimation"
    )

    val infiniteTransition = rememberInfiniteTransition(label = "LivePulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = Constants.SCALE_TARGET_URGENT,
        animationSpec = infiniteRepeatable(
            animation = tween(Constants.SCALE_ANIMATION_DURATION, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "Pulse"
    )

    ElysiumGlassCard(
        modifier = modifier
            .then(if (isLive) Modifier.scale(pulseScale) else Modifier)
            .alpha(if (status == EventStatus.COMPLETED) 0.6f else 1f),
        statusColor = animatedColor,
        glowColor = if (isLive) animatedColor.copy(alpha = Constants.GLOW_ALPHA) else Color.Transparent,
        onClick = { 
            HapticUtils.performHapticFeedback(context, duration = 10)
        }
    ) {
        Column(
            modifier = Modifier.padding(Constants.CARD_PADDING_HORIZONTAL.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Event Icon Wrapper
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(42.dp)
                ) {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        shape = CircleShape,
                        color = animatedColor.copy(alpha = if (isDark) 0.15f else 0.1f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, animatedColor.copy(alpha = 0.5f))
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = UIUtils.getEventIcon(event.type),
                                fontSize = 18.sp
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = event.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.ExtraBold,
                            color = if (status == EventStatus.COMPLETED) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f) else MaterialTheme.colorScheme.onSurface,
                            overflow = TextOverflow.Ellipsis,
                            maxLines = 1,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        EventStatusBadge(status, animatedColor)
                    }
                    
                    Text(
                        text = UIUtils.formatEventTime(event.startTime, useLocalTimezone),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            }

            Text(
                text = event.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = 16.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            // Progress Gauge for events
            if (isLive) {
                val start = try { Instant.parse(event.startTime) } catch (e: Exception) { now }
                val end = event.endTime?.let { try { Instant.parse(it) } catch(e: Exception) { null } }
                if (end != null) {
                    val total = (end - start).inWholeMilliseconds
                    val elapsed = (now - start).inWholeMilliseconds
                    if (total > 0) {
                        val progress = (elapsed.toFloat() / total.toFloat()).coerceIn(0f, 1f)
                        EventProgressBar(progress, animatedColor)
                    }
                }
            }

            // Bottom section with Alert Override label/icon on the left, Countdown on the right
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Label + Button on the lower left
                if (status != EventStatus.COMPLETED) {
                    EventAlertOverrideRow(event = event, onToggle = onAlertOverrideToggle)
                } else {
                    Spacer(modifier = Modifier.height(28.dp))
                }

                // Countdown on the lower right
                if (status != EventStatus.COMPLETED) {
                    val countdown = UIUtils.calculateEventCountdown(event.startTime, event.endTime, now)
                    if (countdown.isNotEmpty()) {
                        Surface(
                            color = animatedColor.copy(alpha = if (isDark) 0.1f else 0.05f),
                            shape = RoundedCornerShape(8.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, animatedColor.copy(alpha = 0.3f))
                        ) {
                            Text(
                                text = countdown,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = animatedColor,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                letterSpacing = 0.5.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EventAlertOverrideRow(event: GuildEvent, onToggle: (GuildEvent) -> Unit) {
    val context = LocalContext.current
    val (icon, label, color) = when (event.alertOverride) {
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
                onToggle(event)
                // Unified Predictive Toast logic
                val nextLabel = when (event.alertOverride) {
                    AlertOverride.DEFAULT -> "Force Sound"
                    AlertOverride.SOUND -> "Force Vibrate"
                    AlertOverride.VIBRATE -> "System Default"
                }
                Toast.makeText(context, "Alert: $nextLabel", Toast.LENGTH_SHORT).show()
            }
            .padding(vertical = 4.dp, horizontal = 4.dp)
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
fun EventStatusBadge(status: EventStatus, color: Color) {
    val infiniteTransition = rememberInfiniteTransition(label = "StatusBadgeAnim")
    val alpha by if (status == EventStatus.ACTIVE) {
        infiniteTransition.animateFloat(
            initialValue = 0.5f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse),
            label = "Alpha"
        )
    } else {
        remember { mutableStateOf(1f) }
    }

    if (status == EventStatus.UPCOMING) return

    val labelRes = when(status) {
        EventStatus.ACTIVE -> R.string.event_status_active
        EventStatus.SOON -> R.string.event_status_soon
        EventStatus.COMPLETED -> R.string.event_status_completed
        else -> null
    }

    if (labelRes != null) {
        Surface(
            color = color.copy(alpha = alpha),
            shape = RoundedCornerShape(4.dp)
        ) {
            Text(
                text = stringResource(labelRes),
                color = Color.White,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Black,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                fontSize = 8.sp
            )
        }
    }
}

@Composable
fun EventProgressBar(progress: Float, color: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(6.dp)
            .background(Color.Black.copy(alpha = 0.1f), CircleShape)
            .border(0.5.dp, color.copy(alpha = 0.2f), CircleShape)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(progress)
                .fillMaxHeight()
                .background(
                    Brush.horizontalGradient(listOf(color.copy(alpha = 0.5f), color)),
                    CircleShape
                )
        )
    }
}
