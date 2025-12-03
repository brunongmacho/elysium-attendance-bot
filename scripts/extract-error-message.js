/**
 * Extract the error message from Google Apps Script HTML error page
 */
const fs = require('fs');
const path = require('path');

// Load config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

async function extractError() {
  console.log('Fetching full error page...');
  console.log('');

  try {
    const response = await fetch(config.sheet_webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getAllWeeklyAttendance',
        forceFresh: true
      })
    });

    const html = await response.text();

    // Extract error message from HTML
    // Google Apps Script error pages have the error in specific div elements

    // Try to find the error message
    const errorMatch = html.match(/<div[^>]*class="errorMessage"[^>]*>(.*?)<\/div>/s);
    const detailsMatch = html.match(/<div[^>]*style="[^"]*font-family:[^"]*"[^>]*>(.*?)<\/div>/s);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('FULL HTML ERROR PAGE:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(html);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

    if (errorMatch) {
      console.log('');
      console.log('ERROR MESSAGE EXTRACTED:');
      console.log('═══════════════════════════════════════════════════════════════');
      // Strip HTML tags
      const errorText = errorMatch[1].replace(/<[^>]+>/g, '').trim();
      console.log(errorText);
      console.log('═══════════════════════════════════════════════════════════════');
    }

    if (detailsMatch) {
      console.log('');
      console.log('ERROR DETAILS:');
      console.log('═══════════════════════════════════════════════════════════════');
      const detailsText = detailsMatch[1].replace(/<[^>]+>/g, '').trim();
      console.log(detailsText);
      console.log('═══════════════════════════════════════════════════════════════');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

extractError();
