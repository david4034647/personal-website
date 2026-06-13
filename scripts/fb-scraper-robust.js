#!/usr/bin/env node
/**
 * Robust Facebook Scraper with auto-login detection
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROFILE_URL = 'https://www.facebook.com/david.dai.1213';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'posts.json');
const TMP_PROFILE = path.join(os.tmpdir(), 'fb-scraper-' + Date.now());

async function scrape() {
  console.log('========================================');
  console.log('Facebook 自动爬取工具 (Robust)');
  console.log('========================================\n');

  fs.mkdirSync(TMP_PROFILE, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1400,900',
      `--user-data-dir=${TMP_PROFILE}`
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // Set longer timeouts
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    console.log('正在打开 Facebook...');

    // Navigate with retry
    let retries = 3;
    while (retries > 0) {
      try {
        await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 5000));
        break;
      } catch (e) {
        retries--;
        if (retries === 0) throw e;
        console.log('Retrying...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Wait for either login form or posts
    console.log('等待页面加载...');
    await new Promise(r => setTimeout(r, 5000));

    // Check if we're on the profile page with posts
    const hasPosts = await page.evaluate(() => {
      return document.querySelector('[role="article"]') !== null;
    }).catch(() => false);

    if (!hasPosts) {
      console.log('\n⚠️  未检测到动态内容');
      console.log('如果页面显示登录表单，请在浏览器中登录');
      console.log('等待登录中 (最长60秒)...\n');

      // Wait for posts to appear
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5000));

        const nowHasPosts = await page.evaluate(() => {
          return document.querySelector('[role="article"]') !== null;
        }).catch(() => false);

        if (nowHasPosts) {
          console.log('✓ 检测到动态内容！\n');
          await new Promise(r => setTimeout(r, 3000));
          break;
        }

        console.log(`等待中... (${i + 1}/12)`);
      }
    }

    // Start scraping
    console.log('开始爬取动态...\n');

    const posts = [];
    const seenPosts = new Set();
    let scrollCount = 0;
    let noNewCount = 0;

    while (scrollCount < 100 && noNewCount < 8) {
      try {
        const newPosts = await page.evaluate(() => {
          const results = [];
          document.querySelectorAll('[role="article"]').forEach((article, idx) => {
            try {
              if (article.parentElement?.closest('[role="article"]')) return;

              let postId = null;
              const links = article.querySelectorAll('a[href*="/posts/"]');
              for (const link of links) {
                const match = link.href.match(/\/posts\/(\d+)/);
                if (match) { postId = match[1]; break; }
              }
              if (!postId) postId = `post_${idx}_${Date.now().toString(36).slice(-6)}`;

              // Content
              let content = '';
              const sels = ['[data-ad-preview="message"]', 'div[dir="auto"] > span'];
              for (const sel of sels) {
                const el = article.querySelector(sel);
                if (el?.innerText) {
                  const text = el.innerText.trim();
                  if (text.length > content.length) content = text;
                }
              }

              // Timestamp
              let timestamp = null;
              const abbr = article.querySelector('abbr[data-utime]');
              if (abbr) {
                const utime = abbr.getAttribute('data-utime');
                if (utime) timestamp = new Date(parseInt(utime) * 1000).toISOString();
              }

              // Location
              let location = '';
              const locEl = article.querySelector('a[href*="/places/"]');
              if (locEl) location = locEl.innerText.trim();

              // Media
              const media = [];
              const seen = new Set();
              article.querySelectorAll('img[src*="scontent"]').forEach(img => {
                if (img.src && !seen.has(img.src) && !img.src.includes('emoji')) {
                  seen.add(img.src);
                  media.push({
                    type: 'image',
                    original_url: img.src.replace(/\/s\d+x\d+\//, '/'),
                    local_path: null,
                    cdn_url: null
                  });
                }
              });

              if (content || media.length > 0) {
                results.push({ id: postId, content, created_time: timestamp, location, media });
              }
            } catch (e) {}
          });
          return results;
        });

        let added = 0;
        newPosts.forEach(post => {
          const key = `${post.id}_${post.content?.slice(0, 20)}`;
          if (!seenPosts.has(key)) {
            seenPosts.add(key);
            posts.push(post);
            added++;
          }
        });

        if (added === 0) {
          noNewCount++;
        } else {
          noNewCount = 0;
          console.log(`滚动 ${scrollCount + 1}: +${added} 条动态 (总计: ${posts.length})`);
        }

        await page.evaluate(() => window.scrollBy(0, 800));
        await new Promise(r => setTimeout(r, 2000));
        scrollCount++;

      } catch (e) {
        console.log('滚动出错，继续...', e.message);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    console.log(`\n========================================`);
    console.log(`爬取完成!`);
    console.log(`总动态数: ${posts.length}`);
    console.log(`滚动次数: ${scrollCount}`);
    console.log('========================================\n');

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      scraped_at: new Date().toISOString(),
      profile_url: PROFILE_URL,
      total_posts: posts.length,
      posts
    }, null, 2));

    console.log(`✓ 已保存: ${OUTPUT_PATH}`);

    // Match media
    console.log('\n正在匹配本地媒体文件...');
    const mediaDir = path.join(__dirname, '..', 'media');
    if (fs.existsSync(mediaDir)) {
      const files = fs.readdirSync(mediaDir);
      let matched = 0;
      posts.forEach((post, idx) => {
        post.media?.forEach((item, mIdx) => {
          const pattern = `_${idx}_${mIdx}.`;
          const found = files.find(f => f.includes(pattern));
          if (found) {
            item.local_path = path.join(mediaDir, found);
            matched++;
          }
        });
      });
      console.log(`✓ 匹配了 ${matched} 个媒体文件`);
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
        scraped_at: new Date().toISOString(),
        profile_url: PROFILE_URL,
        total_posts: posts.length,
        posts
      }, null, 2));
    }

  } catch (e) {
    console.error('错误:', e.message);
  } finally {
    console.log('\n按 Enter 关闭浏览器...');
    await new Promise(r => process.stdin.once('data', r));
    await browser.close();
    // Cleanup tmp profile
    try { fs.rmSync(TMP_PROFILE, { recursive: true }); } catch {}
  }
}

scrape().catch(console.error);
