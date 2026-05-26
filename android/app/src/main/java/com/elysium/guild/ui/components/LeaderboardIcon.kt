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
fun LeaderboardIcon(
    isSelected: Boolean,
    modifier: Modifier = Modifier.size(24.dp)
) {
    val color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
    
    Box(contentAlignment = Alignment.Center, modifier = modifier) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidth = 2.dp.toPx()
            val centerX = size.width / 2f
            val centerY = size.height / 2f
            
            // Stylized Trophy/Podium form
            val trophyPath = Path().apply {
                // Cup
                val cupTop = centerY - size.height * 0.3f
                val cupBottom = centerY + size.height * 0.05f
                val cupWidth = size.width * 0.4f
                
                moveTo(centerX - cupWidth / 2, cupTop)
                lineTo(centerX + cupWidth / 2, cupTop)
                lineTo(centerX + cupWidth / 3, cupBottom)
                lineTo(centerX - cupWidth / 3, cupBottom)
                close()
                
                // Stem
                moveTo(centerX, cupBottom)
                lineTo(centerX, centerY + size.height * 0.2f)
                
                // Base
                val baseWidth = size.width * 0.3f
                val baseBottom = centerY + size.height * 0.35f
                moveTo(centerX - baseWidth / 2, baseBottom)
                lineTo(centerX + baseWidth / 2, baseBottom)
            }
            
            if (isSelected) {
                drawPath(path = trophyPath, color = color.copy(alpha = 0.15f), style = Fill)
            }
            
            drawPath(
                path = trophyPath,
                color = color,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round)
            )
            
            // Handles
            val handlePath = Path().apply {
                val cupTop = centerY - size.height * 0.3f
                val cupMid = centerY - size.height * 0.12f
                val handleWidth = size.width * 0.12f
                
                // Left Handle
                moveTo(centerX - size.width * 0.2f, cupTop + 2.dp.toPx())
                cubicTo(
                    centerX - size.width * 0.2f - handleWidth, cupTop,
                    centerX - size.width * 0.2f - handleWidth, cupMid,
                    centerX - size.width * 0.15f, cupMid
                )
                
                // Right Handle
                moveTo(centerX + size.width * 0.2f, cupTop + 2.dp.toPx())
                cubicTo(
                    centerX + size.width * 0.2f + handleWidth, cupTop,
                    centerX + size.width * 0.2f + handleWidth, cupMid,
                    centerX + size.width * 0.15f, cupMid
                )
            }
            drawPath(path = handlePath, color = color, style = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}
