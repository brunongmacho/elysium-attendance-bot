"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui";
import { Typography } from "@/components/ui";
import { Section, Grid, Stack } from "@/components/layout";

// Cost data
const STANDARD_COSTS = [
  15, 25, 36, 48, 62, 78, 96, 116, 138, 163, 192, 225, 263, 306, 355, 410, 471, 539, 614, 697,
  790, 890, 990, 1090, 1190, 1340, 1490, 1760, 1964, 2172, 2400, 2650, 2924, 3224, 3552, 3910, 4300, 4724, 5184, 5682, 6220, 6800, 7424, 8094, 8812, 9580, 10400, 11274, 12204, 13192, 14240, 15350, 16524, 17764, 19072, 20450, 21900, 23424, 25024, 26702, 28460, 30300, 32224, 34234, 36332, 38520, 40800, 43174, 45644, 48212, 50880, 53650, 56524, 59504, 62592, 65790, 69100, 72524, 76064, 79722, 83500, 87400, 91424, 95574, 99852, 104260, 108800, 113474, 118284, 123232, 128320, 133550, 138924, 144444, 150112, 155930, 161900, 168024, 174304
];

const MAGIC_STORM_COSTS = [
  5000, 5104, 5219, 5346, 5485, 5637, 5802, 5981, 6174, 6382, 6610, 6860, 7134, 7434, 7762, 8120, 8510, 8934, 9394, 9892,
  10430, 11010, 11634, 12304, 13022, 13790, 14610, 15484, 16414, 17402, 18450, 19560, 20734, 21974, 23282, 24660, 26110, 27634, 29234, 30912, 32670, 34510, 36434, 38444, 40542, 42730, 45010, 47384, 49854, 52422, 55090, 57860, 60734, 63714, 66802, 70000, 73310, 76734, 80274, 83932, 87710, 91610, 95634, 99784, 104062, 108470, 113010, 117684, 122494, 127442, 132530, 137760, 143134, 148654, 154322, 160140, 166110, 172234, 178514, 184952, 191550, 198310, 205234, 212324, 219582, 227010, 234610, 242384, 250334, 258462, 266770, 275260, 283934, 292794, 301842, 311080, 320510, 330134, 339954
];

interface RelicData {
  id: string;
  name: string;
  color: 'danger' | 'info' | 'success' | 'gold';
  costs: number[];
}

interface RelicState {
  enabled: boolean;
  currentLevel: number;
  targetLevel: number;
}

const RELICS: RelicData[] = [
  { id: 'origin', name: 'Origin of Destruction', color: 'danger', costs: STANDARD_COSTS },
  { id: 'barrier', name: 'Barrier Protection', color: 'info', costs: STANDARD_COSTS },
  { id: 'crystal', name: 'Crystal of Life', color: 'success', costs: STANDARD_COSTS },
  { id: 'magicStorm', name: 'Magic Storm', color: 'gold', costs: MAGIC_STORM_COSTS }
];

function getColorClasses(color: string) {
  const colorMap: Record<string, { border: string; text: string; glow: string; bg: string }> = {
    danger: { border: 'border-red-500/50', text: 'text-red-400', glow: 'shadow-red-500/50', bg: 'bg-red-500/10' },
    info: { border: 'border-blue-500/50', text: 'text-blue-400', glow: 'shadow-blue-500/50', bg: 'bg-blue-500/10' },
    success: { border: 'border-green-500/50', text: 'text-green-400', glow: 'shadow-green-500/50', bg: 'bg-green-500/10' },
    gold: { border: 'border-yellow-500/50', text: 'text-yellow-400', glow: 'shadow-yellow-500/50', bg: 'bg-yellow-500/10' }
  };
  return colorMap[color] || colorMap.info;
}

function calculateCost(currentLevel: number, targetLevel: number, costs: number[]): number {
  if (currentLevel >= targetLevel) return 0;
  
  const startIndex = currentLevel - 1; // Lv 1 starts at index 0
  const endIndex = targetLevel - 2;    // Target Lv excludes the last level cost
  
  let total = 0;
  for (let i = startIndex; i <= endIndex && i < costs.length; i++) {
    total += costs[i];
  }
  return total;
}

export default function RelicCalculator() {
  const [relicStates, setRelicStates] = useState<Record<string, RelicState>>(() => {
    const initial: Record<string, RelicState> = {};
    RELICS.forEach(relic => {
      initial[relic.id] = {
        enabled: false,
        currentLevel: 1,
        targetLevel: 100
      };
    });
    return initial;
  });

  // Calculate individual costs and grand total
  const { individualCosts, grandTotal } = useMemo(() => {
    const costs: Record<string, number> = {};
    let total = 0;
    
    RELICS.forEach(relic => {
      const state = relicStates[relic.id];
      if (state.enabled) {
        const cost = calculateCost(state.currentLevel, state.targetLevel, relic.costs);
        costs[relic.id] = cost;
        total += cost;
      } else {
        costs[relic.id] = 0;
      }
    });
    
    return { individualCosts: costs, grandTotal: total };
  }, [relicStates]);

  const updateRelicState = (relicId: string, updates: Partial<RelicState>) => {
    setRelicStates(prev => {
      const newState = { ...prev, [relicId]: { ...prev[relicId], ...updates } };
      
      // Validation: ensure levels are within bounds
      if (newState[relicId].currentLevel < 1) newState[relicId].currentLevel = 1;
      if (newState[relicId].currentLevel > 100) newState[relicId].currentLevel = 100;
      if (newState[relicId].targetLevel < 1) newState[relicId].targetLevel = 1;
      if (newState[relicId].targetLevel > 100) newState[relicId].targetLevel = 100;
      
      // Auto-adjust logic only when both levels are set and valid
      const current = newState[relicId].currentLevel;
      const target = newState[relicId].targetLevel;
      
      if (target <= current && current > 0 && target > 0) {
        newState[relicId].currentLevel = Math.max(1, target - 1);
      }
      if (current >= target && current > 0 && target > 0) {
        newState[relicId].targetLevel = Math.min(100, current + 1);
      }
      
      return newState;
    });
  };

  return (
    <Section>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Typography variant="h1" className="text-2xl sm:text-3xl md:text-4xl text-gold mb-6 text-center">
          ⚔️ Relic Calculator
        </Typography>
      </motion.div>

      {/* Grand Total Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="mb-8"
      >
        <Card className="glass backdrop-blur-sm border border-gold/30 glow-gold">
          <CardContent className="p-6 text-center">
            <Typography variant="h3" className="text-lg text-gold mb-2">
              Grand Total Cost
            </Typography>
            <Typography variant="display" className="text-3xl sm:text-4xl md:text-5xl font-bold text-gold font-game-decorative">
              {grandTotal.toLocaleString()}
            </Typography>
            <Typography variant="caption" className="text-gray-400 mt-2">
              Total cost for all enabled relics
            </Typography>
          </CardContent>
        </Card>
      </motion.div>

      {/* Relic Cards */}
      <Grid columns={{ xs: 1, md: 2 }} gap="lg">
        {RELICS.map((relic, index) => {
          const state = relicStates[relic.id];
          const colorClasses = getColorClasses(relic.color);
          const cost = individualCosts[relic.id];
          
          return (
            <motion.div
              key={relic.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 * index }}
              whileHover={{ scale: state.enabled ? 1.02 : 1 }}
            >
              <Card className={`glass backdrop-blur-sm border ${colorClasses.border} transition-all duration-300 ${
                state.enabled ? colorClasses.glow : 'opacity-50'
              }`}>
                <CardContent className="p-6">
                  <Stack gap="md">
                    {/* Header with Checkbox */}
                    <div className="flex items-center justify-between">
                      <Typography variant="h3" className={`text-xl font-bold ${colorClasses.text}`}>
                        {relic.name}
                      </Typography>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.enabled}
                          onChange={(e) => updateRelicState(relic.id, { enabled: e.target.checked })}
                          className={`w-5 h-5 rounded border-2 ${colorClasses.border} bg-transparent text-gold focus:ring-2 focus:ring-gold/50`}
                        />
                        <Typography variant="small" className="text-gray-400">
                          {state.enabled ? 'Enabled' : 'Disabled'}
                        </Typography>
                      </label>
                    </div>

                    {/* Cost Display */}
                    {state.enabled && (
                      <div className={`p-3 rounded-lg ${colorClasses.bg} border ${colorClasses.border}`}>
                        <Typography variant="body" className="text-gray-300 text-sm mb-1">
                          Upgrade Cost:
                        </Typography>
                        <Typography variant="h4" className={`text-xl font-bold ${colorClasses.text} font-game-decorative`}>
                          {cost.toLocaleString()}
                        </Typography>
                      </div>
                    )}

                    {/* Level Inputs */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${colorClasses.text}`}>
                          Current Level
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={state.currentLevel}
                          onChange={(e) => {
                            const value = e.target.value === '' ? 1 : parseInt(e.target.value) || 1;
                            updateRelicState(relic.id, { currentLevel: value });
                          }}
                          disabled={!state.enabled}
                          className={`w-full px-3 py-2 rounded-lg bg-gray-800 border ${colorClasses.border} text-white focus:ring-2 focus:ring-gold/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200`}
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${colorClasses.text}`}>
                          Target Level
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={state.targetLevel}
                          onChange={(e) => {
                            const value = e.target.value === '' ? 1 : parseInt(e.target.value) || 1;
                            updateRelicState(relic.id, { targetLevel: value });
                          }}
                          disabled={!state.enabled}
                          className={`w-full px-3 py-2 rounded-lg bg-gray-800 border ${colorClasses.border} text-white focus:ring-2 focus:ring-gold/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200`}
                        />
                      </div>
                    </div>


                  </Stack>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </Grid>
    </Section>
  );
}