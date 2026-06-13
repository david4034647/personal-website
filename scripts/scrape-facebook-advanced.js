#!/usr/bin/env node
/**
 * Advanced Facebook Scraper with Login Session
 * Scrapes all historical posts with proper login handling
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PROFILE_URL = 'https://www.facebook.com/david.dai.1213';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'posts.json');
const MEDIA_DIR = path.join(__dirname, '..', 'media');

// Ensure media directory exists
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

async function scrapeFacebook() {
  console.log('========================================');
  console.log('Facebook Advanced Scraper');
  console.log('========================================\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1400,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Set user agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // Navigate to profile
    console.log('Step 1: Opening Facebook profile...');
    await page.goto(PROFILE_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Check if logged in
    const isLoggedOut = await page.evaluate(() => {
      return document.querySelector('input[name="email"]') !== null ||
             document.querySelector('#email') !== null;
    });

    if (isLoggedOut) {
      console.log('\n⚠️  未检测到登录状态');
      console.log('请在浏览器中手动登录 Facebook');
      console.log('登录完成后，按回车键继续...\n');

      // Wait for user input
      await waitForEnter();

      // Wait for navigation after login
      console.log('等待页面加载...');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 5000));
    } else {
      console.log('✓ 已检测到登录状态');
    }

    // Verify we're on the profile page
    console.log('\nStep 2: 开始爬取动态...');
    console.log('提示：您可以随时按 Ctrl+C 停止爬取\n');

    const posts = [];
    const seenPosts = new Set();
    let scrollCount = 0;
    const maxScrolls = 300;
    let noNewPostsCount = 0;
    const maxNoNewPosts = 15;

    // Scroll and extract posts
    while (scrollCount < maxScrolls && noNewPostsCount < maxNoNewPosts) {
      // Extract posts from current view
      const newPosts = await page.evaluate(() => {
        const results = [];

        // Find all article elements (posts)
        const articles = document.querySelectorAll('[role="article"]');

        articles.forEach((article, index) => {
          try {
            // Skip nested articles (comments)
            if (article.parentElement?.closest('[role="article"]')) return;

            // Extract post ID
            let postId = null;
            const postLinks = article.querySelectorAll('a[href*="/posts/"]');
            for (const link of postLinks) {
              const match = link.href.match(/\/posts\/(\d+)/);
              if (match) {
                postId = match[1];
                break;
              }
            }

            // Alternative: Try to find story_id
            if (!postId) {
              const storyLinks = article.querySelectorAll('a[href*="story_fbid"]');
              for (const link of storyLinks) {
                const match = link.href.match(/story_fbid=(\d+)/);
                if (match) {
                  postId = match[1];
                  break;
                }
              }
            }

            // Generate unique ID if not found
            if (!postId) {
              const contentHash = article.innerText.substring(0, 50);
              postId = `post_${index}_${Date.now()}_${contentHash.replace(/\W/g, '')}`;
            }

            // Extract content - try multiple selectors
            let content = '';
            const contentSelectors = [
              '[data-ad-preview="message"]',
              'div[dir="auto"] > div > span',
              'div[dir="auto"] > span',
              '.userContent',
              '[role="article"] div[data-ad-comet-preview="message"]'
            ];

            for (const selector of contentSelectors) {
              const el = article.querySelector(selector);
              if (el && el.innerText) {
                const text = el.innerText.trim();
                if (text && text.length > content.length) {
                  content = text;
                }
              }
            }

            // Also try finding text content more broadly
            if (!content) {
              const textElements = article.querySelectorAll('div[dir="auto"]');
              for (const el of textElements) {
                const text = el.innerText?.trim();
                if (text && text.length > 10 && !text.includes('赞') && !text.includes('评论')) {
                  content = text;
                  break;
                }
              }
            }

            // Extract timestamp
            let timestamp = null;
            let timestampText = '';

            // Try abbr with data-utime
            const timeAbbr = article.querySelector('abbr[data-utime]');
            if (timeAbbr) {
              const utime = timeAbbr.getAttribute('data-utime');
              if (utime) {
                timestamp = new Date(parseInt(utime) * 1000).toISOString();
              }
            }

            // Try time element
            if (!timestamp) {
              const timeEl = article.querySelector('time');
              if (timeEl) {
                const datetime = timeEl.getAttribute('datetime');
                if (datetime) {
                  timestamp = new Date(datetime).toISOString();
                }
              }
            }

            // Try aria-label on link
            if (!timestamp) {
              const links = article.querySelectorAll('a[role="link"]');
              for (const link of links) {
                const label = link.getAttribute('aria-label');
                if (label && (label.includes('小时') || label.includes('天') || label.includes('月') || label.includes('年') || label.includes('202') || label.includes('201'))) {
                  timestampText = label;
                  break;
                }
              }
            }

            // Extract location
            let location = '';
            const locationSelectors = [
              'a[href*="/pages/"]',
              'a[href*="/places/"]',
              '[data-ad-comet-preview="location"]'
            ];
            for (const selector of locationSelectors) {
              const locEl = article.querySelector(selector);
              if (locEl && locEl.innerText) {
                const locText = locEl.innerText.trim();
                if (locText && locText.length < 50 && !locText.includes('http')) {
                  location = locText;
                  break;
                }
              }
            }

            // Extract media
            const media = [];

            // Images - look for high-res images
            const images = article.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');
            const processedImages = new Set();

            images.forEach(img => {
              let src = img.src;
              if (!src || processedImages.has(src)) return;

              // Skip small images, emojis, icons
              if (src.includes('emoji') || src.includes('icon')) return;
              if (img.width < 100 && img.height < 100) return;

              processedImages.add(src);

              // Try to get high resolution version
              const highResUrl = src
                .replace(/\/s\d+x\d+\//, '/')
                .replace(/\/p\d+x\d+\//, '/')
                .replace(/_s\d+_x/, '_')
                .replace(/_n\./, '_o.')
                .replace(/stp=dst-jpg[^&]*/, '');

              media.push({
                type: 'image',
                original_url: highResUrl,
                local_path: null,
                cdn_url: null
              });
            });

            // Videos
            const videos = article.querySelectorAll('video');
            videos.forEach(video => {
              const src = video.src || video.querySelector('source')?.src;
              if (src && !processedImages.has(src)) {
                processedImages.add(src);
                media.push({
                  type: 'video',
                  original_url: src,
                  local_path: null,
                  cdn_url: null
                });
              }
            });

            // Only add posts with content or media
            if (content || media.length > 0) {
              results.push({
                id: postId,
                content: content,
                created_time: timestamp,
                timestamp_text: timestampText,
                location: location,
                media: media
              });
            }
          } catch (e) {
            // Skip problematic articles
          }
        });

        return results;
      });

      // Add new posts
      let newCount = 0;
      newPosts.forEach(post => {
        const key = `${post.id}_${post.content?.substring(0, 30)}`;
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
        console.log(`滚动 ${scrollCount + 1}: 发现 ${newCount} 条新动态 (总计: ${posts.length})`);
      }

      // Scroll down
      await page.evaluate(() => {
        window.scrollBy(0, 600);
      });

      // Wait for content to load
      await new Promise(r => setTimeout(r, 2500));

      scrollCount++;

      // Progress report every 30 scrolls
      if (scrollCount % 30 === 0) {
        console.log(`\n进度: ${scrollCount} 次滚动, ${posts.length} 条动态已收集`);
        console.log('继续滚动中... (按 Ctrl+C 停止)\n');
        // Save intermediate results
        await saveResults(posts, true);
      }

      // Check if we've reached very old posts (3+ years)
      const oldestPost = posts[posts.length - 1];
      if (oldestPost?.created_time) {
        const postDate = new Date(oldestPost.created_time);
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

        if (postDate < threeYearsAgo && scrollCount > 50) {
          console.log('\n已到达3年前的动态，停止爬取');
          break;
        }
      }
    }

    // Final save
    console.log(`\n========================================`);
    console.log(`爬取完成!`);
    console.log(`总动态数: ${posts.length}`);
    console.log(`总滚动次数: ${scrollCount}`);
    console.log(`========================================\n`);

    await saveResults(posts);

    // Ask if user wants to download media
    console.log('是否立即下载媒体文件? (y/n)');
    const downloadMedia = await waitForInput();

    if (downloadMedia.toLowerCase() === 'y') {
      await downloadMediaFiles(browser, posts);
    }

    return posts;

  } catch (error) {
    console.error('错误:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

async function saveResults(posts, isIntermediate = false) {
  const result = {
    scraped_at: new Date().toISOString(),
    profile_url: PROFILE_URL,
    total_posts: posts.length,
    posts: posts
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));

  if (isIntermediate) {
    console.log(`已保存临时结果: ${OUTPUT_PATH} (${posts.length} 条动态)`);
  } else {
    console.log(`已保存到: ${OUTPUT_PATH}`);
  }
}

async function downloadMediaFiles(browser, posts) {
  console.log('\n开始下载媒体文件...');

  const page = await browser.newPage();
  let downloaded = 0;
  let failed = 0;

  for (const post of posts) {
    if (!post.media || post.media.length === 0) continue;

    for (let i = 0; i < post.media.length; i++) {
      const item = post.media[i];
      if (!item.original_url) continue;

      const ext = item.type === 'video' ? '.mp4' : '.jpg';
      const filename = `${post.id}_${i}${ext}`;
      const filePath = path.join(MEDIA_DIR, filename);

      // Skip if already exists
      if (fs.existsSync(filePath)) {
        item.local_path = filePath;
        continue;
      }

      try {
        // Use browser to download
        const result = await page.evaluate(async (url) => {
          try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const reader = new FileReader();
            return new Promise((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            return { error: e.message };
          }
        }, item.original_url);

        if (result.error) {
          throw new Error(result.error);
        }

        // Convert and save
        const base64Data = result.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);

        item.local_path = filePath;
        downloaded++;
        console.log(`✓ 已下载: ${filename}`);

      } catch (error) {
        failed++;
        console.error(`✗ 下载失败: ${filename} - ${error.message}`);
      }

      // Small delay
      await new Promise(r => setTimeout(r, 300));
    }
  }

  await page.close();

  console.log(`\n媒体下载完成:`);
  console.log(`成功: ${downloaded}`);
  console.log(`失败: ${failed}`);

  // Update posts.json with local paths
  const result = {
    scraped_at: new Date().toISOString(),
    profile_url: PROFILE_URL,
    total_posts: posts.length,
    posts: posts
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
}

function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });
}

function waitForInput() {
  return new Promise(resolve => {
    process.stdin.once('data', data => {
      resolve(data.toString().trim());
    });
  });
}

// Run if called directly
if (require.main === module) {
  scrapeFacebook().catch(console.error);
}

module.exports = { scrapeFacebook };
