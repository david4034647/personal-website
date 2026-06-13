#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const postsPath = path.join(__dirname, '..', 'data', 'posts.json');
const data = JSON.parse(fs.readFileSync(postsPath, 'utf8'));

let cleared = 0;
let kept = 0;
for (const post of data.posts) {
  if (post.media) {
    for (const m of post.media) {
      if (m.local_path && m.cdn_url) {
        delete m.local_path;
        cleared++;
      } else if (m.local_path && !m.cdn_url) {
        kept++;
      }
    }
  }
  if (post.cover && post.cover.local_path && post.cover.cdn_url) {
    delete post.cover.local_path;
    cleared++;
  }
}

fs.writeFileSync(postsPath, JSON.stringify(data, null, 2));
console.log(`Cleared local_path for ${cleared} items with CDN URL`);
console.log(`Kept local_path for ${kept} items without CDN URL`);
