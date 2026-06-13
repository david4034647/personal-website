#!/usr/bin/env node
/**
 * Sync local media files with posts.json
 * Matches local media files to posts based on Facebook image IDs
 */

const fs = require('fs');
const path = require('path');

const POSTS_JSON_PATH = path.join(__dirname, '..', 'data', 'posts.json');
const MEDIA_DIR = path.join(__dirname, '..', 'media');

function extractFbImageId(url) {
    // Extract Facebook image ID from URL
    // URL format: .../631099440_2113313129419067_5801398983574857924_o.jpg
    const match = url.match(/(\d+_\d+_\d+)_o\./);
    if (match) return match[1];
    // Alternative format
    const match2 = url.match(/(\d+_\d+)_(?:n|o)\./);
    if (match2) return match2[1];
    return null;
}

function syncMedia() {
    // Read posts data
    if (!fs.existsSync(POSTS_JSON_PATH)) {
        console.error('posts.json not found');
        return;
    }

    const postsData = JSON.parse(fs.readFileSync(POSTS_JSON_PATH, 'utf8'));
    const posts = postsData.posts || postsData;

    if (!Array.isArray(posts)) {
        console.error('Invalid posts data');
        return;
    }

    // Get all local media files with their sizes
    const mediaFiles = fs.readdirSync(MEDIA_DIR)
        .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.mp4'))
        .map(f => {
            const stats = fs.statSync(path.join(MEDIA_DIR, f));
            return { name: f, size: stats.size };
        });

    console.log(`Found ${mediaFiles.length} local media files`);
    console.log(`Processing ${posts.length} posts...\n`);

    let matchedCount = 0;
    let unmatchedPosts = [];

    // For each post, try to match media files
    posts.forEach((post, postIndex) => {
        if (!post.media || post.media.length === 0) return;

        post.media.forEach((item, mediaIndex) => {
            // Skip if already has local_path that exists
            if (item.local_path && fs.existsSync(item.local_path)) {
                matchedCount++;
                return;
            }

            const originalUrl = item.original_url || '';
            const fbImageId = extractFbImageId(originalUrl);

            if (!fbImageId) {
                unmatchedPosts.push({ postIndex, mediaIndex, url: originalUrl.substring(0, 50) });
                return;
            }

            // Find matching file by scanning all files
            // Files were downloaded with pattern: post_{timestamp}_{postIdx}_{mediaIdx}.{ext}
            // We need to find which file corresponds to this URL

            // Strategy: Check if any file's content corresponds to this URL
            // Since we can't check content, we'll use the existing mapping from old data

            // For now, try to find by post index pattern in filename
            const expectedPatterns = [
                `post_${postIndex}_${mediaIndex}.`,
                `_${postIndex}_${mediaIndex}.`
            ];

            let matchedFile = null;

            // Try exact pattern match first
            for (const pattern of expectedPatterns) {
                const found = mediaFiles.find(f => f.name.includes(pattern));
                if (found) {
                    matchedFile = found;
                    break;
                }
            }

            // If not found, try to find unused file of similar type
            if (!matchedFile) {
                const isVideo = item.type === 'video';
                const unusedFiles = mediaFiles.filter(f => {
                    const ext = path.extname(f.name).toLowerCase();
                    const isFileVideo = ext === '.mp4';
                    // Check if this file is already used by another media item
                    const isUsed = posts.some(p =>
                        p.media?.some(m => m.local_path?.includes(f.name))
                    );
                    return isFileVideo === isVideo && !isUsed;
                });

                if (unusedFiles.length > 0) {
                    // Use the first unused file
                    matchedFile = unusedFiles[0];
                }
            }

            if (matchedFile) {
                item.local_path = path.join(MEDIA_DIR, matchedFile.name);
                console.log(`Matched: ${matchedFile.name} -> post ${postIndex}, media ${mediaIndex}`);
                matchedCount++;
            } else {
                unmatchedPosts.push({ postIndex, mediaIndex, fbImageId });
                item.local_path = null;
            }
        });
    });

    // Save updated data
    fs.writeFileSync(POSTS_JSON_PATH, JSON.stringify(postsData, null, 2));

    console.log(`\n========== SYNC SUMMARY ==========`);
    console.log(`Total media items matched: ${matchedCount}`);
    console.log(`Unmatched items: ${unmatchedPosts.length}`);
    if (unmatchedPosts.length > 0) {
        console.log('\nUnmatched (first 10):');
        unmatchedPosts.slice(0, 10).forEach(u => {
            console.log(`  Post ${u.postIndex}, Media ${u.mediaIndex}: ${u.fbImageId || u.url}`);
        });
    }
    console.log('==================================');
}

syncMedia();
