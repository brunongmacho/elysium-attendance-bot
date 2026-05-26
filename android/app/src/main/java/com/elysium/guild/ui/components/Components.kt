package com.elysium.guild.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airbnb.lottie.compose.*
import com.elysium.guild.models.*
import com.elysium.guild.ui.theme.*
import com.elysium.guild.utils.Constants
import com.elysium.guild.utils.UIUtils
import kotlinx.datetime.*
import java.util.Locale

// Tabular figures style for countdowns to prevent jitter
val TabularTextStyle = TextStyle(
    fontFeatureSettings = "tnum"
)

@Composable
fun EventCard(
    event: GuildEvent,
    currentTime: State<Instant>,
    useLocalTimezone: Boolean = false,
    modifier: Modifier = Modifier
) {
    val isDark = isSystemInDarkTheme()
    val now = currentTime.value
    val start = try { Instant.parse(event.startTime) } catch (e: Exception) { now }
    val end = event.endTime?.let { try { Instant.parse(it) } catch(e: Exception) { null } }
    
    // Live detection
    val isLive = end?.let { now >= start && now < it } ?: (now >= start && (now - start).inWholeMinutes < 60)
    
    val targetColor = remember(event.startTime, event.endTime, now, isDark) {
        UIUtils.getEventStatusColor(event.startTime, event.endTime, now, isDark)
    }

    val animatedColor by animateColorAsState(
        targetValue = targetColor,
        animationSpec = tween(durationMillis = 500),
        label = "EventColorAnimation"
    )

    val infiniteTransition = rememberInfiniteTransition(label = "LivePulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.03f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "Pulse"
    )

    ElysiumGlassCard(
        modifier = modifier.then(if (isLive) Modifier.scale(pulseScale) else Modifier),
        statusColor = animatedColor,
        glowColor = if (isLive) animatedColor else Color.Transparent,
        onClick = { /* Detail action */ }
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Icon with Timeline node feel
                    Box(contentAlignment = Alignment.Center) {
                        Surface(
                            modifier = Modifier.size(42.dp),
                            shape = CircleShape,
                            color = animatedColor.copy(alpha = if (isDark) 0.2f else 0.1f),
                            border = BorderStroke(1.dp, animatedColor.copy(alpha = 0.5f))
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = UIUtils.getEventIcon(event.type),
                                    style = MaterialTheme.typography.titleMedium
                                )
                            }
                        }
                        
                        if (isLive) {
                            Surface(
                                modifier = Modifier.size(48.dp),
                                shape = CircleShape,
                                color = Color.Transparent,
                                border = BorderStroke(1.dp, animatedColor.copy(alpha = 0.3f))
                            ) {}
                        }
                    }
                    
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = event.name,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            
                            if (isLive) {
                                Spacer(modifier = Modifier.width(8.dp))
                                LiveBadge(animatedColor)
                            }
                        }
                        
                        val formattedTime = remember(event.startTime, useLocalTimezone) {
                            UIUtils.formatEventTime(event.startTime, useLocalTimezone)
                        }
                        Text(
                            text = formattedTime,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                        )
                    }
                }
            }
            
            Text(
                text = event.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = MaterialTheme.typography.bodySmall.lineHeight
            )

            val countdown = remember(event.startTime, event.endTime, now) {
                UIUtils.calculateEventCountdown(event.startTime, event.endTime, now)
            }

            if (countdown.isNotEmpty()) {
                Surface(
                    color = animatedColor.copy(alpha = if (isDark) 0.2f else 0.1f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.align(Alignment.End),
                    border = BorderStroke(
                        width = 1.dp, 
                        color = animatedColor.copy(alpha = if (isDark) 0.3f else 0.4f)
                    )
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Icon(
                            imageVector = if (isLive) Icons.Default.Stream else Icons.Default.Schedule,
                            contentDescription = null,
                            tint = animatedColor,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = countdown,
                            style = MaterialTheme.typography.labelSmall.merge(TabularTextStyle),
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = animatedColor
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun LiveBadge(color: Color) {
    val infiniteTransition = rememberInfiniteTransition(label = "LiveBadge")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "Alpha"
    )

    Surface(
        color = color.copy(alpha = alpha),
        shape = RoundedCornerShape(4.dp)
    ) {
        Text(
            text = "LIVE",
            color = Color.White,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Black,
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
            fontSize = 8.sp
        )
    }
}

@Composable
fun ElysiumFilterChip(
    selected: Boolean,
    onClick: () -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    count: Int? = null,
    selectedColor: Color = if (isSystemInDarkTheme()) MaterialTheme.colorScheme.primary else Constants.COLOR_TRACKING_LIGHT
) {
    val isDark = isSystemInDarkTheme()
    
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) selectedColor.copy(alpha = if (isDark) 0.25f else 0.15f) 
                else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f),
        border = BorderStroke(
            width = 1.dp,
            brush = if (selected) {
                Brush.linearGradient(
                    colors = listOf(
                        selectedColor.copy(alpha = 0.8f),
                        selectedColor.copy(alpha = 0.2f)
                    )
                )
            } else {
                Brush.linearGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f),
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f)
                    )
                )
            }
        )
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontSize = 10.sp,
                fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.SemiBold,
                color = if (selected) selectedColor else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                maxLines = 1,
                overflow = TextOverflow.Clip,
                softWrap = false
            )
            if (count != null) {
                Spacer(modifier = Modifier.width(4.dp))
                Surface(
                    color = if (selected)
                        selectedColor.copy(alpha = 0.2f)
                    else
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = count.toString(),
                        style = MaterialTheme.typography.labelSmall.merge(TabularTextStyle),
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
                        fontWeight = FontWeight.Black,
                        fontSize = 9.sp,
                        color = if (selected) selectedColor else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        maxLines = 1,
                        softWrap = false
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FilterChips(
    selectedFilter: String,
    onFilterSelected: (String) -> Unit,
    filters: List<String>
) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        filters.forEach { filter ->
            ElysiumFilterChip(
                selected = selectedFilter == filter,
                onClick = { onFilterSelected(filter) },
                label = filter
            )
        }
    }
}

@Composable
fun LoadingIndicator() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        val composition by rememberLottieComposition(LottieCompositionSpec.RawRes(com.elysium.guild.R.raw.loading_orb))
        LottieAnimation(
            composition = composition,
            iterations = LottieConstants.IterateForever,
            modifier = Modifier.size(100.dp)
        )
    }
}

@Composable
fun ErrorMessage(
    message: String,
    onRetry: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        val composition by rememberLottieComposition(LottieCompositionSpec.RawRes(com.elysium.guild.R.raw.error_state))
        LottieAnimation(
            composition = composition,
            iterations = LottieConstants.IterateForever,
            modifier = Modifier.size(150.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 32.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = onRetry
        ) {
            Text("Retry")
        }
    }
}

@Composable
fun OfflineBanner() {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(Icons.Default.CloudOff, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Offline Mode - Showing Cached Data",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
        }
    }
}
