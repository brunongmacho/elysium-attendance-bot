/**
 * Fetch Discord Guild Icon
 * Downloads your guild's icon from Discord and saves it as favicon
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Read GUILD_ID from environment or .env.local manually
let GUILD_ID = process.env.DISCORD_GUILD_ID;

// If not in environment, try to read from .env.local manually
if (!GUILD_ID) {
  try {
    const envPath = path.join(__dirname, '..', '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DISCORD_GUILD_ID=(.+)/);
    if (match) {
      GUILD_ID = match[1].trim();
    }
  } catch (err) {
    // Ignore if file doesn't exist
  }
}

if (!GUILD_ID) {
  console.error('❌ DISCORD_GUILD_ID not found in .env.local');
  process.exit(1);
}

async function fetchGuildIcon() {
  try {
    console.log(`Fetching guild info for: ${GUILD_ID}`);

    // Fetch guild information (no auth needed for public guilds)
    const guildUrl = `https://discord.com/api/v10/guilds/${GUILD_ID}/widget.json`;

    https.get(guildUrl, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const guild = JSON.parse(data);

          if (!guild.instant_invite) {
            console.error('❌ Could not fetch guild data. Make sure:');
            console.error('   1. Your DISCORD_GUILD_ID is correct');
            console.error('   2. Server Widget is enabled (Server Settings → Widget)');
            process.exit(1);
          }

          console.log(`✓ Found guild: ${guild.name}`);

          // Extract icon hash from instant_invite URL
          // Format: https://discord.com/api/guilds/{guild_id}/widget.png
          const iconUrl = `https://cdn.discordapp.com/icons/${GUILD_ID}/${guild.instant_invite.split('/').pop().split('.')[0]}.png?size=256`;

          console.log(`Downloading icon from: ${iconUrl}`);

          // Download the icon
          https.get(iconUrl, (iconResponse) => {
            if (iconResponse.statusCode !== 200) {
              console.error(`❌ Failed to download icon: ${iconResponse.statusCode}`);
              process.exit(1);
            }

            const publicDir = path.join(__dirname, '..', 'public');
            const iconPath = path.join(publicDir, 'favicon.ico');
            const pngPath = path.join(publicDir, 'icon.png');

            // Save as PNG
            const pngFile = fs.createWriteStream(pngPath);
            iconResponse.pipe(pngFile);

            pngFile.on('finish', () => {
              pngFile.close();
              console.log(`✓ Saved guild icon to: ${pngPath}`);

              // Also copy as favicon.ico (browsers will accept PNG)
              fs.copyFileSync(pngPath, iconPath);
              console.log(`✓ Created favicon.ico`);

              console.log('\n✅ Guild icon downloaded successfully!');
              console.log('   Restart your dev server to see the new icon.');
            });
          }).on('error', (err) => {
            console.error('❌ Error downloading icon:', err.message);
            process.exit(1);
          });

        } catch (parseError) {
          console.error('❌ Error parsing guild data:', parseError.message);
          process.exit(1);
        }
      });
    }).on('error', (err) => {
      console.error('❌ Error fetching guild info:', err.message);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

console.log('🔍 Fetching Discord guild icon...\n');
fetchGuildIcon();
