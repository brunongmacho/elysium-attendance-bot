package com.elysium.guild.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.elysium.guild.models.*
import com.elysium.guild.utils.Constants
import com.elysium.guild.utils.HapticUtils
import com.elysium.guild.viewmodel.PointsFilter
import kotlin.random.Random

@Composable
fun LeaderboardPodium(
    topThree: List<LeaderboardEntry>,
    leaderboardType: LeaderboardType,
    pointsFilter: PointsFilter = PointsFilter.EARNED,
    searchQuery: String = ""
) {
    var startAnimation by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        startAnimation = true
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        if (topThree.size >= 2) {
            PodiumItem(
                member = topThree[1],
                rank = 2,
                targetHeight = 180.dp,
                baseColor = Constants.COLOR_SILVER,
                leaderboardType = leaderboardType,
                pointsFilter = pointsFilter,
                modifier = Modifier.weight(1f),
                searchQuery = searchQuery,
                animate = startAnimation,
                delay = 200
            )
        } else {
            Spacer(modifier = Modifier.weight(1f))
        }

        if (topThree.isNotEmpty()) {
            PodiumItem(
                member = topThree[0],
                rank = 1,
                targetHeight = 210.dp,
                baseColor = Constants.COLOR_GOLD,
                leaderboardType = leaderboardType,
                pointsFilter = pointsFilter,
                modifier = Modifier.weight(1.1f),
                searchQuery = searchQuery,
                animate = startAnimation,
                delay = 0
            )
        }

        if (topThree.size >= 3) {
            PodiumItem(
                member = topThree[2],
                rank = 3,
                targetHeight = 160.dp,
                baseColor = Constants.COLOR_BRONZE,
                leaderboardType = leaderboardType,
                pointsFilter = pointsFilter,
                modifier = Modifier.weight(1f),
                searchQuery = searchQuery,
                animate = startAnimation,
                delay = 400
            )
        } else {
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun PodiumItem(
    member: LeaderboardEntry,
    rank: Int,
    targetHeight: Dp,
    baseColor: Color,
    leaderboardType: LeaderboardType,
    pointsFilter: PointsFilter,
    modifier: Modifier = Modifier,
    searchQuery: String = "",
    animate: Boolean = false,
    delay: Int = 0
) {
    val context = LocalContext.current
    val height by animateDpAsState(
        targetValue = if (animate) targetHeight else 0.dp,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow,
            visibilityThreshold = 1.dp
        ),
        label = "PodiumHeight"
    )

    Box(modifier = modifier.height(height)) {
        ElysiumGlassCard(
            modifier = Modifier.fillMaxSize(),
            statusColor = baseColor,
            glowColor = if (rank == 1) baseColor.copy(alpha = 0.5f) else Color.Transparent,
            onClick = { HapticUtils.performHapticFeedback(context, duration = 10) }
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                PodiumGlitterEffect(
                    color = baseColor,
                    modifier = Modifier.matchParentSize()
                )

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .padding(8.dp)
                        .fillMaxWidth(),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Surface(
                            shape = CircleShape,
                            color = baseColor.copy(alpha = 0.6f),
                            modifier = Modifier
                                .size(28.dp)
                                .border(1.dp, Color.White.copy(alpha = 0.4f), CircleShape)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = rank.toString(),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Black,
                                    color = Color.White
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        val annotatedName = if (searchQuery.isEmpty()) AnnotatedString(member.username) else highlightSearchText(member.username, searchQuery, MaterialTheme.colorScheme.primary)
                        Text(
                            text = annotatedName,
                            style = MaterialTheme.typography.labelLarge.copy(
                                shadow = Shadow(
                                    color = if (rank == 1) baseColor.copy(alpha = 0.5f) else Color.Transparent,
                                    blurRadius = if (rank == 1) 12f else 0f
                                )
                            ),
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center
                        )
                    }

                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        val (mainStatValue, mainStatLabel) = when (member) {
                            is AttendanceLeaderboardEntry -> "${member.attendanceRate}%" to "RATE"
                            is PointsLeaderboardEntry -> {
                                when (pointsFilter) {
                                    PointsFilter.EARNED -> member.pointsEarned.toString() to "EARNED"
                                    PointsFilter.SPENT -> member.pointsSpent.toString() to "SPENT"
                                    PointsFilter.AVAILABLE -> member.pointsAvailable.toString() to "AVAIL"
                                }
                            }
                            else -> "" to ""
                        }

                        Text(
                            text = mainStatValue,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Black,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontSize = 20.sp
                        )
                        Text(
                            text = mainStatLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                            fontSize = 9.sp
                        )
                    }

                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        when (member) {
                            is AttendanceLeaderboardEntry -> {
                                PodiumSecondaryStat("Kills", member.totalKills.toString())
                                PodiumSecondaryStat("Earned", member.pointsEarned.toString())
                            }
                            is PointsLeaderboardEntry -> {
                                when (pointsFilter) {
                                    PointsFilter.EARNED -> {
                                        PodiumSecondaryStat("Spent", member.pointsSpent.toString())
                                        PodiumSecondaryStat("Avail", member.pointsAvailable.toString())
                                    }
                                    PointsFilter.SPENT -> {
                                        PodiumSecondaryStat("Earned", member.pointsEarned.toString())
                                        PodiumSecondaryStat("Avail", member.pointsAvailable.toString())
                                    }
                                    PointsFilter.AVAILABLE -> {
                                        PodiumSecondaryStat("Earned", member.pointsEarned.toString())
                                        PodiumSecondaryStat("Spent", member.pointsSpent.toString())
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
fun PodiumGlitterEffect(color: Color, modifier: Modifier = Modifier.fillMaxSize()) {
    val infiniteTransition = rememberInfiniteTransition(label = "Glitter")
    val time by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "GlitterTime"
    )

    Canvas(modifier = modifier) {
        val count = 10
        repeat(count) { index ->
            val speedFactor = 0.15f + (index % 3) * 0.07f
            val particleTime = (time * speedFactor) + (index.toFloat() / count)
            val cycle = particleTime.toInt()
            val phase = particleTime % 1f
            val indRandom = Random(color.hashCode().toLong() + index + (cycle * 31L))
            val x = indRandom.nextFloat() * size.width
            val y = indRandom.nextFloat() * size.height
            val radius = (indRandom.nextFloat() * 1.0.dp.toPx()) + 0.5.dp.toPx()
            val alpha = (kotlin.math.sin(phase * Math.PI).toFloat()).coerceIn(0f, 1f)
            if (alpha > 0.01f) {
                drawCircle(
                    color = Color.White.copy(alpha = alpha * 0.3f * indRandom.nextFloat()),
                    center = Offset(x, y),
                    radius = radius
                )
            }
        }
    }
}

@Composable
private fun PodiumSecondaryStat(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            fontSize = 8.sp,
            maxLines = 1
        )
        Text(
            text = value,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 9.sp,
            maxLines = 1
        )
    }
}

@Composable
fun LeaderboardMemberCard(
    member: LeaderboardEntry,
    rank: Int,
    type: LeaderboardType,
    pointsFilter: PointsFilter = PointsFilter.EARNED,
    searchQuery: String = "",
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    ElysiumGlassCard(
        modifier = modifier,
        onClick = { HapticUtils.performHapticFeedback(context, duration = 10) }
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.width(36.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                Text(
                    text = rank.toString(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
            
            Column(modifier = Modifier.weight(1f)) {
                val annotatedName = if (searchQuery.isEmpty()) AnnotatedString(member.username) else highlightSearchText(member.username, searchQuery, MaterialTheme.colorScheme.primary)
                Text(
                    text = annotatedName,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        shadow = Shadow(
                            color = if (searchQuery.isNotEmpty()) MaterialTheme.colorScheme.primary.copy(alpha = 0.5f) else Color.Transparent,
                            blurRadius = if (searchQuery.isNotEmpty()) 8f else 0f
                        )
                    ),
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                
                val subText = when (member) {
                    is AttendanceLeaderboardEntry -> "Kills: ${member.totalKills} • Earned: ${member.pointsEarned}"
                    is PointsLeaderboardEntry -> {
                        when (pointsFilter) {
                            PointsFilter.EARNED -> "Spent: ${member.pointsSpent} • Available: ${member.pointsAvailable}"
                            PointsFilter.SPENT -> "Earned: ${member.pointsEarned} • Available: ${member.pointsAvailable}"
                            PointsFilter.AVAILABLE -> "Earned: ${member.pointsEarned} • Spent: ${member.pointsSpent}"
                        }
                    }
                    else -> ""
                }
                
                Text(
                    text = subText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }
            
            val mainValue = when (member) {
                is AttendanceLeaderboardEntry -> "${member.attendanceRate}%"
                is PointsLeaderboardEntry -> {
                    when (pointsFilter) {
                        PointsFilter.EARNED -> member.pointsEarned.toString()
                        PointsFilter.SPENT -> member.pointsSpent.toString()
                        PointsFilter.AVAILABLE -> member.pointsAvailable.toString()
                    }
                }
                else -> ""
            }

            Surface(
                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                shape = RoundedCornerShape(8.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.2f))
            ) {
                Text(
                    text = mainValue,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
    }
}
