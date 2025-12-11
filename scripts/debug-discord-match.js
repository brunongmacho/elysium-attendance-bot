/**
 * Debug script to show Discord member data vs MongoDB data
 * Helps identify why matching is failing
 *
 * Usage: node scripts/debug-discord-match.js <discord-user-id-or-username>
 */

const { Client, GatewayIntentBits } = require('discord.js');
const dbAPI = require('../utils/database-api');
const fs = require('fs');
const path = require('path');

// Load environment variables (optional - env vars may already be set)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, environment variables should already be set
}

// Load config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

async function debugMatch(searchTerm) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🔍 DEBUG DISCORD MATCHING FOR: ${searchTerm}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Connect to MongoDB
  console.log('📊 Connecting to MongoDB...');
  const db = await dbAPI.connect();
  console.log('✅ MongoDB connected\n');

  // Connect to Discord
  console.log('🤖 Connecting to Discord...');
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ]
  });

  await client.login(process.env.DISCORD_TOKEN);
  console.log('✅ Discord connected\n');

  const guild = await client.guilds.fetch(config.main_guild_id);
  await guild.members.fetch(); // Fetch all members

  // Find Discord member
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 1: DISCORD PROFILE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let discordMember;

  // Try to find by ID first
  try {
    discordMember = await guild.members.fetch(searchTerm);
  } catch (e) {
    // Not an ID, search by username/nickname
    discordMember = guild.members.cache.find(m => {
      const username = m.user.username.toLowerCase();
      const nickname = m.nickname ? m.nickname.toLowerCase() : null;
      const displayName = m.displayName.toLowerCase();
      const search = searchTerm.toLowerCase();

      return username === search ||
             nickname === search ||
             displayName === search ||
             username.includes(search) ||
             (nickname && nickname.includes(search)) ||
             displayName.includes(search);
    });
  }

  if (!discordMember) {
    console.log(`❌ No Discord member found matching: ${searchTerm}\n`);
    console.log('💡 Try searching by Discord User ID instead');
    console.log('   You can get your ID by right-clicking your name in Discord\n');

    // Show similar members
    const similar = guild.members.cache
      .filter(m => {
        const search = searchTerm.toLowerCase();
        const username = m.user.username.toLowerCase();
        const nickname = m.nickname ? m.nickname.toLowerCase() : '';
        const displayName = m.displayName.toLowerCase();

        return username.includes(search.substring(0, 4)) ||
               search.includes(username.substring(0, 4)) ||
               nickname.includes(search.substring(0, 4)) ||
               displayName.includes(search.substring(0, 4));
      })
      .first(5);

    if (similar.length > 0) {
      console.log('Similar Discord members found:');
      similar.forEach(m => {
        console.log(`  - ${m.user.username} (ID: ${m.id})`);
        console.log(`    Nickname: ${m.nickname || 'none'}`);
        console.log(`    Display Name: ${m.displayName}`);
        console.log('');
      });
    }

    await client.destroy();
    await dbAPI.close();
    return;
  }

  console.log('✅ Discord Member Found:');
  console.log(`   Discord User ID: ${discordMember.id}`);
  console.log(`   Username: ${discordMember.user.username}`);
  console.log(`   Nickname: ${discordMember.nickname || 'none'}`);
  console.log(`   Display Name: ${discordMember.displayName}`);
  console.log('');

  // Find MongoDB members
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 2: MONGODB MEMBERS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Search by Discord ID
  const memberByDiscordId = await db.collection('members').findOne({ _id: discordMember.id });

  // Search by username (all variations)
  const searchNames = [
    discordMember.user.username,
    discordMember.nickname,
    discordMember.displayName
  ].filter(Boolean);

  console.log(`Searching MongoDB for usernames: ${searchNames.join(', ')}\n`);

  const membersByName = await db.collection('members').find({
    username: { $in: searchNames.map(name => new RegExp(`^${name}$`, 'i')) }
  }).toArray();

  // Search for temp IDs
  const tempIds = searchNames.map(name => `temp_${name.toLowerCase().replace(/\s+/g, '_')}`);
  const membersByTempId = await db.collection('members').find({
    _id: { $in: tempIds }
  }).toArray();

  console.log('MongoDB search results:');
  console.log(`  By Discord ID (${discordMember.id}): ${memberByDiscordId ? '✅ FOUND' : '❌ NOT FOUND'}`);
  if (memberByDiscordId) {
    console.log(`    Username: ${memberByDiscordId.username}`);
    console.log(`    Total attendance: ${memberByDiscordId.attendance?.total || 0}`);
    console.log('');
  }

  console.log(`  By username (case-insensitive): ${membersByName.length} found`);
  membersByName.forEach(m => {
    console.log(`    - ID: ${m._id}`);
    console.log(`      Username: ${m.username}`);
    console.log(`      Total attendance: ${m.attendance?.total || 0}`);
    console.log('');
  });

  console.log(`  By temp ID: ${membersByTempId.length} found`);
  membersByTempId.forEach(m => {
    console.log(`    - ID: ${m._id}`);
    console.log(`      Username: ${m.username}`);
    console.log(`      Total attendance: ${m.attendance?.total || 0}`);
    console.log('');
  });

  // Check attendance records
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 3: ATTENDANCE RECORDS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get all possible member IDs
  const allMemberIds = [
    discordMember.id,
    ...tempIds,
    ...membersByName.map(m => m._id),
    ...membersByTempId.map(m => m._id)
  ];

  console.log(`Checking attendance for IDs: ${[...new Set(allMemberIds)].join(', ')}\n`);

  for (const memberId of [...new Set(allMemberIds)]) {
    const count = await db.collection('attendance').countDocuments({ memberId });
    if (count > 0) {
      const sample = await db.collection('attendance').findOne({ memberId });
      console.log(`✅ Found ${count} attendance records for memberId: ${memberId}`);
      console.log(`   Sample record memberName: "${sample.memberName}"`);
      console.log(`   Sample record bossName: "${sample.bossName}"`);
      console.log('');
    } else {
      console.log(`❌ No attendance records for memberId: ${memberId}`);
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('DIAGNOSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (!memberByDiscordId && membersByTempId.length > 0) {
    console.log('⚠️ ISSUE: You have a temp ID member but no real Discord ID member');
    console.log('   The Discord ID sync should fix this on next bot restart.\n');
    console.log('💡 Possible reasons:');
    console.log('   1. Username mismatch between Discord and MongoDB');
    console.log(`      - Discord: ${discordMember.user.username}`);
    console.log(`      - MongoDB: ${membersByTempId[0]?.username}`);
    console.log('   2. Case sensitivity issues (but should be handled)');
    console.log('');
  } else if (memberByDiscordId && membersByTempId.length > 0) {
    console.log('⚠️ ISSUE: You have BOTH a temp ID and real Discord ID member');
    console.log('   The Discord ID sync should merge these on next restart.\n');
  } else if (memberByDiscordId) {
    console.log('✅ You have a proper Discord ID member in MongoDB');
    console.log('   Stats command should work correctly.\n');

    const attendanceCount = await db.collection('attendance').countDocuments({ memberId: memberByDiscordId._id });
    if (attendanceCount === 0 && memberByDiscordId.attendance?.total > 0) {
      console.log('⚠️ WARNING: Member document shows attendance but no records found!');
      console.log('   This suggests a data inconsistency.\n');
    }
  } else {
    console.log('❌ ISSUE: No member found in MongoDB at all');
    console.log('   You need to be added to the Google Sheets member list.\n');
  }

  // Cleanup
  await client.destroy();
  await dbAPI.close();
}

// Main
const searchTerm = process.argv[2];
if (!searchTerm) {
  console.log('Usage: node scripts/debug-discord-match.js <discord-user-id-or-username>');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/debug-discord-match.js HesuCrypto');
  console.log('  node scripts/debug-discord-match.js 1234567890');
  console.log('');
  console.log('💡 To get your Discord User ID:');
  console.log('   1. Enable Developer Mode in Discord (User Settings > Advanced)');
  console.log('   2. Right-click your name and select "Copy User ID"');
  process.exit(1);
}

debugMatch(searchTerm).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
