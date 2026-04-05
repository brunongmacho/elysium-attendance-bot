const fs = require('fs');
const path = require('path');

// Load .env first
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
});

const dbAPI = require('./utils/database-api');

(async () => {
  const db = await dbAPI.connect();
  
  const attendanceCollection = db.collection('attendance');
  const membersCollection = db.collection('members');
  
  // Get sample attendance records
  const sampleAttendance = await attendanceCollection.find({}).limit(10).toArray();
  
  console.log('Sample attendance records (first 10):\n');
  sampleAttendance.forEach(a => {
    const hasTempId = a.memberId.startsWith('temp_');
    console.log(`${hasTempId ? '❌' : '✅'} ${a.memberName}: ${a.bossName} at ${new Date(a.timestamp).toLocaleDateString()} | memberId: ${a.memberId}`);
  });
  
  // Count temp vs real IDs in attendance
  const totalAttendance = await attendanceCollection.countDocuments();
  const withTempIds = await attendanceCollection.countDocuments({ memberId: { $regex: /^temp_/ } });
  const withRealIds = totalAttendance - withTempIds;
  
  console.log(`\n📊 Attendance Summary:`);
  console.log(`   Total records: ${totalAttendance}`);
  console.log(`   With Discord IDs: ${withRealIds}`);
  console.log(`   With temp IDs: ${withTempIds}`);
  
  if (withTempIds === 0) {
    console.log('\n✅ All attendance records have Discord IDs!');
  } else {
    // Find which members have temp IDs
    const membersWithTempIds = await membersCollection.find({ _id: { $regex: /^temp_/ } }).toArray();
    console.log(`\n⚠️ Members with temp IDs (${membersWithTempIds.length}):`);
    membersWithTempIds.forEach(m => console.log(`   - ${m.username}: ${m._id}`));
  }
})();
