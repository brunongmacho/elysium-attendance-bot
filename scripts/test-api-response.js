/**
 * Test what the Google Apps Script API is actually returning
 */
const fs = require('fs');
const path = require('path');

// Load config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

async function testAPI() {
  console.log('Testing Google Apps Script API...');
  console.log('URL:', config.sheet_webhook_url);
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

    console.log('Response Status:', response.status);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('');

    const contentType = response.headers.get('content-type');
    console.log('Content-Type:', contentType);
    console.log('');

    const text = await response.text();
    console.log('Response Body (first 500 chars):');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(text.substring(0, 500));
    console.log('═══════════════════════════════════════════════════════════════');

    if (contentType && contentType.includes('application/json')) {
      console.log('');
      console.log('Parsed JSON:');
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2).substring(0, 1000));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAPI();
