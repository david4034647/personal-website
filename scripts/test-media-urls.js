#!/usr/bin/env node
/**
 * Test: Verify all media URLs referenced in posts.json are loadable.
 *
 * A media item passes if:
 *   - It has a local_path that points to an existing file under media/; OR
 *   - Its remote URL (cdn_url / original_url / url) returns HTTP 200.
 *
 * This test reproduces the issue where Facebook CDN URLs expire and images
 * fail to load on the deployed site.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const POSTS_JSON_PATH = path.join(__dirname, '..', 'data', 'posts.json');
const MEDIA_DIR = path.join(__dirname, '..', 'media');

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.facebook.com/',
};

function loadPosts() {
  const raw = fs.readFileSync(POSTS_JSON_PATH, 'utf8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : data.posts || [];
}

async function checkUrl(url) {
  try {
    const response = await axios({
      method: 'HEAD',
      url,
      headers: HTTP_HEADERS,
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    return response.status;
  } catch (error) {
    return error.code || 'ERROR';
  }
}

async function main() {
  const posts = loadPosts();
  const issues = [];
  let checked = 0;

  for (const post of posts) {
    if (!post.media || !Array.isArray(post.media)) continue;

    for (const item of post.media) {
      checked++;
      const localPath = item.local_path;
      const url = item.cdn_url || item.original_url || item.url;

      if (localPath) {
        const relative = localPath.startsWith('/') ? localPath : path.join(__dirname, '..', localPath);
        const filename = path.basename(localPath);
        const projectPath = path.join(MEDIA_DIR, filename);
        if (fs.existsSync(relative) || fs.existsSync(projectPath)) {
          continue; // local file exists
        }
      }

      if (!url) {
        issues.push({ postId: post.id, reason: 'missing-url', detail: 'no cdn_url/original_url/url and no local file' });
        continue;
      }

      const status = await checkUrl(url);
      if (status !== 200) {
        issues.push({ postId: post.id, url, reason: 'unreachable', status });
      }
    }
  }

  console.log(`\nChecked ${checked} media items.`);
  console.log(`Issues found: ${issues.length}\n`);

  if (issues.length > 0) {
    for (const issue of issues.slice(0, 20)) {
      console.log(`- Post ${issue.postId}: ${issue.reason}${issue.status ? ` (HTTP ${issue.status})` : ''}`);
      if (issue.url) console.log(`  ${issue.url}`);
    }
    if (issues.length > 20) {
      console.log(`\n... and ${issues.length - 20} more.`);
    }
    console.log('\n❌ TEST FAILED: Some media URLs are not loadable.');
    process.exit(1);
  }

  console.log('✅ TEST PASSED: All media items are loadable.');
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
