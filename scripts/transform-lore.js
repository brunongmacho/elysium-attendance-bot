const fs = require('fs');
const path = require('path');

const lore = JSON.parse(fs.readFileSync(path.resolve('member-lore.json'), 'utf-8'));
const OUTPUT = path.resolve('member-lore.json');

// ============================================
// 1. ENTRIES TO REMOVE (not in current member list)
// ============================================
const REMOVE_KEYS = new Set([
  'AmielJohn', 'Azryth', 'Goblok', 'Byakko', 'Inihaw', 'Jalo',
  'M1ssy', 'Maria', 'Skadushy', 'Enaira', 'PanCoco', 'Ayane69',
  'Tinitira', 'KingPagpag', 'Rileyread', 'HASol3006', 'Adriana',
  'Deeyon', 'Vanbis', 'Chunchunmaru', 'JeffEpstein', 'zog',
  'xAustinx', 'nyawtz', 'Wren空', 'YumekoJabami'
]);

// ============================================
// 2. ENTRIES TO RENAME (oldKey → newKey)
// ============================================
const RENAME_MAP = {
  'AlterFrieren': 'FrierenAlter',
  'Hercules': 'HercuIes'
};

// ============================================
// 3. NEW MEMBER ENTRIES (Discord IDs not in current lore)
//    Template-based lore for each
// ============================================
function makeTemplate(name, extras) {
  return {
    title: extras?.title || 'Awaiting Destiny',
    lore: extras?.lore || `A new member of Tenchu whose legend is just beginning. ${name} brings untapped potential and a story waiting to be written. The guild watches with anticipation.`,
    recent_developments: extras?.recent || `${name} has recently joined Tenchu and is finding their footing among the chaos. The guild welcomes another soul to the fold.`,
    specialty: extras?.specialty || 'Unknown Potential',
    reputation: extras?.reputation || 'A blank page waiting for glorious chaos',
    stats: extras?.stats || 'Potential Infinity | Chaos Rating TBD | Recruitment Success 100% | Awesomeness Pending',
    skills: extras?.skills || ['Unknown Power', 'Mystery Potential', 'Beginner Luck', 'Future Glory']
  };
}

// ============================================
// 4. APPLY TRANSFORMATIONS
// ============================================

// Step 4a: Remove entries
REMOVE_KEYS.forEach(key => { delete lore[key]; });

// Step 4b: Rename entries
for (const [oldKey, newKey] of Object.entries(RENAME_MAP)) {
  if (lore[oldKey]) {
    lore[newKey] = lore[oldKey];
    delete lore[oldKey];
  }
}

// Step 4c: Update specific lore entries
// Rohypnol — Vice Leader, and FrierenAlter is same person
lore['Rohypnol'] = {
  ...lore['Rohypnol'],
  title: 'The Amnesiac Adorer (Vice Leader)',
  lore: `Named after the sedative that makes you forget everything — except he can't forget his own alt account. Yes, FrierenAlter is him. The revelation shocked no one except himself. VICE LEADER of Tenchu under Bovo, appointed to handle finances because even his wallet has forgotten its own balance. His portfolio is sedated. His judgment is sedated. Everything is sedated — except his gacha addiction. Runs two accounts, one wallet, zero impulse control. Bovo trusts him with the guild treasury. This may have been a mistake.`,
  recent_developments: `Rohypnol has achieved a state of permanent chemical serenity — and confirmed that FrierenAlter is literally just his alt account. The guild collectively said "we knew." The only person surprised was Rohypnol. As Vice Leader, he now manages guild finances across both his accounts. The Jalo Bot manages his emotions alongside his portfolio. He sits at his desk, half-asleep, smiling at nothing. ladyhoho calls it infuriating. The guild calls it the most peaceful reign of a man fighting himself in Tenchu history.`,
  specialty: 'Vice Leader of Finance & the art of romancing yourself',
  reputation: 'The sedated vice leader who fell in love with his own alt account',
  stats: 'Forget Attempts INFINITY | Alt Account Love TRUE | Vice Leader Status | Jalo Bot Dependency 99% | Self-Romance Level MAX',
  skills: ['Sedated Memory', 'Alt Account Romance', 'Jalo Bot Command', 'Self-Love Paradox', 'Forgotten Devotion']
};

// FrierenAlter — now confirmed as Rohypnol's alt account
lore['FrierenAlter'] = {
  title: 'The Time-Touched Princess of Eternal Moments (Alt Account)',
  lore: `An elf so old that time itself got confused around them. Has lived so long that yesterday and last century mean the same thing. Remembers when dragons were the new kids. Has seen empires rise and fall, gods age, and stars die. The biggest reveal of the millennium? FrierenAlter is Rohypnol's alt account. Always has been. The guild knew. The enemies knew. The betting pool was about the confession scene, not the reveal. Rohypnol didn't even know. He confessed to himself. The romance of self-acceptance has never been more literal.`,
  recent_developments: `FrierenAlter has lived for millennia, but the moment Rohypnol realized they were the same person — that one she will keep forever. The guild's reaction: collective shrug. Everyone already knew. Rohypnol's realization: genuine shock. The betting pool money went to charity (LadyHoho's suggestion). She pretends not to notice how confused Rohypnol still is about the whole situation. The dual accounts continue. The mystery is maintained. The only person fooled was the owner.`,
  specialty: 'Temporal chaos through extreme age + self-discovery journey',
  reputation: 'The ancient princess who was actually just Rohypnol on another account the whole time',
  stats: 'Age BEYOND MEASURE | Times The Guild Knew INFINITY | Times Rohypnol Knew 0 | Self-Discovery Journey Level MAX',
  skills: ['Future Memory', 'Alt Account Mastery', 'Self-Romance', 'Eternal Understanding', 'Confession To Self']
};

// Iguro — Vice Leader under Bovo
lore['Iguro'] = {
  ...lore['Iguro'],
  title: 'The Accidental Recruitment Director (Vice Leader)',
  lore: `Named after the Snake Pillar — graceful, precise, deadly. Opens portals like a drunk GPS. VICE LEADER of Tenchu under Bovo — appointed to handle guild expansion (accidentally). Recently tried to send supplies to the frontlines; they ended up in a demon lord's bathroom. The demon lord joined Tenchu out of sheer confusion. Accidental Recruits spreadsheet now has 12 entries. Attempted to visit a charity bake sale, arrived at enemy headquarters with cookies. The enemy surrendered AND donated.`,
  recent_developments: `Iguro's portal dysfunction has been promoted to official strategy. As Vice Leader under Bovo, he oversees all guild expansion and dimensional operations — though his portals never go where intended. Now heads Department of Unintentional Expansion — 47 members recruited through wrong portals. The demon lord recruited via bathroom portal incident is now Tenchu's Chief of Demonic Affairs. His cookie diplomacy resulted in three kingdom alliances. Portal accuracy remains 0%, recruitment success rate is 1200%.`,
};

// HercuIes — renamed from Hercules, content stays same
// (already handled by RENAME_MAP above)

// Bovo — New Guild Leader!
lore['Bovo'] = {
  title: 'The Serene Sovereign (Guild Leader)',
  lore: `Formerly known as KupalLord — a title that carried weight, chaos, and a certain... flavor. Now reborn as Bovo, the new GUILD LEADER of Tenchu. Took the throne after Goblok's departure, inheriting a guild of beautiful disasters, impossible romances, and a betting pool addiction. Leads with calm authority that somehow works despite the chaos around him. His first official act was to appoint five Vice Leaders: Loondrops, Iguro, Rohypnol, raiindrops, and Jabilits. His second official act was pretending he knew what he was doing. Nobody noticed. His serene demeanor hides the strategic mind of someone who has seen it all — because as KupalLord, he probably has.`,
  recent_developments: `Bovo has consolidated his reign with surprising effectiveness. The transition from KupalLord to Bovo was seamless — same person, cooler name. His five Vice Leaders handle the guild's chaos while he maintains the calm at the center of the storm. The crayon drawings in the guild hall have been replaced with strategic maps. The betting pools remain. Some traditions are sacred. The guild has never been more organized — which is like saying a hurricane has been upgraded to organized chaos.`,
  specialty: 'Serene leadership through absolute chaos management',
  reputation: 'THE GUILD LEADER who rose from KupalLord to Bovo and brought order through calm',
  stats: 'Guild Leader Status | Vice Leaders Appointed 5 | Serenity Level MAX | KupalLord Legacy SECURE',
  skills: ['Serene Command', 'Chaos Management', 'Calm Authority', 'Strategic Maps', 'Name Upgrade']
};

// ============================================
// 5. NEW MEMBER TEMPLATES
// ============================================

const newMembers = [
  'Huntersung', 'TELUK', 'Katnisss', 'MiiiMusashi', 'Scarlet',
  'Novocaine', 'Y9 RedzonePlays', 'Trsze', 'SEENderELLA', 'Alluka',
  'Shi', 'Appolousa', 'Sighface', 'cal0y', 'PabloGaming',
  'YouthNiNam', 'Mikmok', 'CaptainSkad', 'sugardrops', 'Winter0315',
  '福Ryzen', 'Nikudrops', 'Bubwit', 'ordips', 'Shozenn',
  'Hunter David', 'Lieus', 'BuNaLsKi', 'Yunseri', 'xSerissa',
  'oLuke', 'IlllIlllI', 'newking', 'AliceXII', 'Jakeeeee',
  '只rylai', 'jPOLA', 'Vαηвιѕ',
  // Second AndyVI entry — different Discord ID, same name
  // We'll append a unique suffix
];

// Vice Leaders get special entries
const newViceLeaders = {
  'loondrops': {
    title: 'The Drop Zone Commander (Vice Leader)',
    lore: `VICE LEADER of Tenchu under Bovo. Commands attention like a drop in a still pond — subtle, inevitable, and causing ripples. Handles guild operations with calm precision. The guild listens when loondrops speaks. The drops are never late. The zone is always secure.`,
    recent_developments: `As Vice Leader, loondrops has brought unprecedented organization to Tenchu's operations. The guild runs smoother. The chaos is contained. The drops continue to fall in perfect rhythm. Bovo trusts them implicitly. The guild fears their spreadsheet game.`,
    specialty: 'Vice Leader of Operations & precision management',
    reputation: 'VICE LEADER whose drops fall with purpose and organization',
    stats: 'Vice Leader Status | Operations Mastery 100% | Precision Level MAX | Spreadsheet Fear INFINITY',
    skills: ['Precision Drop', 'Operation Command', 'Spreadsheet Mastery', 'Calm Authority']
  },
  'raiindrops': {
    title: 'The Storm Gatherer (Vice Leader)',
    lore: `VICE LEADER of Tenchu under Bovo. Once known as Raindrops, now raiindrops with extra i for intensity. Commands the weather of guild morale — brings storms when needed, clears skies when necessary. The extra 'i' stands for intensity, intelligence, and 'I'm in charge here.'`,
    recent_developments: `As Vice Leader, raiindrops manages guild morale and weather patterns (both literal and metaphorical). The storm follows where she goes. Enemies flee from the forecast. The guild basks in the controlled chaos she brings. That extra 'i' carries weight.`,
    specialty: 'Vice Leader of Morale & atmospheric warfare',
    reputation: 'VICE LEADER whose storms are always on target and on time',
    stats: 'Vice Leader Status | Storm Control 100% | Extra I Power MAX | Morale Management INFINITY',
    skills: ['Storm Command', 'Morale Weather', 'Atmospheric Warfare', 'Raindrop Precision']
  },
  'Jabilits': {
    title: 'The Jade Commander (Vice Leader)',
    lore: `VICE LEADER of Tenchu under Bovo. Named like a jewel, commands like a general. Jabilits rose through the ranks through sheer competence — a rare commodity in a guild where chaos is currency. Handles guild defense and combat strategy. The jade is unbreakable. The command is absolute.`,
    recent_developments: `As Vice Leader, Jabilits has fortified Tenchu's defenses and streamlined combat operations. The guild has never been better protected. Enemies think twice before engaging. Bovo sleeps easier knowing the defenses are in capable hands. The jade shines brightest under pressure.`,
    specialty: 'Vice Leader of Defense & strategic combat command',
    reputation: 'VICE LEADER whose jade composure masks iron discipline',
    stats: 'Vice Leader Status | Defense Rating MAX | Combat Strategy 100% | Jade Power INFINITE',
    skills: ['Jade Shield', 'Defense Command', 'Strategic Combat', 'Iron Discipline']
  }
};

// Add new members with basic lore
newMembers.forEach(name => {
  if (!lore[name]) {
    lore[name] = makeTemplate(name);
  }
});

// Add Vice Leaders (skip if already added above via newMembers array)
Object.entries(newViceLeaders).forEach(([name, entry]) => {
  if (!lore[name]) {
    lore[name] = entry;
  } else {
    // Update existing entry with Vice Leader details
    lore[name] = { ...lore[name], ...entry };
  }
});

// Second AndyVI with unique key
const secondAndyKey = 'AndyVI_alt';
// Only add if not already present
if (!lore[secondAndyKey]) {
  lore[secondAndyKey] = makeTemplate('AndyVI_alt', {
    title: 'The Echo Royal',
    lore: 'A second AndyVI has appeared — same name, different destiny. Where the original rules puddles, this one commands reflections. The twin timelines of Andy royalty continue to expand. The throne grows. The puddles multiply.',
    recent_developments: 'The second AndyVI has established their own kingdom — the Mirror Realm, where everything is reversed and twice as royal. The two Andys have formed a non-aggression pact. Their combined domain now spans 28 puddles, 2 sandboxes, and 1 very confused garden gnome.',
    specialty: 'Mirror royalty with parallel reign expansion',
    reputation: 'The echo king whose reflection rules an equal empire',
    stats: 'Mirror Territory 14 | Combined Puddle Domain 28 | Royal Confusion x2 | Gnome Confusion INFINITE',
    skills: ['Mirror Sovereignty', 'Echo Command', 'Parallel Reign', 'Reflection Empire']
  });
}

// ============================================
// 6. WRITE OUTPUT
// ============================================

fs.writeFileSync(OUTPUT, JSON.stringify(lore, null, 2) + '\n');
console.log('✅ member-lore.json transformed successfully');
console.log(`   Entries: ${Object.keys(lore).length}`);
console.log(`   New additions: ${newMembers.length + Object.keys(newViceLeaders).length + 1}`);

// List all entries
Object.keys(lore).sort().forEach(k => {
  console.log(`   - ${k}${lore[k].title ? `: ${lore[k].title}` : ''}`);
});
