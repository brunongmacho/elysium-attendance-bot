package com.elysium.guild.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun RelicNavIcon(
    isSelected: Boolean,
    tier: Int = 2,
    modifier: Modifier = Modifier.size(24.dp)
) {
    val color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
    
    Box(contentAlignment = Alignment.Center, modifier = modifier) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidth = 2.dp.toPx()
            val nodeRadius = 2.8.dp.toPx()
            
            // 1. Triangular Frame (Equilateral-ish, upright)
            val padding = size.width * 0.12f
            val top = Offset(size.width / 2, padding)
            val bottomLeft = Offset(padding, size.height - padding)
            val bottomRight = Offset(size.width - padding, size.height - padding)
            
            val trianglePath = Path().apply {
                moveTo(top.x, top.y)
                lineTo(bottomLeft.x, bottomLeft.y)
                lineTo(bottomRight.x, bottomRight.y)
                close()
            }
            
            if (isSelected) {
                drawPath(
                    path = trianglePath,
                    color = color.copy(alpha = 0.15f),
                    style = Fill
                )
            }

            drawPath(
                path = trianglePath,
                color = color,
                style = Stroke(
                    width = strokeWidth,
                    join = StrokeJoin.Round,
                    cap = StrokeCap.Round
                )
            )
            
            // 2. Vertices Nodes (Circular nodes at corners)
            drawCircle(color, nodeRadius, top)
            drawCircle(color, nodeRadius, bottomLeft)
            drawCircle(color, nodeRadius, bottomRight)
            
            // 3. Internal Attribute Glyph (Stylized Clenched Fist)
            drawFistSilhouette(color, center, size.width * 0.24f, strokeWidth * 0.8f)
        }
        
        // 4. Overlaid Tier Indicator (Number centered)
        BasicText(
            text = tier.toString(),
            style = TextStyle(
                color = color,
                fontSize = 10.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center
            ),
            modifier = Modifier.padding(top = 1.dp)
        )
    }
}

private fun DrawScope.drawFistSilhouette(color: Color, center: Offset, radius: Float, strokeWidth: Float) {
    val path = Path().apply {
        val x = center.x
        val y = center.y
        val r = radius
        
        moveTo(x - r * 0.5f, y + r * 0.2f)
        lineTo(x - r * 0.8f, y - r * 0.1f)
        lineTo(x - r * 0.5f, y - r * 0.4f)
        lineTo(x - r * 0.2f, y - r * 0.6f)
        lineTo(x + r * 0.2f, y - r * 0.6f)
        lineTo(x + r * 0.5f, y - r * 0.4f)
        lineTo(x + r * 0.6f, y + r * 0.5f)
        lineTo(x - r * 0.4f, y + r * 0.5f)
        close()
    }
    
    drawPath(
        path = path,
        color = color,
        style = Stroke(
            width = strokeWidth,
            cap = StrokeCap.Round,
            join = StrokeJoin.Round
        )
    )
}
