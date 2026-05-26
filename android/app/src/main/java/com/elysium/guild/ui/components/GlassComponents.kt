package com.elysium.guild.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.elysium.guild.ui.theme.ElysiumGold
import kotlin.math.*

/**
 * Helper to determine if the current theme is Dark based on ColorScheme luminance
 */
@Composable
fun isAppInDarkTheme(): Boolean = MaterialTheme.colorScheme.surface.luminance() < 0.5f

@Composable
fun ElysiumGlassCard(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 24.dp,
    statusColor: Color = Color.Transparent,
    glowColor: Color = Color.Transparent,
    showLegendaryEffect: Boolean = false,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val isDark = isAppInDarkTheme()
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.96f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
        label = "ScaleAnimation"
    )

    val infiniteTransition = rememberInfiniteTransition(label = "GlowPulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.7f,
        animationSpec = infiniteRepeatable(animation = tween(1500, easing = LinearOutSlowInEasing), repeatMode = RepeatMode.Reverse),
        label = "PulseAlpha"
    )

    val animatedGlowColor by animateColorAsState(
        targetValue = glowColor,
        animationSpec = tween(durationMillis = 500),
        label = "GlowColorAnimation"
    )

    // FIX: Reactive background for Light Mode Turn Turn that changes with statusColor
    val cardBgColor = if (isDark) {
        if (showLegendaryEffect) Color(0xFF0A0C14).copy(alpha = 0.95f)
        else MaterialTheme.colorScheme.surface.copy(alpha = 0.6f)
    } else {
        if (showLegendaryEffect) {
            // Create a background that is tinted by the status (Ready/Soon/Tracking)
            // Starts with a warm base and adds a 15% overlay of the status color
            val baseColor = Color(0xFFFFF8E1) 
            statusColor.copy(alpha = 0.12f).compositeOver(baseColor)
        } else {
            MaterialTheme.colorScheme.surface.copy(alpha = 0.9f)
        }
    }

    val contentColorOverride = if (showLegendaryEffect) {
        if (isDark) Color.White else Color(0xFF211A00) // High contrast text
    } else {
        Color.Unspecified
    }

    // Border now strictly follows statusColor for consistency
    val borderBrush = if (showLegendaryEffect) {
        val baseColor = if (statusColor != Color.Transparent) statusColor else (if (isDark) ElysiumGold else Color(0xFFFFA000))
        Brush.linearGradient(
            listOf(baseColor, baseColor.copy(alpha = 0.4f), baseColor)
        )
    } else {
        Brush.linearGradient(
            colors = if (animatedGlowColor != Color.Transparent) {
                listOf(
                    animatedGlowColor.copy(alpha = pulseAlpha),
                    animatedGlowColor.copy(alpha = 0.1f),
                    animatedGlowColor.copy(alpha = pulseAlpha)
                )
            } else {
                listOf(
                    MaterialTheme.colorScheme.onSurface.copy(alpha = if (isDark) 0.2f else 0.3f),
                    MaterialTheme.colorScheme.onSurface.copy(alpha = if (isDark) 0.05f else 0.1f)
                )
            }
        )
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .graphicsLayer { 
                scaleX = scale
                scaleY = scale
            }
            .legendaryOrbEffect(enabled = showLegendaryEffect, glowColor = if (statusColor != Color.Transparent) statusColor else animatedGlowColor, radius = cornerRadius)
            .then(
                if (onClick != null) {
                    Modifier.clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
                } else Modifier
            )
            .border(
                width = if (showLegendaryEffect) 1.2.dp else 1.dp,
                brush = borderBrush,
                shape = RoundedCornerShape(cornerRadius)
            ),
        shape = RoundedCornerShape(cornerRadius),
        color = cardBgColor,
        contentColor = contentColorOverride,
        tonalElevation = if (showLegendaryEffect) (if (isDark) 0.dp else 4.dp) else if (isDark) 8.dp else 2.dp,
        shadowElevation = if (showLegendaryEffect) (if (isDark) 0.dp else 12.dp) else if (isDark) 0.dp else 8.dp
    ) {
        CompositionLocalProvider(
            LocalContentColor provides if (contentColorOverride != Color.Unspecified) contentColorOverride else LocalContentColor.current
        ) {
            Box(modifier = Modifier.fillMaxWidth()) {
                if (statusColor != Color.Transparent && !showLegendaryEffect) {
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .background(
                                brush = Brush.horizontalGradient(
                                    colors = listOf(
                                        statusColor.copy(alpha = if (isDark) 0.15f else 0.12f),
                                        Color.Transparent
                                    )
                                )
                            )
                    )
                }

                if (animatedGlowColor != Color.Transparent) {
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .background(
                                brush = Brush.radialGradient(
                                    colors = listOf(
                                        animatedGlowColor.copy(alpha = if (isDark) 0.1f * pulseAlpha else 0.1f),
                                        Color.Transparent
                                    ),
                                    radius = 2500f
                                )
                            )
                    )
                }

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    content = content
                )
            }
        }
    }
}

private fun Modifier.legendaryOrbEffect(enabled: Boolean, glowColor: Color, radius: Dp) = if (!enabled) this else composed {
    val progress by rememberInfiniteTransition(label = "OrbRotation").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(10000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "OrbProgress"
    )

    val isDark = isAppInDarkTheme()

    this.drawWithContent {
        drawContent()
        val progress1 = progress
        val progress2 = (progress + 0.5f).let { if (it > 1f) it - 1f else it }
        drawPremiumLightPath(progress = progress1, glowColor = glowColor, cornerRadius = radius.toPx(), isDark = isDark)
        drawPremiumLightPath(progress = progress2, glowColor = glowColor, cornerRadius = radius.toPx(), isDark = isDark)
    }
}

private fun DrawScope.drawPremiumLightPath(progress: Float, glowColor: Color, cornerRadius: Float, isDark: Boolean) {
    val width = size.width
    val height = size.height
    if (width == 0f || height == 0f) return

    val r = cornerRadius.coerceAtMost(width / 2).coerceAtMost(height / 2)
    val sw = width - 2 * r
    val sh = height - 2 * r
    val arc = (PI.toFloat() * r) / 2f
    val perimeter = 2 * sw + 2 * sh + 4 * arc

    fun getPointOnPath(dist: Float): Offset {
        val p = dist.rem(perimeter).let { if (it < 0) it + perimeter else it }
        return when {
            p < sw -> Offset(r + p, 0f)
            p < sw + arc -> {
                val a = -PI / 2 + (p - sw) / arc * (PI / 2f)
                Offset((width - r + r * cos(a.toDouble())).toFloat(), (r + r * sin(a.toDouble())).toFloat())
            }
            p < sw + arc + sh -> Offset(width, r + (p - (sw + arc)))
            p < sw + 2 * arc + sh -> {
                val a = 0.0 + (p - (sw + arc + sh)) / arc * (PI / 2f)
                Offset((width - r + r * cos(a.toDouble())).toFloat(), (height - r + r * sin(a.toDouble())).toFloat())
            }
            p < 2 * sw + 2 * arc + sh -> Offset(width - r - (p - (sw + 2 * arc + sh)), height)
            p < 2 * sw + 3 * arc + sh -> {
                val a = PI / 2 + (p - (2 * sw + 2 * arc + sh)) / arc * (PI / 2f)
                Offset((r + r * cos(a.toDouble())).toFloat(), (height - r + r * sin(a.toDouble())).toFloat())
            }
            p < 2 * sw + 3 * arc + 2 * sh -> Offset(0f, height - r - (p - (2 * sw + 3 * arc + sh)))
            else -> {
                val a = PI + (p - (2 * sw + 3 * arc + 2 * sh)) / arc * (PI / 2f)
                Offset((r + r * cos(a.toDouble())).toFloat(), (r + r * sin(a.toDouble())).toFloat())
            }
        }
    }

    val centerPos = progress * perimeter
    val tailLength = perimeter * 0.45f
    val segments = 120 
    val maxStrokeWidth = 3.dp.toPx() 
    val blendMode = if (isDark) BlendMode.Screen else BlendMode.Plus

    for (i in 0 until segments) {
        val normalizedI = i.toFloat() / segments
        val shapeRatio = sin(normalizedI * PI.toFloat())
        val pos = centerPos + (normalizedI - 0.5f) * tailLength
        val p1 = getPointOnPath(pos)
        val p2 = getPointOnPath(pos + (tailLength / segments))
        val highlightIntensity = exp(-((normalizedI - 0.5f).pow(2)) / (2 * 0.12f.pow(2)))

        drawLine(
            color = glowColor.copy(alpha = shapeRatio.pow(3f) * 0.15f),
            start = p1,
            end = p2,
            strokeWidth = (maxStrokeWidth * 5f) * shapeRatio,
            cap = StrokeCap.Round,
            blendMode = blendMode
        )

        val segmentColor = Color(
            red = min(1f, glowColor.red + (1f - glowColor.red) * highlightIntensity * 0.4f),
            green = min(1f, glowColor.green + (1f - glowColor.green) * highlightIntensity * 0.4f),
            blue = min(1f, glowColor.blue + (1f - glowColor.blue) * highlightIntensity * 0.4f),
            alpha = shapeRatio * (0.6f + 0.3f * highlightIntensity)
        )

        drawLine(
            color = segmentColor,
            start = p1,
            end = p2,
            strokeWidth = maxStrokeWidth * shapeRatio,
            cap = StrokeCap.Round,
            blendMode = blendMode
        )
    }
}

@Composable
fun ElysiumGlassSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onClear: () -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier
) {
    ElysiumGlassCard(
        modifier = modifier.height(56.dp),
        cornerRadius = 16.dp
    ) {
        Row(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                modifier = Modifier.size(20.dp)
            )
            
            Spacer(modifier = Modifier.width(12.dp))
            
            Box(modifier = Modifier.weight(1f)) {
                if (query.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                        fontSize = 14.sp
                    )
                }
                
                BasicTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    textStyle = TextStyle(
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 14.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Medium
                    ),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    cursorBrush = Brush.verticalGradient(
                        listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primary)
                    )
                )
            }
            
            AnimatedVisibility(
                visible = query.isNotEmpty(),
                enter = fadeIn() + scaleIn(spring(Spring.DampingRatioMediumBouncy)),
                exit = fadeOut() + scaleOut()
            ) {
                IconButton(onClick = onClear, modifier = Modifier.size(24.dp)) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Clear",
                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}
