#!/usr/bin/env node
/**
 * Download Facebook Profile Photo
 * Downloads the user's profile photo from Facebook
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROFILE_URL = 'https://www.facebook.com/david.dai.1213';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'profile.jpg');

async function downloadProfilePhoto() {
  console.log('Launching browser to get profile photo...');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1400,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    // Navigate to profile
    console.log('Navigating to profile...');
    await page.goto(PROFILE_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for user to be logged in
    console.log('\n========================================');
    console.log('Please make sure you are logged in to Facebook');
    console.log('Waiting 30 seconds...');
    console.log('========================================\n');

    await new Promise(r => setTimeout(r, 30000));

    // Try to find profile photo
    console.log('Looking for profile photo...');

    const profilePhotoUrl = await page.evaluate(() => {
      // Try multiple selectors for profile photo
      const selectors = [
        'a[href*="photo"] img[src*="scontent"]',
        'div[data-pagelet="ProfileActions"] img',
        'svg image',
        'img[alt*="profile" i]',
        'img[alt*="avatar" i]',
        // Cover photo area profile pic
        'div[role="img"] img',
        // Try to find the largest image near the top
        'img[src*="scontent"][width="168"]',
        'img[src*="scontent"][width="320"]'
      ];

      for (const selector of selectors) {
        const img = document.querySelector(selector);
        if (img && img.src && img.src.includes('fbcdn')) {
          // Try to get high resolution version
          return img.src.replace(/\/s\d+x\d+\//, '/').replace(/\/p\d+x\d+\//, '/');
        }
      }

      // If no specific selector works, find all images and return the largest one near the top
      const images = Array.from(document.querySelectorAll('img'));
      const profileImages = images.filter(img => {
        const rect = img.getBoundingClientRect();
        return img.src &&
               img.src.includes('fbcdn') &&
               rect.top < 400 &&
               rect.width > 100;
      });

      if (profileImages.length > 0) {
        // Sort by size and return the largest
        profileImages.sort((a, b) => (b.width * b.height) - (a.width * a.height));
        return profileImages[0].src.replace(/\/s\d+x\d+\//, '/');
      }

      return null;
    });

    if (!profilePhotoUrl) {
      console.log('Could not find profile photo automatically.');
      console.log('Taking screenshot for debugging...');
      await page.screenshot({ path: path.join(__dirname, '..', 'data', 'debug-profile.png') });
      console.log('Screenshot saved to data/debug-profile.png');

      // Manual extraction
      console.log('\nPlease manually copy the profile image URL from the browser.');
      console.log('Right-click on the profile photo → Copy Image Address');
      console.log('Then run: curl -o data/profile.jpg "[URL]"');

      await browser.close();
      return;
    }

    console.log('Found profile photo URL:', profilePhotoUrl.substring(0, 80) + '...');

    // Download the photo
    console.log('Downloading...');
    const response = await axios({
      method: 'GET',
      url: profilePhotoUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.facebook.com/'
      },
      responseType: 'stream',
      timeout: 30000
    });

    const writer = fs.createWriteStream(OUTPUT_PATH);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', () => {
        const stats = fs.statSync(OUTPUT_PATH);
        console.log(`✅ Profile photo downloaded successfully (${stats.size} bytes)`);
        console.log(`Saved to: ${OUTPUT_PATH}`);
        resolve();
      });
      writer.on('error', reject);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  downloadProfilePhoto().catch(console.error);
}

module.exports = { downloadProfilePhoto };
