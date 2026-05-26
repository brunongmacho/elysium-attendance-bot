package com.elysium.guild.viewmodel

import androidx.lifecycle.ViewModel
import com.elysium.guild.ui.screens.RelicData
import com.elysium.guild.ui.screens.RelicType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject

@HiltViewModel
class RelicViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(RelicUiState())
    val uiState: StateFlow<RelicUiState> = _uiState.asStateFlow()

    val standardCosts = listOf(
        15, 25, 36, 48, 62, 78, 96, 116, 138, 163, 192, 225, 263, 306, 355, 410, 471, 539, 614, 697,
        790, 890, 990, 1090, 1190, 1340, 1490, 1760, 1964, 2172, 2400, 2650, 2924, 3224, 3552, 3910,
        4300, 4724, 5184, 5682, 6220, 6800, 7424, 8094, 8812, 9580, 10400, 11274, 12204, 13192, 14240,
        15350, 16524, 17764, 19072, 20450, 21900, 23424, 25024, 26702, 28460, 30300, 32224, 34234,
        36332, 38520, 40800, 43174, 45644, 48212, 50880, 53650, 56524, 59504, 62592, 65790, 69100,
        72524, 76064, 79722, 83500, 87400, 91424, 95574, 99852, 104260, 108800, 113474, 118284, 123232,
        128320, 133550, 138924, 144444, 150112, 155930, 161900, 168024, 174304
    )

    val magicStormCosts = listOf(
        5000, 5104, 5219, 5346, 5485, 5637, 5802, 5981, 6174, 6382, 6610, 6860, 7134, 7434, 7762, 8120,
        8510, 8934, 9394, 9892, 10430, 11010, 11634, 12304, 13022, 13790, 14610, 15484, 16414, 17402,
        18450, 19560, 20734, 21974, 23282, 24660, 26110, 27634, 29234, 30912, 32670, 34510, 36434,
        38444, 40542, 42730, 45010, 47384, 49854, 52422, 55090, 57860, 60734, 63714, 66802, 70000,
        73310, 76734, 80274, 83932, 87710, 91610, 95634, 99784, 104062, 108470, 113010, 117684, 122494,
        127442, 132530, 137760, 143134, 148654, 154322, 160140, 166110, 172234, 178514, 184952, 191550,
        198310, 205234, 212324, 219582, 227010, 234610, 242384, 250334, 258462, 266770, 275260, 283934,
        292794, 301842, 311080, 320510, 330134, 339954
    )

    init {
        updateTotals()
    }

    fun updateRelic(index: Int, data: RelicData) {
        _uiState.update { currentState ->
            val newList = currentState.relics.toMutableList()
            if (index in newList.indices) {
                newList[index] = data
            }
            currentState.copy(relics = newList)
        }
        updateTotals()
    }

    fun updateOwnedPieces(owned: String) {
        _uiState.update { it.copy(ownedPieces = owned) }
        updateTotals()
    }

    private fun updateTotals() {
        _uiState.update { currentState ->
            val totalCost = currentState.relics.sumOf { data ->
                if (!data.isEnabled) 0L else {
                    val start = data.currentLevel.toIntOrNull() ?: 1
                    val end = data.targetLevel.toIntOrNull() ?: 1
                    val costs = if (data.type == RelicType.MAGIC_STORM) magicStormCosts else standardCosts

                    var sum = 0L
                    if (start < end) {
                        for (i in (start - 1) until (end - 1)) {
                            if (i < costs.size) sum += costs[i].toLong()
                        }
                    }
                    sum
                }
            }

            val owned = currentState.ownedPieces.toLongOrNull() ?: 0L
            val remaining = (totalCost - owned).coerceAtLeast(0L)
            val marketPacks = calculateOptimalPacks(remaining)

            currentState.copy(
                totalCost = totalCost,
                remainingNeeded = remaining,
                marketShoppingList = marketPacks
            )
        }
    }

    private fun calculateOptimalPacks(needed: Long): List<MarketPack> {
        var remaining = needed
        val tiers = listOf(
            MarketPackType.T5,
            MarketPackType.T4,
            MarketPackType.T3,
            MarketPackType.T2,
            MarketPackType.T1
        )

        val result = mutableListOf<MarketPack>()
        for (tier in tiers) {
            if (remaining >= tier.amount) {
                val count = (remaining / tier.amount).toInt()
                result.add(MarketPack(tier, count))
                remaining %= tier.amount
            }
        }
        // If there's still something remaining, add one smallest pack
        if (remaining > 0) {
            val t1Index = result.indexOfFirst { it.type == MarketPackType.T1 }
            if (t1Index != -1) {
                result[t1Index] = result[t1Index].copy(count = result[t1Index].count + 1)
            } else {
                result.add(MarketPack(MarketPackType.T1, 1))
            }
        }
        return result.sortedByDescending { it.type.amount }
    }
}

data class RelicUiState(
    val relics: List<RelicData> = listOf(
        RelicData(RelicType.ORIGIN_OF_DESTRUCTION, "1", "100"),
        RelicData(RelicType.BARRIER_PROTECTION, "1", "100"),
        RelicData(RelicType.CRYSTAL_OF_LIFE, "1", "100"),
        RelicData(RelicType.MAGIC_STORM, "1", "100")
    ),
    val ownedPieces: String = "0",
    val totalCost: Long = 0,
    val remainingNeeded: Long = 0,
    val marketShoppingList: List<MarketPack> = emptyList()
)

data class MarketPack(
    val type: MarketPackType,
    val count: Int
)

enum class MarketPackType(val displayName: String, val amount: Int) {
    T1("T1", 1000),
    T2("T2", 5000),
    T3("T3", 10000),
    T4("T4", 50000),
    T5("T5", 100000)
}
