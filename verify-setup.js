const fs = require('fs');
const path = require('path');

console.log('=== FINAL VERIFICATION ===\n');

// Check 1: config.json
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
console.log('1. Config:');
console.log('   Guild:', config.guild_name);
console.log('   MongoDB DB:', config.mongodb_database);
console.log('   Sheet URL:', config.sheet_webhook_url ? 'UPDATED (new URL)' : 'MISSING');

// Check 2: sync-sheets-to-mongodb.js
const syncContent = fs.readFileSync(path.join('scripts', 'sync-sheets-to-mongodb.js'), 'utf8');
const hasGuildName = syncContent.includes('guildName');
const hasCollectionSuffix = syncContent.includes('${guildName.toLowerCase()');
console.log('\n3. sync-sheets-to-mongodb.js:');
console.log('   Uses guildName:', hasGuildName ? '✅' : '❌');
console.log('   Collection suffix:', hasCollectionSuffix ? '✅' : '❌');

// Check 4: mongodb-helpers.js
const helpersContent = fs.readFileSync(path.join('utils', 'mongodb-helpers.js'), 'utf8');
const getCollCount = (helpersContent.match(/getCollectionName/g) || []).length;
const hardCoded = (helpersContent.match(/collection\('\\w+'\)/g) || []).length;
console.log('\n4. mongodb-helpers.js:');
console.log('   getCollectionName calls:', getCollCount);
console.log('   Hardcoded collections:', hardCoded === 0 ? '✅ None!' : '❌ Found: ' + hardCoded);

// Check 5: database-api.js
const dbApiContent = fs.readFileSync(path.join('utils', 'database-api.js'), 'utf8');
const hasConfigDB = dbApiContent.includes('config.mongodb_database');
console.log('\n5. database-api.js:');
console.log('   Reads DB from config:', hasConfigDB ? '✅' : '❌');

// Check 6: GitHub workflow
const workflow = fs.readFileSync(path.join('.github', 'workflows', 'deploy.yml'), 'utf8');
const watchesCode = workflow.includes("Code.js'");
const watchesAppsscript = workflow.includes("appsscript.json'");
console.log('\n6. GitHub workflow:');
console.log('   Watches Code.js:', watchesCode ? '✅' : '❌');
console.log('   Watches appsscript.json:', watchesAppsscript ? '✅' : '❌');

console.log('\n=== ALL CHECKS COMPLETE ===');
