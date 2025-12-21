/**
 * Test script to verify member lore is loaded and accessible
 * Run this with: node test-lore.js
 */

const fs = require('fs');

console.log('🎭 Testing Member Lore System\n');

// Load member lore
try {
  const memberLore = JSON.parse(fs.readFileSync("./member-lore.json"));
  console.log(`✅ member-lore.json loaded successfully`);

  // Count members
  const memberCount = Object.keys(memberLore).filter(k => !k.startsWith('_')).length;
  console.log(`📊 Total members with lore: ${memberCount}`);

  // Check _FUTURE_MEMBER_TEMPLATE
  if (memberLore['_FUTURE_MEMBER_TEMPLATE']) {
    console.log(`✅ _FUTURE_MEMBER_TEMPLATE exists (fallback for members without specific lore)`);
  } else {
    console.log(`❌ _FUTURE_MEMBER_TEMPLATE is MISSING!`);
  }

  // Test a few specific members
  console.log(`\n🧪 Testing specific member lookups:\n`);
  const testMembers = ['AmielJohn', 'Azryth', 'Goblok', 'LXRDGRIM', 'amiel john', 'NonExistentMember'];

  testMembers.forEach(name => {
    // Simulate the exact lookup logic from buildStatsEmbed
    const loreKey = Object.keys(memberLore).find(
      key => key.toLowerCase() === name.toLowerCase() && !key.startsWith('_')
    );
    const lore = loreKey ? memberLore[loreKey] : memberLore['_FUTURE_MEMBER_TEMPLATE'];
    const isTemplate = !loreKey && memberLore['_FUTURE_MEMBER_TEMPLATE'];

    if (loreKey) {
      console.log(`  ✅ "${name}" → Found specific lore as "${loreKey}"`);
      console.log(`     Title: ${lore.title}`);
    } else if (isTemplate) {
      console.log(`  📝 "${name}" → Using template (member not in lore.json)`);
      console.log(`     Title: ${name}'s Destiny Awaits`);
    } else {
      console.log(`  ❌ "${name}" → NO LORE (should not happen!)`);
    }
  });

  // Check field value length (Discord limit is 1024 chars)
  console.log(`\n📏 Checking field value lengths (Discord limit: 1024 chars):\n`);
  const checkMembers = ['AmielJohn', 'Azryth', 'Byakko', 'Goblok'];

  checkMembers.forEach(name => {
    if (memberLore[name]) {
      const skills = memberLore[name].skills ? memberLore[name].skills.join(', ') : 'None';
      const fullValue = `${memberLore[name].lore}\n\n**Specialty:** ${memberLore[name].specialty}\n**Reputation:** ${memberLore[name].reputation}\n**Stats:** ${memberLore[name].stats}\n**Skills:** ${skills}`;
      const status = fullValue.length > 1024 ? '⚠️  EXCEEDS LIMIT!' : '✅';
      console.log(`  ${status} ${name}: ${fullValue.length} chars`);
    }
  });

  console.log(`\n✅ Lore system test completed!`);

} catch (error) {
  console.error(`❌ Error loading member-lore.json:`, error.message);
  process.exit(1);
}
