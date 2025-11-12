/**
 * Test script to see ML spawn prediction accuracy
 * Run: node test-ml-spawn.js
 */

const { MLSpawnPredictor } = require('./ml-spawn-predictor');
const { SheetAPI } = require('./utils/sheet-api');
const config = require('./config.json');

async function testSpawnPrediction() {
  console.log('🧪 Testing ML Spawn Prediction\n');

  // Initialize
  const sheetAPI = new SheetAPI(config.sheet_webhook_url);
  const predictor = new MLSpawnPredictor(sheetAPI, config);

  // Learn from all historical data
  console.log('📚 Learning patterns from Google Sheets...\n');
  await predictor.learnPatterns();

  console.log('\n📊 Learned Patterns Summary:\n');

  // Show what was learned for each boss
  const patterns = await predictor.exportPatterns();

  const sortedBosses = Object.entries(patterns).sort((a, b) =>
    b[1].sampleSize - a[1].sampleSize
  );

  console.log('Top bosses by data quality:\n');

  for (const [bossName, pattern] of sortedBosses.slice(0, 15)) {
    const windowMinutes = Math.round(pattern.stdDev * 60 * 1.96);
    const cv = pattern.stdDev / pattern.meanInterval;

    console.log(
      `${bossName.padEnd(20)} | ` +
      `${pattern.sampleSize.toString().padStart(3)} spawns | ` +
      `${pattern.meanInterval.toFixed(2)}h | ` +
      `±${windowMinutes.toString().padStart(2)}min window | ` +
      `${(pattern.confidence * 100).toFixed(0)}% confident | ` +
      `${cv < 0.05 ? '✅' : cv < 0.10 ? '⚠️' : '❌'} ${(cv * 100).toFixed(1)}% variance`
    );
  }

  console.log('\n\n🔮 Example Predictions:\n');

  // Test predictions for a few bosses
  const testBosses = ['Valakas', 'Ego', 'Venatus', 'Clemantis'];

  for (const bossName of testBosses) {
    if (patterns[bossName]) {
      const pattern = patterns[bossName];
      const lastKillTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      const prediction = await predictor.predictSpawn(
        bossName,
        lastKillTime,
        pattern.meanInterval
      );

      console.log(`\n${bossName}:`);
      console.log(`  Predicted: ${prediction.predictedSpawn.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric'
      })}`);
      console.log(`  Window: ${prediction.confidenceInterval.earliest.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })} - ${prediction.confidenceInterval.latest.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })}`);
      console.log(`  Confidence: ${(prediction.confidence * 100).toFixed(0)}%`);
      console.log(`  Method: ${prediction.method}`);
    }
  }
}

testSpawnPrediction().catch(console.error);
