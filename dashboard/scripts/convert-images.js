const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputDir = './public/bosses';
const outputDir = './public/bosses-optimized';

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Get all PNG files
const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.png'));

console.log(`Found ${files.length} PNG files to convert...\n`);

// Convert each file
Promise.all(files.map(async (file) => {
  const inputPath = path.join(inputDir, file);
  const outputPathWebP = path.join(outputDir, file.replace('.png', '.webp'));
  const outputPathAvif = path.join(outputDir, file.replace('.png', '.avif'));

  try {
    // Convert to WebP
    await sharp(inputPath)
      .webp({ quality: 85 })
      .toFile(outputPathWebP);

    // Convert to AVIF
    await sharp(inputPath)
      .avif({ quality: 60 })
      .toFile(outputPathAvif);

    // Get file sizes
    const pngSize = fs.statSync(inputPath).size;
    const webpSize = fs.statSync(outputPathWebP).size;
    const avifSize = fs.statSync(outputPathAvif).size;

    console.log(`✓ ${file}`);
    console.log(`  PNG:  ${(pngSize / 1024).toFixed(1)} KB`);
    console.log(`  WebP: ${(webpSize / 1024).toFixed(1)} KB (${((1 - webpSize/pngSize) * 100).toFixed(0)}% smaller)`);
    console.log(`  AVIF: ${(avifSize / 1024).toFixed(1)} KB (${((1 - avifSize/pngSize) * 100).toFixed(0)}% smaller)\n`);
  } catch (error) {
    console.error(`✗ Error converting ${file}:`, error.message);
  }
})).then(() => {
  console.log('Conversion complete!');
  console.log(`\nOptimized images saved to: ${outputDir}`);
  console.log('\nNext steps:');
  console.log('1. Review the optimized images in public/bosses-optimized/');
  console.log('2. If satisfied, replace originals:');
  console.log('   rm public/bosses/*.png');
  console.log('   mv public/bosses-optimized/*.webp public/bosses/');
  console.log('3. Update BossCard.tsx image extensions from .png to .webp');
});
