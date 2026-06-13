#!/usr/bin/env node

/**
 * Qiniu Upload Script
 * Uploads media files to Qiniu CDN and updates posts.json with CDN URLs
 */

const qiniu = require('qiniu');
const fs = require('fs');
const path = require('path');

// Load local .env if present (never commit .env)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2];
      }
    });
}

// Qiniu Configuration
const QINIU_CONFIG = {
  accessKey: process.env.QINIU_ACCESS_KEY,
  secretKey: process.env.QINIU_SECRET_KEY,
  bucket: process.env.QINIU_BUCKET || 'gn-rrd',
  domain: process.env.QINIU_DOMAIN || 'https://img.gnso.cn',
  region: process.env.QINIU_REGION || 'z0',
  uploadDir: process.env.QINIU_UPLOAD_DIR || '2026/03/12/david/'
};

function validateConfig() {
  if (!QINIU_CONFIG.accessKey || !QINIU_CONFIG.secretKey) {
    console.error('Error: QINIU_ACCESS_KEY and QINIU_SECRET_KEY must be set.');
    console.error('Create a .env file in the project root (see .env.example).');
    process.exit(1);
  }
}

// File paths
const POSTS_JSON_PATH = path.join(__dirname, '..', 'data', 'posts.json');

// MIME type mapping
const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml'
};

/**
 * Get MIME type based on file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Initialize Qiniu upload token
 */
function getUploadToken(key) {
  const mac = new qiniu.auth.digest.Mac(QINIU_CONFIG.accessKey, QINIU_CONFIG.secretKey);
  const putPolicy = new qiniu.rs.PutPolicy({
    scope: `${QINIU_CONFIG.bucket}:${key}`
  });
  return putPolicy.uploadToken(mac);
}

/**
 * Get region configuration
 */
function getRegion() {
  switch (QINIU_CONFIG.region) {
    case 'z0':
      return qiniu.zone.Zone_z0;
    case 'z1':
      return qiniu.zone.Zone_z1;
    case 'z2':
      return qiniu.zone.Zone_z2;
    case 'na0':
      return qiniu.zone.Zone_na0;
    case 'as0':
      return qiniu.zone.Zone_as0;
    default:
      return qiniu.zone.Zone_z0;
  }
}

/**
 * Upload a single file to Qiniu
 */
function uploadFile(localPath, key) {
  return new Promise((resolve, reject) => {
    const uploadToken = getUploadToken(key);
    const config = new qiniu.conf.Config();
    config.zone = getRegion();

    const formUploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();
    putExtra.mimeType = getMimeType(localPath);

    formUploader.putFile(uploadToken, key, localPath, putExtra, (err, body, info) => {
      if (err) {
        reject(err);
        return;
      }
      if (info.statusCode === 200) {
        resolve(body);
      } else {
        reject(new Error(`Upload failed with status ${info.statusCode}: ${JSON.stringify(body)}`));
      }
    });
  });
}

/**
 * Read posts.json
 */
function readPosts() {
  try {
    if (!fs.existsSync(POSTS_JSON_PATH)) {
      console.log(`posts.json not found at ${POSTS_JSON_PATH}, creating empty structure`);
      return { posts: [] };
    }
    const data = fs.readFileSync(POSTS_JSON_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading posts.json:', error.message);
    return { posts: [] };
  }
}

/**
 * Save posts.json
 */
function savePosts(postsData) {
  try {
    fs.writeFileSync(POSTS_JSON_PATH, JSON.stringify(postsData, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving posts.json:', error.message);
    return false;
  }
}

/**
 * Extract filename from local path
 */
function getFilename(localPath) {
  return path.basename(localPath);
}

/**
 * Generate Qiniu key from filename
 */
function generateKey(filename) {
  return `${QINIU_CONFIG.uploadDir}${filename}`;
}

/**
 * Generate CDN URL from key
 */
function generateCdnUrl(key) {
  return `${QINIU_CONFIG.domain}/${key}`;
}

/**
 * Find all media items with local_path in posts
 */
function findMediaItems(postsData) {
  const mediaItems = [];

  if (!postsData.posts || !Array.isArray(postsData.posts)) {
    return mediaItems;
  }

  postsData.posts.forEach((post, postIndex) => {
    // Check for media array
    if (post.media && Array.isArray(post.media)) {
      post.media.forEach((media, mediaIndex) => {
        if (media.local_path && !media.cdn_url) {
          mediaItems.push({
            postIndex,
            mediaIndex,
            localPath: media.local_path,
            type: media.type || 'unknown',
            media
          });
        }
      });
    }

    // Check for cover image
    if (post.cover && post.cover.local_path && !post.cover.cdn_url) {
      mediaItems.push({
        postIndex,
        cover: true,
        localPath: post.cover.local_path,
        type: 'cover',
        media: post.cover
      });
    }
  });

  return mediaItems;
}

/**
 * Main upload function
 */
async function uploadToQiniu() {
  validateConfig();

  console.log('========================================');
  console.log('Qiniu Upload Script');
  console.log('========================================');
  console.log(`Bucket: ${QINIU_CONFIG.bucket}`);
  console.log(`Domain: ${QINIU_CONFIG.domain}`);
  console.log(`Region: ${QINIU_CONFIG.region}`);
  console.log(`Upload Directory: ${QINIU_CONFIG.uploadDir}`);
  console.log('========================================\n');

  // Read posts.json
  const postsData = readPosts();

  // Find media items to upload
  const mediaItems = findMediaItems(postsData);

  if (mediaItems.length === 0) {
    console.log('No media items with local_path found (or all already have cdn_url).');
    return {
      total: 0,
      uploaded: 0,
      skipped: 0,
      failed: 0,
      results: []
    };
  }

  console.log(`Found ${mediaItems.length} media item(s) to upload\n`);

  const results = {
    total: mediaItems.length,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    details: []
  };

  // Process each media item
  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    const filename = getFilename(item.localPath);
    const key = generateKey(filename);
    const cdnUrl = generateCdnUrl(key);

    console.log(`[${i + 1}/${mediaItems.length}] Processing: ${filename}`);
    console.log(`  Local path: ${item.localPath}`);
    console.log(`  Target key: ${key}`);

    // Check if file exists
    const absolutePath = path.isAbsolute(item.localPath)
      ? item.localPath
      : path.join(__dirname, '..', item.localPath);

    if (!fs.existsSync(absolutePath)) {
      console.log(`  ❌ File not found: ${absolutePath}`);
      results.failed++;
      results.details.push({
        filename,
        status: 'failed',
        error: 'File not found',
        localPath: item.localPath
      });
      console.log('');
      continue;
    }

    // Skip if already has CDN URL
    if (item.media.cdn_url) {
      console.log(`  ⏭️  Skipped (already has CDN URL)`);
      results.skipped++;
      results.details.push({
        filename,
        status: 'skipped',
        cdnUrl: item.media.cdn_url
      });
      console.log('');
      continue;
    }

    try {
      // Upload to Qiniu
      console.log(`  Uploading...`);
      await uploadFile(absolutePath, key);

      // Update media item with CDN URL
      item.media.cdn_url = cdnUrl;
      item.media.qiniu_key = key;

      console.log(`  ✅ Uploaded successfully`);
      console.log(`  CDN URL: ${cdnUrl}`);

      results.uploaded++;
      results.details.push({
        filename,
        status: 'uploaded',
        cdnUrl,
        key
      });
    } catch (error) {
      console.log(`  ❌ Upload failed: ${error.message}`);
      results.failed++;
      results.details.push({
        filename,
        status: 'failed',
        error: error.message,
        localPath: item.localPath
      });
    }

    console.log('');
  }

  // Save updated posts.json
  if (results.uploaded > 0) {
    console.log('Saving updated posts.json...');
    if (savePosts(postsData)) {
      console.log('✅ posts.json saved successfully\n');
    } else {
      console.log('❌ Failed to save posts.json\n');
    }
  }

  // Print summary
  console.log('========================================');
  console.log('Upload Summary');
  console.log('========================================');
  console.log(`Total:   ${results.total}`);
  console.log(`Uploaded: ${results.uploaded}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Failed:  ${results.failed}`);
  console.log('========================================');

  return results;
}

// Run if called directly
if (require.main === module) {
  uploadToQiniu()
    .then(results => {
      if (results.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { uploadToQiniu, QINIU_CONFIG };
