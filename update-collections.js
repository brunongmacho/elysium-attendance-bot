const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'utils', 'mongodb-helpers.js');
let content = fs.readFileSync(filePath, 'utf8');

// Get guild name
let guildName = 'TrailerParkB';
try {
  const configPath = path.join(__dirname, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.guild_name) guildName = config.guild_name;
} catch(e) {}

const suffix = guildName.replace(/\s+/g, '_').toUpperCase();

// Define replacements: [oldPattern, newPattern]
const replacements = [
  // members collection
  [/\.collection\('members'\)/g, ".collection(getCollectionName('members'))"],
  
  // auctionItems collection  
  [/\.collection\('auctionItems'\)/g, ".collection(getCollectionName('auctionItems'))"],
  
  // attendance collection
  [/\.collection\('attendance'\)/g, ".collection(getCollectionName('attendance'))"],
  
  // botState collection
  [/\.collection\('botState'\)/g, ".collection(getCollectionName('botState'))"],
  
  // bossTimers collection
  [/\.collection\('bossTimers'\)/g, ".collection(getCollectionName('bossTimers'))"],
  
  // eventReminders collection
  [/\.collection\('eventReminders'\)/g, ".collection(getCollectionName('eventReminders'))"]
];

let totalReplacements = 0;
replacements.forEach(([regex, replacement]) => {
  const matches = content.match(regex) || [];
  if (matches.length > 0) {
    content = content.replace(regex, replacement);
    totalReplacements += matches.length;
    console.log(`✅ Replaced ${matches.length} occurrences of ${regex.source}`);
  }
});

fs.writeFileSync(filePath, content, 'utf8');
console.log(`\n✅ Total replacements: ${totalReplacements}`);
console.log('Done! All collection references now use getCollectionName()');
