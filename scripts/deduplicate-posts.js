#!/usr/bin/env node
/**
 * Deduplicate posts and media
 */

const fs = require('fs');
const path = require('path');

const POSTS_JSON_PATH = path.join(__dirname, '..', 'data', 'posts.json');

function deduplicate() {
  console.log('Loading posts data...');
  const data = JSON.parse(fs.readFileSync(POSTS_JSON_PATH, 'utf8'));
  let posts = data.posts || [];

  console.log(`Original posts: ${posts.length}`);

  // Step 1: Remove duplicate posts based on content similarity
  const uniquePosts = [];
  const seenContent = new Set();

  posts.forEach(post => {
    const contentKey = post.content?.substring(0, 50) || '';
    const mediaCount = post.media?.length || 0;
    const mediaHash = post.media?.map(m => m.original_url?.split('/').pop()?.substring(0, 20)).join(',') || '';

    const key = `${contentKey}_${mediaCount}_${mediaHash}`;

    if (!seenContent.has(key) || contentKey === '') {
      seenContent.add(key);
      uniquePosts.push(post);
    }
  });

  console.log(`After content dedup: ${uniquePosts.length}`);

  // Step 2: Deduplicate media within each post
  uniquePosts.forEach(post => {
    if (!post.media || post.media.length === 0) return;

    const seenUrls = new Set();
    const uniqueMedia = [];

    post.media.forEach(item => {
      const url = item.original_url || '';
      const baseUrl = url.split('?')[0];

      if (baseUrl && !seenUrls.has(baseUrl)) {
        seenUrls.add(baseUrl);
        uniqueMedia.push(item);
      }
    });

    post.media = uniqueMedia;
  });

  // Step 3: Remove posts with no content and no media
  const validPosts = uniquePosts.filter(post => {
    const hasContent = post.content && post.content.trim().length > 0;
    const hasMedia = post.media && post.media.length > 0;
    return hasContent || hasMedia;
  });

  console.log(`After removing empty posts: ${validPosts.length}`);

  // Recalculate media stats
  const totalMedia = validPosts.reduce((sum, p) => sum + (p.media?.length || 0), 0);
  console.log(`Total media items: ${totalMedia}`);

  // Save result
  const result = {
    scraped_at: data.scraped_at,
    profile_url: data.profile_url,
    total_posts: validPosts.length,
    posts: validPosts
  };

  fs.writeFileSync(POSTS_JSON_PATH, JSON.stringify(result, null, 2));
  console.log('\n✓ Deduplication complete!');
}

deduplicate();
