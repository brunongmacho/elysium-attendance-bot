import Tesseract from "tesseract.js";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rarityColors = { Blue: { r: 0, g: 174, b: 239 }, Purple: { r: 163, g: 53, b: 238 }, Orange: { r: 255, g: 128, b: 0 }, Green: { r: 0, g: 255, b: 0 }, Gray: { r: 195, g: 195, b: 195 } };

const getNearestRarity = c => Object.entries(rarityColors).reduce((a, [k, b]) => {
  const d = Math.sqrt((c.r - b.r) ** 2 + (c.g - b.g) ** 2 + (c.b - b.b) ** 2);
  return d < (a[1] || Infinity) ? [k, d] : a;
}, [null, Infinity])[0];

// Load boss names from boss_points.json
let bossNames = [];
try {
  const bossData = JSON.parse(fs.readFileSync(path.join(__dirname, 'boss_points.json'), 'utf8'));
  bossNames = Object.values(bossData).flatMap(boss => boss.aliases);
} catch (e) {
  console.log("Warning: Could not load boss_points.json, using hardcoded boss list");
  bossNames = [
    "venatus", "viorent", "ego", "clemantis", "livera", "araneo", "undomiel",
    "saphirus", "neutro", "lady dalia", "dalia", "aqueleus", "aquleus", "general",
    "thymele", "amentis", "baron", "braudmore", "milavy", "wannitas", "metus",
    "duplican", "shuliar", "ringor", "roderick", "gareth", "titore", "larba",
    "catena", "auraq", "secreta", "ordo", "asta", "supore", "chaiflock", "benji"
  ];
}

const blacklist = [
  "refining stone",
  "enhancement stone", 
  "homun",
  "accessory refining stone",
  "accessory enhancement stone",
  // Boss core items
  "heart", "core", "soul", "essence",
  ...bossNames
];

const isBlacklisted = item => {
  const lower = item.toLowerCase();
  return blacklist.some(b => lower.includes(b));
};

const processImage = async img => {
  const p = `./tmp_${Date.now()}.png`;
  await sharp(img)
    .resize(3000, 3000, { fit: 'inside', withoutEnlargement: true })
    .normalize()
    .sharpen()
    .gamma(1.2)
    .toFile(p);
  const buf = fs.readFileSync(p);
  const res = await Tesseract.recognize(buf, "eng", {
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
    tessedit_pageseg_mode: Tesseract.PSM.AUTO
  });
  fs.unlinkSync(p);
  return res.data.text;
};

const parseLoots = text => {
  const loots = [];
  text.split("\n").forEach(line => {
    const m = line.match(/acquired\s+(.+?)\s+from/i);
    if (m) {
      let item = m[1].trim();
      
      // Fix common OCR errors
      item = item.replace(/Sione/g, 'Stone');
      item = item.replace(/Bue/g, 'Blue');
      item = item.replace(/V1\s*1c/gi, 'Viorent Heart'); // Fix specific OCR error
      item = item.replace(/\s+/g, ' '); // Normalize spaces
      
      // Skip items that are too short (likely OCR errors)
      if (item.length < 3) return;
      
      if (!isBlacklisted(item)) {
        loots.push(item);
      }
    }
  });
  return loots;
};

const main = async () => {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".png"));
  if (!files.length) { console.log("⚠️ No .png files found"); return; }
  
  console.log(`📊 Found ${files.length} image(s)\n`);
  const allLoots = {};
  const allDropsList = [];
  
  for (const f of files) {
    console.log(`Processing: ${f}`);
    try {
      const text = await processImage(f);
      allLoots[f] = parseLoots(text);
      allDropsList.push(...allLoots[f]);
      console.log(`  ✓ ${allLoots[f].length} items found\n`);
    } catch (e) {
      console.log(`  ✗ Failed\n`);
    }
  }
  
  console.log("📋 SUMMARY BY FILE");
  Object.entries(allLoots).forEach(([f, l]) => {
    console.log(`\n${f}: ${l.length} items`);
    l.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
  });
  
  console.log("\n\n🎁 ALL LOOT DROPS");
  console.log(`Total drops: ${allDropsList.length}\n`);
  allDropsList.forEach((item, i) => {
    console.log(`${i + 1}. ${item}`);
  });
  
  // Create list format separated by file
  let listOutput = `LOOT RESULTS\n`;
  listOutput += `Total screenshots: ${files.length}\n`;
  listOutput += `Total drops: ${allDropsList.length}\n`;
  listOutput += `${'='.repeat(50)}\n\n`;
  
  Object.entries(allLoots).forEach(([f, l]) => {
    listOutput += `${f}\n`;
    listOutput += `${'-'.repeat(f.length)}\n`;
    l.forEach((item, i) => {
      listOutput += `${i + 1}. ${item}\n`;
    });
    listOutput += `\nTotal: ${l.length} items\n\n`;
  });
  
  listOutput += `${'='.repeat(50)}\n`;
  listOutput += `COMPLETE LIST (ALL DROPS)\n`;
  listOutput += `${'='.repeat(50)}\n\n`;
  allDropsList.forEach((item, i) => {
    listOutput += `${i + 1}. ${item}\n`;
  });
  
  fs.writeFileSync("loot_results.txt", listOutput);
  console.log("\n✅ Saved to loot_results.txt");
};

main().catch(e => { console.error("Error:", e); process.exit(1); });