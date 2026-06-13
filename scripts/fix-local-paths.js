#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const postsPath = path.join(__dirname, '..', 'data', 'posts.json');
const mediaDir = path.join(__dirname, '..', 'media');

const data = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
const files = fs.readdirSync(mediaDir);

let matched = 0;
let missing = 0;

for (const post of data.posts) {
  if (!post.media) continue;
  for (let i = 0; i < post.media.length; i++) {
    const m = post.media[i];
    const base = `${post.id}_${i}`;
    const found = files.find(f => f.startsWith(base + '.'));
    if (found) {
      m.local_path = path.join(mediaDir, found);
      matched++;
    } else {
      missing++;
    }
  }
}

fs.writeFileSync(postsPath, JSON.stringify(data, null, 2));
console.log(`Matched: ${matched}, Missing: ${missing}`);
