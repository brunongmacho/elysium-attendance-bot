package com.elysium.guild.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

@Composable
fun BossTimerIcon(
    isSelected: Boolean,
    modifier: Modifier = Modifier.size(24.dp)
) {
    val color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
    
    Box(contentAlignment = Alignment.Center, modifier = modifier) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidth = 2.dp.toPx()
            val centerX = size.width / 2f
            val centerY = size.height / 2f
            
            // 1. Silhouette Wings (Background)
            val wingPath = Path().apply {
                moveTo(centerX, centerY - size.height * 0.1f)
                lineTo(centerX - size.width * 0.45f, centerY - size.height * 0.05f)
                lineTo(centerX - size.width * 0.35f, centerY + size.height * 0.25f)
                close()
                moveTo(centerX, centerY - size.height * 0.1f)
                lineTo(centerX + size.width * 0.45f, centerY - size.height * 0.05f)
                lineTo(centerX + size.width * 0.35f, centerY + size.height * 0.25f)
                close()
            }
            if (isSelected) {
                drawPath(path = wingPath, color = color.copy(alpha = 0.15f), style = Fill)
            }
            drawPath(path = wingPath, color = color, style = Stroke(width = strokeWidth, join = StrokeJoin.Round, cap = StrokeCap.Round))

            // 2. Horns
            val hornWidth = size.width * 0.1f
            val hornHeight = size.height * 0.18f
            val hornSpacing = size.width * 0.15f
            drawRect(color = color, topLeft = Offset(centerX - hornSpacing - hornWidth, centerY - size.height * 0.45f), size = Size(hornWidth, hornHeight), style = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round))
            drawRect(color = color, topLeft = Offset(centerX + hornSpacing, centerY - size.height * 0.45f), size = Size(hornWidth, hornHeight), style = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round))

            // 3. Shield Framework
            val crownPath = Path().apply {
                val crownY = centerY - size.height * 0.25f
                val crownWidthHalf = size.width * 0.32f
                val crownHeight = size.height * 0.08f
                moveTo(centerX - crownWidthHalf, crownY)
                lineTo(centerX + crownWidthHalf, crownY)
                lineTo(centerX + crownWidthHalf + 4.dp.toPx(), crownY + crownHeight)
                lineTo(centerX - crownWidthHalf - 4.dp.toPx(), crownY + crownHeight)
                close()
            }
            drawPath(path = crownPath, color = color, style = Stroke(width = strokeWidth, join = StrokeJoin.Round, cap = StrokeCap.Round))
            
            val framePath = Path().apply {
                moveTo(centerX - size.width * 0.25f, centerY - size.height * 0.1f)
                lineTo(centerX - size.width * 0.4f, centerY)
                lineTo(centerX - size.width * 0.25f, centerY + size.height * 0.1f)
                arcTo(Rect(center = Offset(centerX, centerY + size.height * 0.1f), radius = size.width * 0.25f), 150f, -120f, false)
                lineTo(centerX + size.width * 0.4f, centerY)
                lineTo(centerX + size.width * 0.25f, centerY - size.height * 0.1f)
            }
            drawPath(path = framePath, color = color, style = Stroke(width = strokeWidth, join = StrokeJoin.Round, cap = StrokeCap.Round))

            // 4. Central Skull
            val skullRadius = size.width * 0.18f
            val skullCenterY = centerY - size.height * 0.02f
            drawArc(color = color, startAngle = 180f, sweepAngle = 180f, useCenter = false, topLeft = Offset(centerX - skullRadius, skullCenterY - skullRadius), size = Size(skullRadius * 2, skullRadius * 2), style = Stroke(width = strokeWidth, cap = StrokeCap.Round))
            
            val eyeRadius = 1.8.dp.toPx()
            drawCircle(color = color, radius = eyeRadius, center = Offset(centerX - skullRadius * 0.45f, skullCenterY + skullRadius * 0.1f), style = Stroke(width = strokeWidth))
            drawCircle(color = color, radius = eyeRadius, center = Offset(centerX + skullRadius * 0.45f, skullCenterY + skullRadius * 0.1f), style = Stroke(width = strokeWidth))
            
            val jawWidth = skullRadius * 1.2f
            val jawHeight = 4.dp.toPx()
            val jawTop = skullCenterY + skullRadius * 0.7f
            drawRect(color = color, topLeft = Offset(centerX - jawWidth / 2, jawTop), size = Size(jawWidth, jawHeight), style = Stroke(width = strokeWidth, join = StrokeJoin.Round, cap = StrokeCap.Round))
            drawLine(color = color, start = Offset(centerX - jawWidth / 6, jawTop), end = Offset(centerX - jawWidth / 6, jawTop + jawHeight), strokeWidth = strokeWidth * 0.8f, cap = StrokeCap.Round)
            drawLine(color = color, start = Offset(centerX + jawWidth / 6, jawTop), end = Offset(centerX + jawWidth / 6, jawTop + jawHeight), strokeWidth = strokeWidth * 0.8f, cap = StrokeCap.Round)
        }
    }
}
