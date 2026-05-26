package com.elysium.guild.ui.components

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.elysium.guild.utils.Constants
import kotlinx.coroutines.awaitCancellation
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

@Composable
fun DynamicElysiumBackground(
    modifier: Modifier = Modifier,
    scrollOffset: Float = 0f,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var isLifecycleStarted by remember { mutableStateOf(true) }

    // Theme-aligned colors
    val isDark = isSystemInDarkTheme()
    val bgColor = MaterialTheme.colorScheme.background
    val primaryColor = MaterialTheme.colorScheme.primary
    val secondaryColor = MaterialTheme.colorScheme.secondary
    val surfaceVariant = MaterialTheme.colorScheme.surfaceVariant

    // Parallax gyro data with high smoothing
    var rawGyroOffset by remember { mutableStateOf(Offset.Zero) }
    val gyroOffset by animateOffsetAsState(
        targetValue = rawGyroOffset,
        animationSpec = spring(stiffness = Spring.StiffnessVeryLow, dampingRatio = Spring.DampingRatioLowBouncy),
        label = "GyroSmoothing"
    )
    
    DisposableEffect(context) {
        val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val gyroSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent?) {
                if (event?.sensor?.type == Sensor.TYPE_ROTATION_VECTOR) {
                    val x = event.values[0] 
                    val y = event.values[1]
                    rawGyroOffset = Offset(x * 25f, y * 25f)
                }
            }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        
        sensorManager.registerListener(listener, gyroSensor, SensorManager.SENSOR_DELAY_UI)
        onDispose {
            sensorManager.unregisterListener(listener)
        }
    }

    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
            isLifecycleStarted = true
            try {
                awaitCancellation()
            } finally {
                isLifecycleStarted = false
            }
        }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "BackgroundTransition")
    
    val aura1Color by animateColorAsState(primaryColor.copy(alpha = if (isDark) 0.15f else 0.1f), tween(3000))
    val aura2Color by animateColorAsState(secondaryColor.copy(alpha = if (isDark) 0.1f else 0.05f), tween(3000))

    val time by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(120000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "Time"
    )

    val particles = remember {
        List(50) {
            ParticleData(
                x = Random.nextFloat(),
                y = Random.nextFloat(),
                size = Random.nextFloat() * 1.5f + 0.5f,
                speed = Random.nextFloat() * 0.03f + 0.01f,
                alpha = Random.nextFloat() * 0.5f + 0.2f
            )
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val scrollFactor = scrollOffset * 0.06f
            
            // 1. Solid Base from Theme
            drawRect(color = bgColor)

            // 2. Subtle Surface Variant Glow (adds depth to the base)
            drawRect(
                brush = Brush.verticalGradient(
                    colors = listOf(bgColor, surfaceVariant.copy(alpha = 0.3f), bgColor)
                )
            )

            // 3. Mana Particles - Matches Primary Theme Color
            particles.forEach { p ->
                val px = p.x * w
                val py = ((p.y - (time * p.speed)) * h - (scrollFactor * 0.3f)) % h
                val finalY = if (py < 0) py + h else py
                
                drawCircle(
                    color = primaryColor.copy(alpha = p.alpha * (if (isDark) 0.3f else 0.15f)),
                    radius = p.size.dp.toPx(),
                    center = Offset(px, finalY)
                )
            }

            // 4. Layered Auras with Gyro Parallax
            withTransform({
                translate(gyroOffset.x, gyroOffset.y)
            }) {
                val angle = time * 2 * Math.PI
                
                // Aura 1 - Primary Accent
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(aura1Color, Color.Transparent),
                        radius = w * 1.1f
                    ),
                    radius = w * 1.1f,
                    center = Offset(
                        x = w * 0.2f + (cos(angle).toFloat() * 100f),
                        y = h * 0.2f + (sin(angle).toFloat() * 100f) - scrollFactor
                    ),
                    blendMode = if (isDark) BlendMode.Screen else BlendMode.Multiply
                )

                // Aura 2 - Secondary Accent
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(aura2Color, Color.Transparent),
                        radius = w * 1.3f
                    ),
                    radius = w * 1.3f,
                    center = Offset(
                        x = w * 0.8f - (cos(angle + 0.5).toFloat() * 80f),
                        y = h * 0.8f - (sin(angle + 0.5).toFloat() * 80f) - (scrollFactor * 0.5f)
                    ),
                    blendMode = if (isDark) BlendMode.Screen else BlendMode.Multiply
                )
            }
            
            // 5. Vignette for Focus
            drawRect(
                brush = Brush.radialGradient(
                    colors = listOf(Color.Transparent, Color.Black.copy(alpha = if (isDark) 0.3f else 0.05f)),
                    center = center,
                    radius = w * 1.5f
                )
            )
        }
        content()
    }
}

private data class ParticleData(
    val x: Float,
    val y: Float,
    val size: Float,
    val speed: Float,
    val alpha: Float
)
