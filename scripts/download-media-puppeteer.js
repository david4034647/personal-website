#!/usr/bin/env node
/**
 * Download Media using Puppeteer (with Facebook session)
 * Downloads media files using authenticated browser session
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PROFILE_URL = 'https://www.facebook.com/david.dai.1213';
const POSTS_JSON_PATH = path.join(__dirname, '..', 'data', 'posts.json');
const MEDIA_DIR = path.join(__dirname, '..', 'media');

async function downloadMedia() {
  console.log('Launching browser for media download...');

  // Check if posts.json exists
  if (!fs.existsSync(POSTS_JSON_PATH)) {
    console.error(`Error: posts.json not found at ${POSTS_JSON_PATH}`);
    process.exit(1);
  }

  // Read posts data
  let postsData;
  try {
    const data = fs.readFileSync(POSTS_JSON_PATH, 'utf8');
    postsData = JSON.parse(data);
  } catch (error) {
    console.error(`Error reading posts.json: ${error.message}`);
    process.exit(1);
  }

  const posts = postsData.posts || postsData;
  if (!Array.isArray(posts)) {
    console.error('Error: posts should be an array');
    process.exit(1);
  }

  // Ensure media directory exists
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }

  // Collect all media items
  const mediaItems = [];
  for (const post of posts) {
    if (post.media && Array.isArray(post.media)) {
      post.media.forEach((item, index) => {
        const url = item.original_url || item.url;
        if (url) {
          mediaItems.push({
            postId: post.id,
            index: index,
            url: url,
            post: post,
            mediaIndex: index
          });
        }
      });
    }
  }

  console.log(`Found ${mediaItems.length} media items to download\n`);

  if (mediaItems.length === 0) {
    console.log('No media to download');
    return;
  }

  // Launch browser
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
    // Navigate to Facebook to establish session
    console.log('Navigating to Facebook...');
    await page.goto(PROFILE_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('\n========================================');
    console.log('Please make sure you are logged in to Facebook');
    console.log('Waiting 30 seconds...');
    console.log('========================================\n');

    await new Promise(r => setTimeout(r, 30000));

    let downloadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Download each media item
    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      const ext = '.jpg'; // Default to jpg
      const filename = `${item.postId}_${item.index}${ext}`;
      const filePath = path.join(MEDIA_DIR, filename);

      console.log(`[${i + 1}/${mediaItems.length}] ${filename}`);

      // Check if already exists
      if (fs.existsSync(filePath)) {
        console.log('  Skipped: File already exists');
        item.post.media[item.mediaIndex].local_path = filePath;
        skippedCount++;
        continue;
      }

      try {
        // Use browser to download the image
        const result = await page.evaluate(async (url) => {
          try {
            const response = await fetch(url, {
              headers: {
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
              }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            return { error: e.message };
          }
        }, item.url);

        if (result.error) {
          throw new Error(result.error);
        }

        // Convert base64 to buffer and save
        const base64Data = result.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);

        // Update post with local_path
        item.post.media[item.mediaIndex].local_path = filePath;

        const stats = fs.statSync(filePath);
        console.log(`  Downloaded: ${(stats.size / 1024).toFixed(1)} KB`);
        downloadedCount++;

        // Small delay to be respectful
        await new Promise(r => setTimeout(r, 500));

      } catch (error) {
        console.error(`  Failed: ${error.message}`);
        failedCount++;
      }
    }

    // Save updated posts.json
    try {
      fs.writeFileSync(POSTS_JSON_PATH, JSON.stringify(postsData, null, 2));
      console.log('\nUpdated posts.json with local paths');
    } catch (error) {
      console.error(`\nError saving posts.json: ${error.message}`);
    }

    // Print summary
    console.log('\n========== DOWNLOAD SUMMARY ==========');
    console.log(`Total media items: ${mediaItems.length}`);
    console.log(`Downloaded:        ${downloadedCount}`);
    console.log(`Skipped (exists):  ${skippedCount}`);
    console.log(`Failed:            ${failedCount}`);
    console.log('======================================');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

// Run the script
downloadMedia().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});
