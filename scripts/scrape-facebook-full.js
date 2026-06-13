#!/usr/bin/env node
/**
 * Facebook Full History Scraper
 * Scrapes all Facebook posts including historical data with timestamps
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PROFILE_URL = 'https://www.facebook.com/david.dai.1213';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'posts.json');

async function scrapeFacebook() {
  console.log('Launching browser...');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1400,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    // Navigate to profile
    console.log('Navigating to profile...');
    await page.goto(PROFILE_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for user to be logged in
    console.log('\n========================================');
    console.log('Please make sure you are logged in to Facebook');
    console.log('Waiting 30 seconds...');
    console.log('========================================\n');

    await new Promise(r => setTimeout(r, 30000));

    const posts = [];
    const seenPosts = new Set();
    let scrollCount = 0;
    const maxScrolls = 200; // Increased for more history
    let noNewPostsCount = 0;

    console.log('Starting to scrape posts...');

    while (scrollCount < maxScrolls && noNewPostsCount < 10) {
      // Extract posts from current view
      const newPosts = await page.evaluate(() => {
        const results = [];

        // Find all article elements (posts)
        const articles = document.querySelectorAll('[role="article"]');

        articles.forEach(article => {
          try {
            // Skip if already in a nested article
            if (article.parentElement?.closest('[role="article"]')) return;

            // Extract post ID from URL
            let postId = null;
            const links = article.querySelectorAll('a[href*="/posts/"]');
            for (const link of links) {
              const match = link.href.match(/\/posts\/(\d+)/);
              if (match) {
                postId = match[1];
                break;
              }
            }

            // Extract content
            let content = '';
            const contentSelectors = [
              '[data-ad-preview="message"]',
              '[dir="auto"] > span',
              '.userContent',
              '[role="article"] div[dir="auto"]',
              'div[data-ad-preview="message"] span'
            ];

            for (const selector of contentSelectors) {
              const el = article.querySelector(selector);
              if (el && el.innerText) {
                content = el.innerText.trim();
                if (content) break;
              }
            }

            // Extract timestamp - multiple strategies
            let timestamp = null;
            let timestampText = '';

            // Strategy 1: Look for abbr with data-utime
            const timeAbbr = article.querySelector('abbr[data-utime]');
            if (timeAbbr) {
              const utime = timeAbbr.getAttribute('data-utime');
              if (utime) {
                timestamp = new Date(parseInt(utime) * 1000).toISOString();
              }
            }

            // Strategy 2: Look for time element
            if (!timestamp) {
              const timeEl = article.querySelector('time');
              if (timeEl) {
                const datetime = timeEl.getAttribute('datetime');
                if (datetime) {
                  timestamp = new Date(datetime).toISOString();
                }
              }
            }

            // Strategy 3: Look for aria-label on link containing time info
            if (!timestamp) {
              const timeLink = article.querySelector('a[aria-label*=""][href*="/posts/"]');
              if (timeLink) {
                const label = timeLink.getAttribute('aria-label');
                if (label) {
                  timestampText = label;
                }
              }
            }

            // Strategy 4: Look for span with text like "2 hrs", "Yesterday", etc.
            if (!timestamp) {
              const spans = article.querySelectorAll('span');
              for (const span of spans) {
                const text = span.innerText;
                if (/^\d+\s*(hrs?|hours?|days?|weeks?|months?|years?)$/i.test(text) ||
                    /^(Yesterday|Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(text)) {
                  timestampText = text;
                  break;
                }
              }
            }

            // Extract location
            let location = '';
            const locationEl = article.querySelector('a[href*="/pages/"], a[href*="/places/"]');
            if (locationEl) {
              location = locationEl.innerText.trim();
            }

            // Extract media
            const media = [];

            // Images
            const images = article.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');
            images.forEach(img => {
              const src = img.src;
              // Skip small images, profile pics, emojis
              if (src &&
                  !src.includes('emoji') &&
                  !src.includes('icon') &&
                  img.width > 100) {
                // Try to get high resolution version
                const highResUrl = src
                  .replace(/\/s\d+x\d+\//, '/')
                  .replace(/\/p\d+x\d+\//, '/')
                  .replace(/_s\d+_x/, '_')
                  .replace(/_n\./, '_o.');
                media.push({
                  type: 'image',
                  original_url: highResUrl,
                  local_path: null,
                  cdn_url: null
                });
              }
            });

            // Videos
            const videos = article.querySelectorAll('video');
            videos.forEach(video => {
              const src = video.src || video.querySelector('source')?.src;
              if (src) {
                media.push({
                  type: 'video',
                  original_url: src,
                  local_path: null,
                  cdn_url: null
                });
              }
            });

            // Deduplicate media
            const uniqueMedia = [];
            const seenUrls = new Set();
            media.forEach(m => {
              if (!seenUrls.has(m.original_url)) {
                seenUrls.add(m.original_url);
                uniqueMedia.push(m);
              }
            });

            // Create post object
            if (content || uniqueMedia.length > 0 || postId) {
              results.push({
                id: postId || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                content: content,
                created_time: timestamp,
                timestamp_text: timestampText,
                location: location,
                media: uniqueMedia,
                scraped_at: new Date().toISOString()
              });
            }
          } catch (e) {
            console.error('Error extracting post:', e);
          }
        });

        return results;
      });

      // Add new posts
      let newCount = 0;
      newPosts.forEach(post => {
        const key = `${post.id}_${post.content?.substring(0, 50)}`;
        if (!seenPosts.has(key)) {
          seenPosts.add(key);
          posts.push(post);
          newCount++;
        }
      });

      if (newCount === 0) {
        noNewPostsCount++;
      } else {
        noNewPostsCount = 0;
        console.log(`Scroll ${scrollCount + 1}: Found ${newCount} new posts (total: ${posts.length})`);
      }

      // Scroll down
      const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise(r => setTimeout(r, 2000));

      // Check if we've reached the bottom
      const newScrollHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newScrollHeight === scrollHeight) {
        // Try one more scroll after waiting
        await new Promise(r => setTimeout(r, 3000));
        const finalScrollHeight = await page.evaluate(() => document.body.scrollHeight);
        if (finalScrollHeight === scrollHeight) {
          console.log('Reached end of page');
          break;
        }
      }

      scrollCount++;

      // Progress report every 20 scrolls
      if (scrollCount % 20 === 0) {
        console.log(`\nProgress: ${scrollCount} scrolls, ${posts.length} posts collected`);
        // Save intermediate results
        saveResults(posts);
      }
    }

    // Final save
    console.log(`\n========================================`);
    console.log(`Scraping complete!`);
    console.log(`Total posts: ${posts.length}`);
    console.log(`Total scrolls: ${scrollCount}`);
    console.log(`========================================\n`);

    saveResults(posts);

    return posts;

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

function saveResults(posts) {
  const result = {
    scraped_at: new Date().toISOString(),
    profile_url: PROFILE_URL,
    total_posts: posts.length,
    posts: posts
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.log(`Saved to: ${OUTPUT_PATH}`);
}

// Run if called directly
if (require.main === module) {
  scrapeFacebook().catch(console.error);
}

module.exports = { scrapeFacebook };
