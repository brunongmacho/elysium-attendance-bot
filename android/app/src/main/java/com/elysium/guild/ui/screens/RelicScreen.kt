package com.elysium.guild.ui.screens

import android.os.Parcelable
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.elysium.guild.ui.components.DynamicElysiumBackground
import com.elysium.guild.ui.components.ElysiumGlassCard
import com.elysium.guild.ui.theme.ElysiumGold
import com.elysium.guild.utils.Constants
import com.elysium.guild.viewmodel.MarketPack
import com.elysium.guild.viewmodel.MarketPackType
import com.elysium.guild.viewmodel.RelicViewModel
import kotlinx.parcelize.Parcelize
import java.text.NumberFormat
import java.util.Locale

enum class RelicType(val displayName: String, val icon: ImageVector, val darkColor: Color, val lightColor: Color) {
    ORIGIN_OF_DESTRUCTION("Origin of Destruction", Icons.Default.Whatshot, Color(0xFFEF5350), Color(0xFFC62828)),
    BARRIER_PROTECTION("Barrier Protection", Icons.Default.Shield, Color(0xFF42A5F5), Color(0xFF1565C0)),
    CRYSTAL_OF_LIFE("Crystal of Life", Icons.Default.Favorite, Color(0xFF66BB6A), Color(0xFF2E7D32)),
    MAGIC_STORM("Magic Storm", Icons.Default.Thunderstorm, Color(0xFFFFD600), Color(0xFFF9A825))
}

@Stable
@Parcelize
data class RelicData(
    val type: RelicType,
    val currentLevel: String,
    val targetLevel: String,
    val isEnabled: Boolean = true
) : Parcelable

@Composable
fun TemporalPieceIcon(modifier: Modifier = Modifier) {
    Box(contentAlignment = Alignment.Center, modifier = modifier) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            // Rhombus / Lozenge shape (vertically elongated)
            val path = Path().apply {
                moveTo(size.width / 2f, 0f)                // Top
                lineTo(size.width * 0.9f, size.height / 2f) // Right
                lineTo(size.width / 2f, size.height)       // Bottom
                lineTo(size.width * 0.1f, size.height / 2f) // Left
                close()
            }
            
            // Outer crystal body with a teal gradient
            drawPath(
                path = path,
                brush = Brush.verticalGradient(
                    colors = listOf(Color(0xFF00F2FE), Color(0xFF4FACFE))
                )
            )

            // Inner core glow (orange/yellow)
            val corePath = Path().apply {
                moveTo(size.width / 2f, size.height * 0.25f)
                lineTo(size.width * 0.75f, size.height / 2f)
                lineTo(size.width / 2f, size.height * 0.75f)
                lineTo(size.width * 0.25f, size.height / 2f)
                close()
            }
            drawPath(
                path = corePath,
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFFFFD26F), Color(0xFFF7971E)),
                    center = center,
                    radius = size.width / 3f
                )
            )
        }
    }
}

@Composable
fun RelicScreen(viewModel: RelicViewModel = hiltViewModel()) {
    val scrollState = rememberScrollState()
    val isDark = isSystemInDarkTheme()
    val uiState by viewModel.uiState.collectAsState()

    val goldColor = if (isDark) ElysiumGold else Color(0xFFB8860B)

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        DynamicElysiumBackground(scrollOffset = scrollState.value.toFloat()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp)
                    .verticalScroll(scrollState)
            ) {
                Spacer(modifier = Modifier.height(16.dp))

                HeaderSection()

                Spacer(modifier = Modifier.height(24.dp))

                // Owned Pieces Inventory Card (Simplified: Total Available Only)
                InventoryCard(
                    ownedPieces = uiState.ownedPieces,
                    onOwnedPiecesChange = { viewModel.updateOwnedPieces(it) },
                    isDark = isDark
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Overall Total & Remaining Card
                MainSummaryCard(
                    totalCost = uiState.totalCost,
                    remainingNeeded = uiState.remainingNeeded,
                    goldColor = goldColor
                )

                // Market Shopping List Section
                AnimatedVisibility(visible = uiState.marketShoppingList.isNotEmpty()) {
                    Column {
                        Spacer(modifier = Modifier.height(16.dp))
                        MarketShoppingSection(uiState.marketShoppingList)
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Individual Relic Inputs
                uiState.relics.forEachIndexed { index, relicData ->
                    RelicInputRow(
                        data = relicData,
                        onDataChange = { viewModel.updateRelic(index, it) },
                        costs = if (relicData.type == RelicType.MAGIC_STORM) viewModel.magicStormCosts else viewModel.standardCosts,
                        isDark = isDark
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }

                Spacer(modifier = Modifier.height(100.dp))
            }
        }
    }
}

@Composable
private fun HeaderSection() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = Constants.TITLE_RELIC_CALC.uppercase(),
            style = MaterialTheme.typography.headlineMedium.copy(
                letterSpacing = 2.sp,
                shadow = androidx.compose.ui.graphics.Shadow(
                    color = ElysiumGold.copy(alpha = 0.5f),
                    blurRadius = 15f
                )
            ),
            fontWeight = FontWeight.Black,
            color = MaterialTheme.colorScheme.primary,
            textAlign = TextAlign.Center
        )
        Text(
            text = Constants.SUBTITLE_RELIC_CALC.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
            letterSpacing = 3.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun InventoryCard(
    ownedPieces: String,
    onOwnedPiecesChange: (String) -> Unit,
    isDark: Boolean
) {
    val borderColor = if (isDark) Color.White.copy(alpha = 0.1f) else Color.Black.copy(alpha = 0.1f)
    
    ElysiumGlassCard(
        statusColor = MaterialTheme.colorScheme.secondary,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "TOTAL TEMPORAL AVAILABLE",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                letterSpacing = 1.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = ownedPieces,
                onValueChange = { input ->
                    onOwnedPiecesChange(input.filter { it.isDigit() })
                },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Enter total pieces available...") },
                leadingIcon = { TemporalPieceIcon(modifier = Modifier.size(20.dp)) },
                trailingIcon = {
                    if (ownedPieces.isNotEmpty()) {
                        IconButton(onClick = { onOwnedPiecesChange("") }) {
                            Icon(Icons.Default.Close, null, modifier = Modifier.size(16.dp))
                        }
                    }
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.secondary,
                    unfocusedBorderColor = borderColor
                )
            )
        }
    }
}

@Composable
private fun MainSummaryCard(
    totalCost: Long,
    remainingNeeded: Long,
    goldColor: Color
) {
    ElysiumGlassCard(
        statusColor = goldColor,
        modifier = Modifier.fillMaxWidth(),
        glowColor = goldColor.copy(alpha = 0.2f)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "TOTAL REQUIRED",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                    )
                    Text(
                        text = NumberFormat.getNumberInstance(Locale.US).format(totalCost),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
                
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "REMAINING NEEDED",
                        style = MaterialTheme.typography.labelSmall,
                        color = goldColor.copy(alpha = 0.8f)
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TemporalPieceIcon(modifier = Modifier.size(24.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = NumberFormat.getNumberInstance(Locale.US).format(remainingNeeded),
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Black,
                            color = goldColor
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MarketShoppingSection(packs: List<MarketPack>) {
    val isDark = isSystemInDarkTheme()
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(start = 4.dp, bottom = 8.dp)
        ) {
            Icon(
                Icons.Default.ShoppingCart,
                null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "RECOMMENDED MARKET PURCHASES",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                letterSpacing = 1.sp
            )
        }
        
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 4.dp)
        ) {
            items(packs) { pack ->
                val tierColor = getTierColor(pack.type, isDark)
                Column(
                    modifier = Modifier
                        .width(100.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(tierColor.copy(alpha = 0.05f))
                        .border(1.dp, tierColor.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                        .padding(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(tierColor.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = pack.type.displayName,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Black,
                            color = tierColor
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "BUY",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                    )
                    Text(
                        text = "x${pack.count}",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }
    }
}

@Composable
fun RelicInputRow(
    data: RelicData,
    onDataChange: (RelicData) -> Unit,
    costs: List<Int>,
    isDark: Boolean
) {
    val relicColor = if (isDark) data.type.darkColor else data.type.lightColor
    
    val individualCost = remember(data.currentLevel, data.targetLevel, data.isEnabled) {
        if (!data.isEnabled) 0L else {
            val start = data.currentLevel.toIntOrNull() ?: 1
            val end = data.targetLevel.toIntOrNull() ?: 1
            var sum = 0L
            if (start < end) {
                for (i in (start - 1) until (end - 1)) {
                    if (i < costs.size) sum += costs[i]
                }
            }
            sum
        }
    }

    ElysiumGlassCard(
        statusColor = if (data.isEnabled) relicColor else Color.Gray.copy(alpha = 0.5f),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .padding(12.dp)
                .alpha(if (data.isEnabled) 1f else 0.6f)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Checkbox(
                    checked = data.isEnabled,
                    onCheckedChange = { onDataChange(data.copy(isEnabled = it)) },
                    colors = CheckboxDefaults.colors(checkedColor = relicColor)
                )
                Icon(
                    data.type.icon,
                    contentDescription = "${data.type.displayName} Icon",
                    tint = if (data.isEnabled) relicColor else Color.Gray,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = data.type.displayName.uppercase(),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = if (data.isEnabled) relicColor else Color.Gray,
                    modifier = Modifier.weight(1f)
                )
                if (data.isEnabled && individualCost > 0) {
                    Text(
                        text = "+${NumberFormat.getNumberInstance(Locale.US).format(individualCost)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = relicColor,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                LevelInput(
                    label = "Current",
                    value = data.currentLevel,
                    enabled = data.isEnabled,
                    color = relicColor,
                    onValueChange = { newValue ->
                        if (newValue.isEmpty()) {
                            onDataChange(data.copy(currentLevel = ""))
                            return@LevelInput
                        }
                        val current = newValue.toIntOrNull() ?: 1
                        var target = data.targetLevel.toIntOrNull() ?: 1
                        
                        if (current >= target && target < 100) target = current + 1
                        else if (current >= 100) target = 100

                        onDataChange(data.copy(
                            currentLevel = current.toString(),
                            targetLevel = target.toString()
                        ))
                    },
                    modifier = Modifier.weight(1f)
                )

                LevelInput(
                    label = "Target",
                    value = data.targetLevel,
                    enabled = data.isEnabled,
                    color = relicColor,
                    onValueChange = { newValue ->
                        if (newValue.isEmpty()) {
                            onDataChange(data.copy(targetLevel = ""))
                            return@LevelInput
                        }
                        val target = newValue.toIntOrNull() ?: 100
                        var current = data.currentLevel.toIntOrNull() ?: 1
                        
                        if (target <= current && current > 1) current = target - 1
                        else if (target <= 1) current = 1

                        onDataChange(data.copy(
                            targetLevel = target.toString(),
                            currentLevel = current.toString()
                        ))
                    },
                    modifier = Modifier.weight(1f)
                )
            }

            if (data.type == RelicType.MAGIC_STORM && data.isEnabled) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = "Accuracy Note",
                        tint = relicColor.copy(alpha = 0.7f),
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Note: Levels 1-41 are accurate; 42-100 are predictions.",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                        color = relicColor.copy(alpha = 0.7f)
                    )
                }
            }
        }
    }
}

@Composable
private fun LevelInput(
    label: String,
    value: String,
    enabled: Boolean,
    color: Color,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        OutlinedTextField(
            value = value,
            enabled = enabled,
            onValueChange = { input ->
                val numeric = input.filter { it.isDigit() }
                if (numeric.isEmpty()) {
                    onValueChange("")
                } else {
                    val v = numeric.toInt().coerceIn(1, 100)
                    onValueChange(v.toString())
                }
            },
            label = { Text(label, fontSize = 10.sp) },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            shape = RoundedCornerShape(8.dp),
            prefix = { Text("Lv.", fontSize = 10.sp) },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = color,
                unfocusedBorderColor = color.copy(alpha = 0.5f),
                focusedLabelColor = color,
                unfocusedLabelColor = color.copy(alpha = 0.7f),
                cursorColor = color,
                focusedPrefixColor = color,
                unfocusedPrefixColor = color.copy(alpha = 0.7f),
                disabledBorderColor = Color.Gray.copy(alpha = 0.3f)
            )
        )
        
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            IconButton(
                onClick = { 
                    val v = (value.toIntOrNull() ?: 1) - 1
                    if (v >= 1) onValueChange(v.toString())
                },
                enabled = enabled && (value.toIntOrNull() ?: 1) > 1,
                modifier = Modifier.size(24.dp)
            ) {
                Icon(Icons.Default.Remove, "Decrease", modifier = Modifier.size(16.dp), tint = color)
            }
            IconButton(
                onClick = { 
                    val v = (value.toIntOrNull() ?: 1) + 1
                    if (v <= 100) onValueChange(v.toString())
                },
                enabled = enabled && (value.toIntOrNull() ?: 1) < 100,
                modifier = Modifier.size(24.dp)
            ) {
                Icon(Icons.Default.Add, "Increase", modifier = Modifier.size(16.dp), tint = color)
            }
        }
    }
}

fun getTierColor(type: MarketPackType, isDark: Boolean): Color {
    return when (type) {
        MarketPackType.T1 -> if (isDark) Color(0xFFCD7F32) else Color(0xFF8B4513) // Bronze
        MarketPackType.T2 -> if (isDark) Color(0xFFC0C0C0) else Color(0xFF708090) // Silver
        MarketPackType.T3 -> if (isDark) Color(0xFFFFD700) else Color(0xFFB8860B) // Gold
        MarketPackType.T4 -> if (isDark) Color(0xFF00FFFF) else Color(0xFF008B8B) // Platinum/Cyan
        MarketPackType.T5 -> if (isDark) Color(0xFFBB86FC) else Color(0xFF6200EE) // Epic/Purple
    }
}
