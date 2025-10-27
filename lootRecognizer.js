import Tesseract from "tesseract.js";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rarityColors = { Blue: { r: 0, g: 174, b: 239 }, Purple: { r: 163, g: 53, b: 238 }, Orange: { r: 255, g: 128, b: 0 }, Green: { r: 0, g: 255, b: 0 }, Gray: { r: 195, g: 195, b: 195 } };

const getNearestRarity = c => Object.entries(rarityColors).reduce((a, [k, b]) => {
  const d = Math.sqrt((c.r - b.r) ** 2 + (c.g - b.g) ** 2 + (c.b - b.b) ** 2);
  return d < (a[1] || Infinity) ? [k, d] : a;
}, [null, Infinity])[0];

const processImage = async img => {
  const p = `./tmp_${Date.now()}.png`;
  await sharp(img).resize(3000, 3000, { fit: 'inside', withoutEnlargement: true }).normalize().toFile(p);
  const buf = fs.readFileSync(p);
  const res = await Tesseract.recognize(buf, "eng");
  fs.unlinkSync(p);
  return res.data.text;
};

const parseLoots = text => {
  const loots = [];
  text.split("\n").forEach(line => {
    const m = line.match(/acquired\s+(.+?)\s+from/i);
    if (m) loots.push(m[1].trim());
  });
  return loots;
};

const main = async () => {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".png"));
  if (!files.length) { console.log("âš ï¸ No .png files found"); return; }
  
  console.log(`ðŸ“ Found ${files.length} image(s)\n`);
  const allLoots = {};
  
  for (const f of files) {
    console.log(`Processing: ${f}`);
    try {
      const text = await processImage(f);
      allLoots[f] = parseLoots(text);
      console.log(`  âœ“ ${allLoots[f].length} items found\n`);
    } catch (e) {
      console.log(`  âŒ Failed\n`);
    }
  }
  
  console.log("ðŸ“Š SUMMARY");
  Object.entries(allLoots).forEach(([f, l]) => {
    console.log(`\n${f}: ${l.length} items`);
    l.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
  });
  
  fs.writeFileSync("loot_results.json", JSON.stringify(allLoots, null, 2));
  console.log("\nâœ… Saved to loot_results.json");
};

main().catch(e => { console.error("Error:", e); process.exit(1); });