#!/usr/bin/env node

/**
 * Fetch media dimensions from Qiniu and update data/posts.json.
 *
 * For images: GET {cdn_url}?imageInfo
 * For videos: GET {cdn_url}?avinfo and read the first video stream.
 *
 * Existing width/height values are skipped so the script is idempotent.
 * Runs with a concurrency limit to avoid hammering the CDN.
 */

const fs = require('fs');
const path = require('path');

const POSTS_PATH = path.join(__dirname, '..', 'data', 'posts.json');
const CONCURRENCY = 10;
const RETRIES = 2;
const TIMEOUT_MS = 15000;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchImageDimensions(cdnUrl, attempt = 0) {
  const res = await fetchWithTimeout(`${cdnUrl}?imageInfo`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const info = await res.json();
  if (typeof info.width !== 'number' || typeof info.height !== 'number') {
    throw new Error('missing width/height');
  }
  return { width: info.width, height: info.height };
}

async function fetchVideoDimensions(cdnUrl, attempt = 0) {
  const res = await fetchWithTimeout(`${cdnUrl}?avinfo`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const info = await res.json();
  const stream = info.streams?.find(s => s.codec_type === 'video');
  if (!stream || typeof stream.width !== 'number' || typeof stream.height !== 'number') {
    throw new Error('missing video stream dimensions');
  }
  return { width: stream.width, height: stream.height };
}

async function fetchDimensions(item) {
  const cdnUrl = item.cdn_url;
  if (!cdnUrl) {
    throw new Error('no cdn_url');
  }
  if (item.type === 'video') {
    return fetchVideoDimensions(cdnUrl);
  }
  return fetchImageDimensions(cdnUrl);
}

async function fetchWithRetry(item) {
  let lastErr;
  for (let i = 0; i <= RETRIES; i++) {
    try {
      return await fetchDimensions(item);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function runWithConcurrency(items, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function workerLoop() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, workerLoop));
  return results;
}

async function main() {
  const data = readJson(POSTS_PATH);
  const items = [];

  for (const post of data.posts) {
    if (!post.media) continue;
    for (const item of post.media) {
      if (item.width && item.height) continue; // already has dimensions
      if (!item.cdn_url) continue;
      items.push(item);
    }
  }

  console.log(`Fetching dimensions for ${items.length} media items...`);

  let succeeded = 0;
  let failed = 0;

  await runWithConcurrency(items, async (item, idx) => {
    try {
      const dims = await fetchWithRetry(item);
      item.width = dims.width;
      item.height = dims.height;
      succeeded++;
      process.stdout.write(`\r${succeeded}/${items.length} fetched; ${failed} failed`);
    } catch (err) {
      failed++;
      process.stdout.write(`\r${succeeded}/${items.length} fetched; ${failed} failed`);
      console.error(`\nFailed ${item.type} ${item.cdn_url}: ${err.message}`);
    }
  });

  console.log();
  writeJson(POSTS_PATH, data);
  console.log(`Saved ${POSTS_PATH}`);
  console.log(`Success: ${succeeded}, Failed: ${failed}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
