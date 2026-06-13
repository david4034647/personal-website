#!/usr/bin/env node
/**
 * Auto Facebook Scraper
 * Automatically extracts posts from an already-logged-in session
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PROFILE_URL = 'https://www.facebook.com/david.dai.1213';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'posts.json');

async function autoScrape() {
  console.log('========================================');
  console.log('Facebook 自动爬取工具');
  console.log('========================================\n');

  console.log('正在启动浏览器...');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1400,900',
      '--disable-notifications'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    console.log('正在打开 Facebook 主页...\n');
    await page.goto(PROFILE_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait a moment for any redirects
    await new Promise(r => setTimeout(r, 3000));

    // Check if logged in
    const isLoggedIn = await page.evaluate(() => {
      // Check for elements that only appear when logged in
      return document.querySelector('[aria-label="主页"]') !== null ||
             document.querySelector('[aria-label="Home"]') !== null ||
             document.querySelector('[role="article"]') !== null;
    });

    if (!isLoggedIn) {
      console.log('⚠️ 未检测到登录状态');
      console.log('请在打开的浏览器中登录 Facebook');
      console.log('脚本将在 60 秒后自动检测登录状态...\n');

      // Wait for login
      let attempts = 0;
      const maxAttempts = 12;

      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));

        const nowLoggedIn = await page.evaluate(() => {
          return document.querySelector('[aria-label="主页"]') !== null ||
                 document.querySelector('[role="article"]') !== null;
        });

        if (nowLoggedIn) {
          console.log('✓ 检测到登录状态！开始爬取...\n');
          break;
        }

        attempts++;
        console.log(`等待登录... (${attempts}/${maxAttempts})`);
      }

      if (attempts >= maxAttempts) {
        console.log('\n✗ 登录超时，请手动运行脚本');
        await browser.close();
        return;
      }
    } else {
      console.log('✓ 已检测到登录状态\n');
    }

    // Start scraping
    console.log('========================================');
    console.log('开始爬取动态...');
    console.log('========================================\n');

    const posts = [];
    const seenPosts = new Set();
    let scrollCount = 0;
    const maxScrolls = 200;
    let noNewPostsCount = 0;

    while (scrollCount < maxScrolls && noNewPostsCount < 10) {
      // Extract visible posts
      const newPosts = await page.evaluate(() => {
        const results = [];
        const articles = document.querySelectorAll('[role="article"]');

        articles.forEach((article, idx) => {
          try {
            // Skip nested articles
            if (article.parentElement?.closest('[role="article"]')) return;

            // Extract post ID
            let postId = null;
            const links = article.querySelectorAll('a[href*="/posts/"]');
            for (const link of links) {
              const match = link.href.match(/\/posts\/(\d+)/);
              if (match) { postId = match[1]; break; }
            }

            if (!postId) {
              postId = `post_${idx}_${Date.now().toString(36)}`;
            }

            // Extract content
            let content = '';
            const selectors = [
              '[data-ad-preview="message"]',
              'div[dir="auto"] > div > span',
              'div[dir="auto"] > span'
            ];

            for (const sel of selectors) {
              const el = article.querySelector(sel);
              if (el?.innerText) {
                const text = el.innerText.trim();
                if (text.length > content.length) content = text;
              }
            }

            // Extract timestamp
            let timestamp = null;
            const timeAbbr = article.querySelector('abbr[data-utime]');
            if (timeAbbr) {
              const utime = timeAbbr.getAttribute('data-utime');
              if (utime) timestamp = new Date(parseInt(utime) * 1000).toISOString();
            }
            if (!timestamp) {
              const timeEl = article.querySelector('time');
              if (timeEl?.getAttribute('datetime')) {
                timestamp = new Date(timeEl.getAttribute('datetime')).toISOString();
              }
            }

            // Extract location
            let location = '';
            const locEl = article.querySelector('a[href*="/places/"]');
            if (locEl) location = locEl.innerText.trim();

            // Extract media
            const media = [];
            const seenUrls = new Set();

            const images = article.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]');
            images.forEach(img => {
              let src = img.src;
              if (!src || seenUrls.has(src)) return;
              if (src.includes('emoji') || src.includes('icon')) return;
              if (img.width < 100 && img.height < 100) return;

              seenUrls.add(src);
              const highRes = src.replace(/\/s\d+x\d+\//, '/').replace(/\/p\d+x\d+\//, '/');
              media.push({
                type: 'image',
                original_url: highRes,
                local_path: null,
                cdn_url: null
              });
            });

            const videos = article.querySelectorAll('video');
            videos.forEach(video => {
              const src = video.src || video.querySelector('source')?.src;
              if (src && !seenUrls.has(src)) {
                seenUrls.add(src);
                media.push({ type: 'video', original_url: src, local_path: null, cdn_url: null });
              }
            });

            if (content || media.length > 0) {
              results.push({ id: postId, content, created_time: timestamp, location, media });
            }
          } catch (e) {}
        });

        return results;
      });

      // Add new posts
      let addedCount = 0;
      newPosts.forEach(post => {
        const key = `${post.id}_${post.content?.substring(0, 20)}`;
        if (!seenPosts.has(key)) {
          seenPosts.add(key);
          posts.push(post);
          addedCount++;
        }
      });

      if (addedCount === 0) {
        noNewPostsCount++;
      } else {
        noNewPostsCount = 0;
        console.log(`滚动 ${scrollCount + 1}: +${addedCount} 条动态 (总计: ${posts.length})`);
      }

      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise(r => setTimeout(r, 2000));

      scrollCount++;

      // Progress report every 30 scrolls
      if (scrollCount % 30 === 0) {
        console.log(`\n>>> 进度: ${scrollCount} 次滚动, ${posts.length} 条动态已收集 <<<\n`);
      }
    }

    // Save results
    console.log('\n========================================');
    console.log('爬取完成!');
    console.log(`总动态数: ${posts.length}`);
    console.log(`总滚动次数: ${scrollCount}`);
    console.log('========================================\n');

    const result = {
      scraped_at: new Date().toISOString(),
      profile_url: PROFILE_URL,
      total_posts: posts.length,
      posts: posts
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
    console.log(`✓ 数据已保存到: ${OUTPUT_PATH}`);

    // Try to match with existing media
    console.log('\n正在匹配本地媒体文件...');
    await matchExistingMedia(posts);

  } catch (error) {
    console.error('错误:', error.message);
  } finally {
    console.log('\n按任意键关闭浏览器...');
    await new Promise(r => process.stdin.once('data', r));
    await browser.close();
  }
}

async function matchExistingMedia(posts) {
  const mediaDir = path.join(__dirname, '..', 'media');
  if (!fs.existsSync(mediaDir)) return;

  const mediaFiles = fs.readdirSync(mediaDir);
  let matched = 0;

  posts.forEach((post, idx) => {
    if (!post.media) return;

    post.media.forEach((item, mIdx) => {
      // Try to find matching file
      const patterns = [
        `_${idx}_${mIdx}.`,
        `post_${idx}_${mIdx}.`
      ];

      for (const pattern of patterns) {
        const found = mediaFiles.find(f => f.includes(pattern));
        if (found) {
          item.local_path = path.join(mediaDir, found);
          matched++;
          break;
        }
      }
    });
  });

  console.log(`✓ 已匹配 ${matched} 个本地媒体文件`);

  // Save updated data
  const output = {
    scraped_at: new Date().toISOString(),
    profile_url: PROFILE_URL,
    total_posts: posts.length,
    posts: posts
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
}

autoScrape().catch(console.error);
