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
  const members = await db.collection('members').find({}).limit(20).toArray();
  
  console.log('Checking first 20 members for Discord IDs:\n');
  members.forEach(m => {
    const hasDiscordId = !m._id.startsWith('temp_');
    console.log(`${hasDiscordId ? '✅' : '❌'} ${m.username}: ${m._id}`);
  });
  
  const totalMembers = await db.collection('members').countDocuments();
  const withRealIds = await db.collection('members').countDocuments({ _id: { $not: /^temp_/ } });
  const tempIds = await db.collection('members').countDocuments({ _id: { $regex: /^temp_/ } });
  
  console.log(`\n📊 Total members: ${totalMembers}`);
  console.log(`   With Discord IDs: ${withRealIds}`);
  console.log(`   With temp IDs: ${tempIds}`);
})();
