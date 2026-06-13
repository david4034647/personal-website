#!/usr/bin/env node
/**
 * Rebuild posts.json from local media files
 */

const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, '..', 'media');
const POSTS_JSON_PATH = path.join(__dirname, '..', 'data', 'posts.json');

function rebuildPosts() {
    const files = fs.readdirSync(MEDIA_DIR)
        .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.mp4'))
        .sort();

    // Group files by post index
    const postMap = new Map();

    files.forEach(file => {
        // Parse filename: post_{timestamp}_{postIndex}_{mediaIndex}.{ext}
        const match = file.match(/post_(\d+)_(\d+)_(\d+)\.(\w+)/);
        if (match) {
            const [, timestamp, postIndex, mediaIndex, ext] = match;
            const postIdx = parseInt(postIndex);

            if (!postMap.has(postIdx)) {
                postMap.set(postIdx, {
                    id: `post_${postIdx}`,
                    content: '',
                    created_time: null,
                    location: '',
                    media: []
                });
            }

            const post = postMap.get(postIdx);
            post.media.push({
                type: ext === 'mp4' ? 'video' : 'image',
                original_url: '',
                local_path: path.join(MEDIA_DIR, file),
                cdn_url: null
            });
        }
    });

    // Convert map to array and sort by post index
    const posts = Array.from(postMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([_, post]) => post);

    // Add sample content for demonstration
    const sampleContents = [
        '带老妈来曲水兰亭感受下上海洗浴天花板',
        '',
        '每年跨年都印象深刻啊',
        '国内三亚其实也挺好',
        '家里今天26年第一场雪，媳妇说她这里待到位了可以回北欧了',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ''
    ];

    posts.forEach((post, i) => {
        if (sampleContents[i]) {
            post.content = sampleContents[i];
        }
    });

    const result = {
        scraped_at: new Date().toISOString(),
        profile_url: 'https://www.facebook.com/david.dai.1213',
        total_posts: posts.length,
        posts: posts
    };

    fs.writeFileSync(POSTS_JSON_PATH, JSON.stringify(result, null, 2));

    console.log(`Rebuilt posts.json with ${posts.length} posts`);
    console.log(`Total media files: ${files.length}`);

    posts.forEach((post, i) => {
        console.log(`Post ${i}: ${post.media.length} media items`);
    });
}

rebuildPosts();
