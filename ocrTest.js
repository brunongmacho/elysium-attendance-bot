const Tesseract = require('tesseract.js');
const levenshtein = require('fast-levenshtein');
const path = require('path');

const imagePath = path.join(__dirname, 'screenshot.png');

// Set tessdata folder
process.env.TESSDATA_PREFIX = path.join(__dirname, 'tessdata') + '/';

// List of member names
const memberList = [
  "Goblok","ans2pid","Draxiimov","Jalo","Hesucrypto","Inihaw","AmielJohn","Batghost",
  "ShionXT","LXRDGRIM","Iguro","zadaku","Azryth","Daleee","Munchyy","Seoo","Maria",
  "Gehrmann","Byakko","M1ssy","Lyn","Yodessi","Wandote","Fever","EoriuX","MOTHRA",
  "Hercules","Nyegerls","OneCrit","Marsha11","PotatoCheese","ZenP4kTo","CheeseCakee",
  "Ztig","Chunchunmaru","xLunox","Evand3r","BabyDoge","Carrera","CobRa","ICEBLAZE",
  "Snowy","Pinchy","erwarrr","JEBER89","Andrina","Etiksss","Shaneee","IZANAGI",
  "BronnyJames"
];

// Whitelist for OCR
const charWhitelist = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

// Fuzzy matching function
function findClosestMember(ocrText) {
  let closest = null;
  let minDistance = Infinity;
  for (const member of memberList) {
    const distance = levenshtein.get(member.toLowerCase(), ocrText.toLowerCase());
    if (distance < minDistance) {
      minDistance = distance;
      closest = member;
    }
  }
  // Adjust threshold if OCR is noisy
  return minDistance <= 2 ? closest : null;
}

// Run OCR on full screenshot
Tesseract.recognize(imagePath, 'eng+chi_sim', {
  tessedit_char_whitelist: charWhitelist,
  logger: m => console.log(m)
})
.then(({ data: { text } }) => {
  // Step 1: Split text by line AND spaces for aggressive parsing
  const potentialNames = text
    .split(/\n| /)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Step 2: Map to closest member names
  const detectedMembers = potentialNames
    .map(line => findClosestMember(line))
    .filter(name => name !== null);

  // Step 3: Remove duplicates
  const uniqueMembers = [...new Set(detectedMembers)];

  console.log('Detected members:', uniqueMembers);
})
.catch(err => console.error('Error during OCR:', err));
