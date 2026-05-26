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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun SettingsIcon(
    isSelected: Boolean,
    modifier: Modifier = Modifier.size(24.dp)
) {
    val color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
    
    Box(contentAlignment = Alignment.Center, modifier = modifier) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidth = 2.dp.toPx()
            val centerX = size.width / 2f
            val centerY = size.height / 2f
            
            val numTeeth = 6
            
            // 1. Ornate Mechanical Cog Path
            val gearPath = Path().apply {
                val outerRadius = size.width * 0.42f
                val innerRadius = size.width * 0.26f
                val toothWidth = 0.28f // radians
                
                for (i in 0 until numTeeth) {
                    val angle = (i * 2 * PI / numTeeth).toFloat()
                    
                    val x1 = centerX + innerRadius * cos(angle - toothWidth)
                    val y1 = centerY + innerRadius * sin(angle - toothWidth)
                    val x2 = centerX + outerRadius * cos(angle - toothWidth)
                    val y2 = centerY + outerRadius * sin(angle - toothWidth)
                    val x3 = centerX + outerRadius * cos(angle + toothWidth)
                    val y3 = centerY + outerRadius * sin(angle + toothWidth)
                    val x4 = centerX + innerRadius * cos(angle + toothWidth)
                    val y4 = centerY + innerRadius * sin(angle + toothWidth)
                    
                    if (i == 0) moveTo(x1, y1) else lineTo(x1, y1)
                    lineTo(x2, y2)
                    lineTo(x3, y3)
                    lineTo(x4, y4)
                    
                    // Arc to next tooth base
                    val nextAngle = ((i + 1) * 2 * PI / numTeeth).toFloat()
                    val x5 = centerX + innerRadius * cos(nextAngle - toothWidth)
                    val y5 = centerY + innerRadius * sin(nextAngle - toothWidth)
                    lineTo(x5, y5)
                }
                close()
            }
            
            if (isSelected) {
                drawPath(path = gearPath, color = color.copy(alpha = 0.15f), style = Fill)
            }
            
            drawPath(
                path = gearPath,
                color = color,
                style = Stroke(
                    width = strokeWidth,
                    join = StrokeJoin.Round,
                    cap = StrokeCap.Round
                )
            )
            
            // 2. Inner Hexagonal Core
            val corePath = Path().apply {
                val radius = size.width * 0.12f
                for (i in 0 until 6) {
                    val angle = (i * PI / 3).toFloat()
                    val x = centerX + radius * cos(angle)
                    val y = centerY + radius * sin(angle)
                    if (i == 0) moveTo(x, y) else lineTo(x, y)
                }
                close()
            }
            
            if (isSelected) {
                drawPath(path = corePath, color = color, style = Fill)
            } else {
                drawPath(path = corePath, color = color, style = Stroke(width = strokeWidth * 0.8f))
            }
            
            // 3. Decorative spokes/lines connecting core to teeth
            for (i in 0 until 6) {
                val angle = (i * 2 * PI / numTeeth).toFloat()
                val startR = size.width * 0.16f
                val endR = size.width * 0.24f
                drawLine(
                    color = color,
                    start = Offset(centerX + startR * cos(angle), centerY + startR * sin(angle)),
                    end = Offset(centerX + endR * cos(angle), centerY + endR * sin(angle)),
                    strokeWidth = strokeWidth * 0.5f,
                    cap = StrokeCap.Round
                )
            }
        }
    }
}
