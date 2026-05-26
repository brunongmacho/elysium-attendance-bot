package com.elysium.guild.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.elysium.guild.utils.Constants

private val DarkColorScheme = darkColorScheme(
    primary = ElysiumGold,
    onPrimary = DeepMidnight,
    primaryContainer = SlateGrey,
    onPrimaryContainer = ElysiumGold,
    secondary = ElysiumPurple,
    onSecondary = Color.White,
    secondaryContainer = SlateGrey,
    onSecondaryContainer = ElysiumPurpleLight,
    tertiary = StatusReadyGlow,
    background = DeepMidnight,
    surface = DarkObsidian,
    onBackground = Color.White,
    onSurface = Color.White,
    surfaceVariant = SlateGrey,
    onSurfaceVariant = Color.LightGray,
    outline = ElysiumGoldVariant
)

// FIX: High-contrast, readable Light Theme
private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF8D6E63), // Dark, accessible Brandy color
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD7CCC8),
    onPrimaryContainer = Color(0xFF3E2723),
    secondary = Color(0xFF00695C), // Dark Teal
    onSecondary = Color.White,
    background = Color(0xFFFDFCF7), // Clean off-white
    surface = Color(0xFFFDFCF7),
    onBackground = Color(0xFF211A00),
    onSurface = Color(0xFF211A00),
    onSurfaceVariant = Color(0xFF534331),
    outline = Color(0xFFAC927C),
    error = Color(0xFFB00020),
    onError = Color.White
)

@Composable
fun ElysiumGuildTheme(
    themeMode: Int = Constants.THEME_SYSTEM,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val darkTheme = when (themeMode) {
        Constants.THEME_LIGHT -> false
        Constants.THEME_DARK -> true
        else -> isSystemInDarkTheme()
    }

    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = Color.Transparent.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
            WindowCompat.setDecorFitsSystemWindows(window, false)
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
