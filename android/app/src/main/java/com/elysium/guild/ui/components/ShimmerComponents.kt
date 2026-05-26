package com.elysium.guild.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.elysium.guild.utils.Constants

@Composable
fun ShimmerEffect(
    content: @Composable (alpha: Float) -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "shimmer")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.1f,
        targetValue = 0.3f,
        animationSpec = infiniteRepeatable(
            animation = tween(Constants.SHIMMER_DURATION),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )
    content(alpha)
}

@Composable
fun BossShimmerList() {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(6) { BossTimerShimmerItem() }
    }
}

@Composable
fun EventShimmerList() {
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(5) { EventShimmerItem() }
    }
}

@Composable
fun LeaderboardShimmerList() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Podium Shimmer
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp)
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            Box(modifier = Modifier.weight(1f).fillMaxHeight(0.8f).shimmerBackground())
            Box(modifier = Modifier.weight(1.1f).fillMaxHeight().shimmerBackground())
            Box(modifier = Modifier.weight(1f).fillMaxHeight(0.7f).shimmerBackground())
        }
        
        // List Shimmer
        repeat(5) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(72.dp)
                    .shimmerBackground(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(modifier = Modifier.padding(16.dp).size(40.dp).clip(CircleShape).shimmerItem())
                Column(modifier = Modifier.weight(1f).padding(vertical = 16.dp)) {
                    Box(modifier = Modifier.size(120.dp, 16.dp).shimmerItem())
                    Spacer(modifier = Modifier.height(8.dp))
                    Box(modifier = Modifier.size(80.dp, 12.dp).shimmerItem())
                }
                Box(modifier = Modifier.padding(16.dp).size(60.dp, 32.dp).clip(RoundedCornerShape(8.dp)).shimmerItem())
            }
        }
    }
}

@Composable
fun EventShimmerItem() {
    ShimmerEffect { alpha ->
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.3f)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(48.dp).background(MaterialTheme.colorScheme.onSurface.copy(alpha = alpha), CircleShape))
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Box(modifier = Modifier.size(140.dp, 18.dp).background(MaterialTheme.colorScheme.onSurface.copy(alpha = alpha), RoundedCornerShape(4.dp)))
                        Spacer(modifier = Modifier.height(6.dp))
                        Box(modifier = Modifier.size(100.dp, 12.dp).background(MaterialTheme.colorScheme.onSurface.copy(alpha = alpha), RoundedCornerShape(4.dp)))
                    }
                }
                Box(modifier = Modifier.fillMaxWidth().height(40.dp).background(MaterialTheme.colorScheme.onSurface.copy(alpha = alpha), RoundedCornerShape(8.dp)))
            }
        }
    }
}

@Composable
fun Modifier.shimmerBackground(): Modifier = this.then(
    Modifier
        .clip(RoundedCornerShape(24.dp))
        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.3f))
)

@Composable
fun Modifier.shimmerItem(): Modifier = com.elysium.guild.ui.components.shimmerItemHelper(this)

@Composable
private fun shimmerItemHelper(modifier: Modifier): Modifier {
    val infiniteTransition = rememberInfiniteTransition(label = "shimmer")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.1f,
        targetValue = 0.2f,
        animationSpec = infiniteRepeatable(tween(Constants.SHIMMER_DURATION), RepeatMode.Reverse),
        label = "alpha"
    )
    return modifier.background(MaterialTheme.colorScheme.onSurface.copy(alpha = alpha), RoundedCornerShape(4.dp))
}
