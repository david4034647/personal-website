#!/usr/bin/env node
/**
 * Scrape missing media from individual Facebook post pages.
 * Opens each post permalink in a dialog and extracts media URLs,
 * then downloads them immediately while fresh.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { getFacebookCookies } = require('./facebook-auth');

const CONFIG = {
  postsJson: path.join(__dirname, '..', 'data', 'posts.json'),
  mediaDir: path.join(__dirname, '..', 'media'),
  dataDir: path.join(__dirname, '..', 'data'),
  minDelay: 2000,
  maxDelay: 4000,
  downloadTimeout: 30000,
  limit: (() => {
    const arg = process.argv.find(a => a.startsWith('--limit='));
    return arg ? parseInt(arg.split('=')[1], 10) : Infinity;
  })(),
};

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = CONFIG.minDelay, max = CONFIG.maxDelay) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getFileExtension(url) {
  try {
    const urlWithoutParams = url.split('?')[0];
    const pathname = new URL(urlWithoutParams).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ext) return ext;
    if (url.includes('.jpg') || url.includes('.jpeg')) return '.jpg';
    if (url.includes('.png')) return '.png';
    if (url.includes('.gif')) return '.gif';
    if (url.includes('.webp')) return '.webp';
    if (url.includes('.mp4')) return '.mp4';
    if (url.includes('.webm')) return '.webm';
    return '.jpg';
  } catch (error) {
    const match = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i);
    if (match) {
      return match[1].toLowerCase() === 'jpeg' ? '.jpg' : `.${match[1].toLowerCase()}`;
    }
    return '.jpg';
  }
}

function loadPosts() {
  const raw = fs.readFileSync(CONFIG.postsJson, 'utf8');
  return JSON.parse(raw);
}

function savePosts(data) {
  fs.writeFileSync(CONFIG.postsJson, JSON.stringify(data, null, 2));
}

function findPostsWithMissingMedia(data) {
  const posts = [];
  for (const post of data.posts) {
    if (!post.media || post.media.length === 0) continue;
    const missingIndexes = [];
    for (let i = 0; i < post.media.length; i++) {
      const m = post.media[i];
      if (!m.cdn_url && !m.local_path) {
        missingIndexes.push(i);
      }
    }
    if (missingIndexes.length > 0) {
      posts.push({ post, missingIndexes });
    }
  }
  return posts;
}

/**
 * Extract media URLs from the current post dialog/page
 */
async function extractMediaUrls(page) {
  return await page.evaluate(() => {
    let container = document.querySelector('[role="dialog"]');
    if (!container) {
      const main = document.querySelector('div[role="main"]');
      container = main || document.body;
    }

    const seen = new Set();
    const images = [];
    container.querySelectorAll('img').forEach(img => {
      const src = img.src;
      if (!src) return;
      if (src.includes('static.xx.fbcdn.net')) return;
      if (!src.includes('scontent') && !src.includes('fbcdn')) return;
      const w = img.naturalWidth || parseInt(img.getAttribute('width')) || 0;
      const h = img.naturalHeight || parseInt(img.getAttribute('height')) || 0;
      if (w > 0 && w < 120) return;
      if (h > 0 && h < 120) return;
      if (!seen.has(src)) {
        seen.add(src);
        images.push({ src, w, h });
      }
    });

    const videos = [];
    container.querySelectorAll('video').forEach(video => {
      const src = video.src || video.querySelector('source')?.src;
      if (src && !seen.has(src)) {
        seen.add(src);
        videos.push({ src, type: 'video' });
      }
    });

    return { images, videos };
  });
}

/**
 * Download a single media file using Node's built-in HTTP client.
 * Fresh Facebook CDN URLs are signed, so a plain GET with browser-like
 * headers is enough and avoids the Puppeteer response.buffer() hang on
 * large video files.
 */
async function downloadMedia(url, filePath, cookieString) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const maxSize = 200 * 1024 * 1024; // 200 MiB safety cap

    const req = client.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,video/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.facebook.com/',
        ...(cookieString ? { 'Cookie': cookieString } : {}),
      },
      timeout: CONFIG.downloadTimeout,
    }, (res) => {
      if (res.statusCode >= 400) {
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        res.resume();
        return;
      }

      const contentLength = parseInt(res.headers['content-length'] || '0', 10);
      if (contentLength && contentLength > maxSize) {
        resolve({ success: false, error: `File too large (${contentLength} bytes)` });
        res.destroy();
        return;
      }

      const file = fs.createWriteStream(filePath);
      let downloaded = 0;
      let finished = false;

      const fail = (message) => {
        if (finished) return;
        finished = true;
        try { file.destroy(); } catch (e) {}
        try { res.destroy(); } catch (e) {}
        try { fs.unlinkSync(filePath); } catch (e) {}
        resolve({ success: false, error: message });
      };

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (downloaded > maxSize) {
          fail(`Download exceeded ${maxSize} bytes`);
          return;
        }
      });

      res.on('error', (err) => fail(err.message));
      res.on('aborted', () => fail('Response aborted'));
      res.on('timeout', () => fail('Response timeout'));

      file.on('error', (err) => fail(err.message));
      file.on('finish', () => {
        if (finished) return;
        finished = true;
        resolve({ success: true, size: downloaded });
      });

      res.pipe(file);
    });

    req.on('error', (err) => {
      try { fs.unlinkSync(filePath); } catch (e) {}
      resolve({ success: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      try { fs.unlinkSync(filePath); } catch (e) {}
      resolve({ success: false, error: 'Request timeout' });
    });
  });
}

async function scrapeMissingMedia() {
  log('Starting missing media scraper...');

  if (!fs.existsSync(CONFIG.mediaDir)) {
    fs.mkdirSync(CONFIG.mediaDir, { recursive: true });
  }

  log('Loading posts.json...');
  const data = loadPosts();
  let postsWithMissing = findPostsWithMissingMedia(data);
  if (CONFIG.limit && CONFIG.limit < postsWithMissing.length) {
    postsWithMissing = postsWithMissing.slice(0, CONFIG.limit);
    log(`Limiting run to first ${postsWithMissing.length} posts with missing media`);
  }
  log(`Found ${postsWithMissing.length} posts with missing media`);

  log('Extracting Facebook cookies from Chrome...');
  const cookies = await getFacebookCookies();
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  log(`Found cookies: ${cookies.map(c => c.name).join(', ')}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  });
  await page.setCookie(...cookies);

  let totalDownloaded = 0;
  let totalFailed = 0;
  let postsProcessed = 0;

  try {
    for (const { post, missingIndexes } of postsWithMissing) {
      postsProcessed++;
      const postUrl = `https://www.facebook.com/david.dai.1213/posts/${post.id}`;
      log(`\n[${postsProcessed}/${postsWithMissing.length}] Opening post ${post.id}`);

      try {
        await page.goto(postUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 90000,
        });
        await sleep(randomDelay(2500, 4000));

        const { images, videos } = await extractMediaUrls(page);
        const allMedia = [
          ...images.map(img => ({ type: 'image', url: img.src })),
          ...videos.map(v => ({ type: 'video', url: v.src })),
        ];

        log(`  Found ${allMedia.length} media items in dialog`);

        // Try to match extracted URLs to missing slots
        for (let i = 0; i < missingIndexes.length && i < allMedia.length; i++) {
          const mediaIndex = missingIndexes[i];
          const mediaItem = post.media[mediaIndex];
          const mediaInfo = allMedia[i];

          // Update original_url with fresh URL
          mediaItem.original_url = mediaInfo.url;

          const ext = getFileExtension(mediaInfo.url);
          const filename = `${post.id}_${mediaIndex}${ext}`;
          const filePath = path.join(CONFIG.mediaDir, filename);

          if (fs.existsSync(filePath)) {
            mediaItem.local_path = filePath;
            log(`  ✓ File already exists: ${filename}`);
            totalDownloaded++;
            continue;
          }

          log(`  Downloading ${mediaInfo.type} ${i + 1}/${missingIndexes.length}...`);
          const result = await downloadMedia(mediaInfo.url, filePath, cookieString);

          if (result.success) {
            mediaItem.local_path = filePath;
            totalDownloaded++;
            log(`    ✓ Saved ${filename} (${result.size} bytes)`);
          } else {
            totalFailed++;
            log(`    ✗ Failed: ${result.error}`);
          }

          await sleep(randomDelay(500, 1000));
        }

        savePosts(data);
      } catch (error) {
        log(`  Error processing post ${post.id}: ${error.message}`);
      }

      await sleep(randomDelay());
    }
  } finally {
    await browser.close();
  }

  log(`\nScraping complete.`);
  log(`Posts processed: ${postsProcessed}`);
  log(`Downloaded: ${totalDownloaded}, Failed: ${totalFailed}`);
}

scrapeMissingMedia().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
