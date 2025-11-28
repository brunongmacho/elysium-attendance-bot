/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MongoDB Connection Test Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Run this to verify MongoDB connection works before deployment
 * Usage: node test-mongodb.js
 */

const dbAPI = require('./utils/database-api');

async function testMongoDB() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 MongoDB Connection Test');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Connection
    // ─────────────────────────────────────────────────────────────
    console.log('📝 Test 1: Connecting to MongoDB Atlas...');
    await dbAPI.connect();
    const db = dbAPI.getDB();
    console.log('✅ Connection successful\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Write Operation
    // ─────────────────────────────────────────────────────────────
    console.log('📝 Test 2: Testing write operation...');
    await db.collection('test').insertOne({
      test: 'Hello from Philippines!',
      timestamp: new Date(),
      server: 'Singapore',
      purpose: 'Connection test'
    });
    console.log('✅ Write successful\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Read Operation
    // ─────────────────────────────────────────────────────────────
    console.log('📝 Test 3: Testing read operation...');
    const doc = await db.collection('test').findOne({ test: /Hello/ });
    console.log('✅ Read successful');
    console.log('   Document:', doc);
    console.log('');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Query Speed (Latency Test)
    // ─────────────────────────────────────────────────────────────
    console.log('📝 Test 4: Testing query speed...');
    const speedTests = [];
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await db.collection('test').findOne({ test: /Hello/ });
      const latency = Date.now() - start;
      speedTests.push(latency);
    }
    const avgLatency = speedTests.reduce((a, b) => a + b, 0) / speedTests.length;
    const minLatency = Math.min(...speedTests);
    const maxLatency = Math.max(...speedTests);

    console.log(`✅ Query speed test complete:`);
    console.log(`   Average latency: ${avgLatency.toFixed(1)}ms`);
    console.log(`   Min latency: ${minLatency}ms`);
    console.log(`   Max latency: ${maxLatency}ms`);

    if (avgLatency < 15) {
      console.log(`   🚀 Excellent! (Expected 5-15ms from Singapore)`);
    } else if (avgLatency < 50) {
      console.log(`   ✅ Good (acceptable performance)`);
    } else {
      console.log(`   ⚠️  Slower than expected (check connection)`);
    }
    console.log('');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Health Check
    // ─────────────────────────────────────────────────────────────
    console.log('📝 Test 5: Running health check...');
    const health = await dbAPI.healthCheck();
    console.log('✅ Health check complete:');
    console.log(`   Healthy: ${health.healthy}`);
    console.log(`   Latency: ${health.latency}ms`);
    console.log(`   Database: ${health.database}`);
    console.log('');

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Database Statistics
    // ─────────────────────────────────────────────────────────────
    console.log('📝 Test 6: Getting database statistics...');
    const stats = await dbAPI.getStats();
    console.log('✅ Statistics retrieved:');
    console.log(`   Collections: ${stats.collections}`);
    console.log(`   Documents: ${stats.documents}`);
    console.log(`   Data Size: ${stats.dataSize}`);
    console.log(`   Index Size: ${stats.indexSize}`);
    console.log('');

    // ─────────────────────────────────────────────────────────────
    // CLEANUP: Remove test data
    // ─────────────────────────────────────────────────────────────
    console.log('🧹 Cleaning up test data...');
    await db.collection('test').deleteMany({});
    console.log('✅ Test data cleaned up\n');

    // ─────────────────────────────────────────────────────────────
    // SUCCESS!
    // ─────────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎉 All tests passed successfully!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n✅ MongoDB is ready for production deployment\n');

    await dbAPI.close();
    process.exit(0);
  } catch (error) {
    console.error('\n═══════════════════════════════════════════════════════════');
    console.error('❌ Test failed:');
    console.error('═══════════════════════════════════════════════════════════');
    console.error(error);
    console.error('\n⚠️  Please check:');
    console.error('   1. MONGODB_URI is set in environment variables');
    console.error('   2. MongoDB Atlas cluster is running');
    console.error('   3. IP whitelist allows your current IP (or 0.0.0.0/0)');
    console.error('   4. Database user credentials are correct\n');

    await dbAPI.close();
    process.exit(1);
  }
}

// Run the test
testMongoDB();
