#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const POSTS_JSON_PATH = path.join(__dirname, '..', 'data', 'posts.json');
const MEDIA_DIR = path.join(__dirname, '..', 'media');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// HTTP headers to mimic a browser request
const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.facebook.com/',
};

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure the media directory exists
 */
function ensureMediaDirectory() {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    console.log(`Created media directory: ${MEDIA_DIR}`);
  }
}

/**
 * Extract file extension from URL, handling Facebook URL parameters
 */
function getFileExtension(url) {
  try {
    // Remove query parameters for extension extraction
    const urlWithoutParams = url.split('?')[0];
    const pathname = new URL(urlWithoutParams).pathname;
    const ext = path.extname(pathname).toLowerCase();

    // Default extensions if none found
    if (!ext) {
      // Try to detect from URL patterns
      if (url.includes('.jpg') || url.includes('.jpeg')) return '.jpg';
      if (url.includes('.png')) return '.png';
      if (url.includes('.gif')) return '.gif';
      if (url.includes('.webp')) return '.webp';
      if (url.includes('.mp4')) return '.mp4';
      if (url.includes('.webm')) return '.webm';
      // Default to jpg for images if no extension found
      return '.jpg';
    }

    return ext;
  } catch (error) {
    // Fallback: extract extension from the URL string
    const match = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i);
    if (match) {
      return match[1].toLowerCase() === 'jpeg' ? '.jpg' : `.${match[1].toLowerCase()}`;
    }
    return '.jpg';
  }
}

/**
 * Download a single media file with retry logic
 */
async function downloadMedia(url, filePath, retryCount = 0) {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      headers: HTTP_HEADERS,
      responseType: 'stream',
      timeout: 30000,
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        // Verify file was written and has content
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          fs.unlinkSync(filePath);
          reject(new Error('Downloaded file is empty'));
        } else {
          resolve();
        }
      });
      writer.on('error', reject);
    });
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`  Retry ${retryCount + 1}/${MAX_RETRIES} for: ${url}`);
      await sleep(RETRY_DELAY_MS * (retryCount + 1));
      return downloadMedia(url, filePath, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Process all media files from posts
 */
async function processMedia() {
  // Check if posts.json exists
  if (!fs.existsSync(POSTS_JSON_PATH)) {
    console.error(`Error: posts.json not found at ${POSTS_JSON_PATH}`);
    process.exit(1);
  }

  // Read and parse posts.json
  let postsData;
  try {
    const data = fs.readFileSync(POSTS_JSON_PATH, 'utf8');
    postsData = JSON.parse(data);
  } catch (error) {
    console.error(`Error reading posts.json: ${error.message}`);
    process.exit(1);
  }

  // Handle both formats: { posts: [...] } or [...]
  let posts;
  if (Array.isArray(postsData)) {
    posts = postsData;
  } else if (postsData.posts && Array.isArray(postsData.posts)) {
    posts = postsData.posts;
  } else {
    console.error('Error: posts.json should contain an array of posts or { posts: [...] }');
    process.exit(1);
  }

  // Ensure media directory exists
  ensureMediaDirectory();

  // Collect all media items to download
  const mediaItems = [];

  for (const post of posts) {
    if (!post.id) {
      console.warn('Warning: Post missing id, skipping');
      continue;
    }

    if (post.media && Array.isArray(post.media)) {
      post.media.forEach((item, index) => {
        const url = item.original_url || item.url || item.cdn_url;
        if (url) {
          mediaItems.push({
            postId: post.id,
            index: index,
            url: url,
            type: item.type || 'image',
            post: post,
            mediaIndex: index,
          });
        }
      });
    }
  }

  console.log(`Found ${mediaItems.length} media items to process\n`);

  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Process each media item
  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    const ext = getFileExtension(item.url);
    const filename = `${item.postId}_${item.index}${ext}`;
    const filePath = path.join(MEDIA_DIR, filename);

    console.log(`[${i + 1}/${mediaItems.length}] Processing: ${filename}`);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      console.log(`  Skipped: File already exists`);
      // Update local_path even if skipped
      item.post.media[item.mediaIndex].local_path = filePath;
      skippedCount++;
      continue;
    }

    try {
      await downloadMedia(item.url, filePath);
      console.log(`  Downloaded: ${filename}`);

      // Update the post with local_path
      item.post.media[item.mediaIndex].local_path = filePath;
      downloadedCount++;
    } catch (error) {
      console.error(`  Failed: ${error.message}`);
      failedCount++;
    }
  }

  // Save updated posts.json
  try {
    // Save in the same format as input
    const outputData = Array.isArray(postsData) ? posts : { ...postsData, posts };
    fs.writeFileSync(POSTS_JSON_PATH, JSON.stringify(outputData, null, 2));
    console.log(`\nUpdated posts.json with local paths`);
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

  if (failedCount > 0) {
    process.exit(1);
  }
}

// Run the script
processMedia().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});
