package com.elysium.guild.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

@Composable
fun EventCalendarIcon(
    isSelected: Boolean,
    modifier: Modifier = Modifier.size(24.dp)
) {
    val color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
    
    Box(contentAlignment = Alignment.Center, modifier = modifier) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidth = 2.dp.toPx()
            val cornerRadius = 2.dp.toPx()
            
            // 1. Primary Form (Landscape Rectangular calendar page)
            val width = size.width * 0.9f
            val height = size.height * 0.7f
            val left = (size.width - width) / 2
            val top = (size.height - height) / 2
            
            val mainRect = Size(width, height)
            val topLeft = Offset(left, top)

            if (isSelected) {
                drawRoundRect(
                    color = color.copy(alpha = 0.15f),
                    topLeft = topLeft,
                    size = mainRect,
                    cornerRadius = CornerRadius(cornerRadius),
                    style = Fill
                )
            }

            drawRoundRect(
                color = color,
                topLeft = topLeft,
                size = mainRect,
                cornerRadius = CornerRadius(cornerRadius),
                style = Stroke(
                    width = strokeWidth,
                    join = StrokeJoin.Round,
                    cap = StrokeCap.Round
                )
            )
            
            // 2. Top Header Bar Separator
            val headerHeight = height * 0.3f
            drawLine(
                color = color,
                start = Offset(left, top + headerHeight),
                end = Offset(left + width, top + headerHeight),
                strokeWidth = strokeWidth,
                cap = StrokeCap.Round
            )
            
            // 3. Binding / Tabs
            val notchOffset = width * 0.2f
            
            // Left Notch
            drawLine(
                color = color,
                start = Offset(left + notchOffset, top - 2.dp.toPx()),
                end = Offset(left + notchOffset, top + 1.dp.toPx()),
                strokeWidth = strokeWidth,
                cap = StrokeCap.Round
            )
            
            // Right Notch
            drawLine(
                color = color,
                start = Offset(left + width - notchOffset, top - 2.dp.toPx()),
                end = Offset(left + width - notchOffset, top + 1.dp.toPx()),
                strokeWidth = strokeWidth,
                cap = StrokeCap.Round
            )
            
            // 4. Date Grid
            val gridPadding = 4.dp.toPx()
            val gridTop = top + headerHeight + gridPadding
            val gridBottom = top + height - gridPadding
            val gridLeft = left + gridPadding
            val gridRight = left + width - gridPadding
            
            val verticalSpacing = (gridRight - gridLeft) / 3
            for (i in 1..2) {
                val x = gridLeft + i * verticalSpacing
                drawLine(
                    color = color,
                    start = Offset(x, gridTop),
                    end = Offset(x, gridBottom),
                    strokeWidth = strokeWidth * 0.5f,
                    cap = StrokeCap.Round
                )
            }
            
            val horizontalY = gridTop + (gridBottom - gridTop) / 2
            drawLine(
                color = color,
                start = Offset(gridLeft, horizontalY),
                end = Offset(gridRight, horizontalY),
                strokeWidth = strokeWidth * 0.5f,
                cap = StrokeCap.Round
            )
        }
    }
}
