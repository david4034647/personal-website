#!/usr/bin/env node
/**
 * Scrape using Chrome user profile (keeps login)
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROFILE_URL = 'https://www.facebook.com/david.dai.1213';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'posts.json');

async function scrape() {
  // Find Chrome user data directory
  let chromeUserData = '';
  const platform = os.platform();

  if (platform === 'darwin') {
    chromeUserData = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
  } else if (platform === 'win32') {
    chromeUserData = path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data');
  } else {
    chromeUserData = path.join(os.homedir(), '.config/google-chrome');
  }

  console.log('Looking for Chrome profile at:', chromeUserData);

  if (!fs.existsSync(chromeUserData)) {
    console.log('Chrome profile not found, creating temporary profile...');
    chromeUserData = undefined;
  }

  // Use a temporary profile directory to avoid conflicts with running Chrome
  const tmpProfileDir = path.join(os.tmpdir(), 'fb-scraper-profile-' + Date.now());
  fs.mkdirSync(tmpProfileDir, { recursive: true });

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=1400,900',
    '--disable-notifications',
    `--user-data-dir=${tmpProfileDir}`
  ];

  console.log('Launching Chrome...');

  const browser = await puppeteer.launch({
    headless: false,
    args: args,
    executablePath: process.env.CHROME_PATH || undefined
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    console.log('Opening Facebook...');
    await page.goto(PROFILE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // Check login
    const isLoggedIn = await page.evaluate(() => {
      return document.querySelector('[role="article"]') !== null ||
             document.querySelector('[aria-label*="主页"]') !== null ||
             !document.querySelector('input[type="password"]');
    });

    if (!isLoggedIn) {
      console.log('Please login in the browser window...');
      console.log('Waiting 60 seconds for login...');

      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const nowLoggedIn = await page.evaluate(() => {
          return document.querySelector('[role="article"]') !== null;
        });
        if (nowLoggedIn) {
          console.log('Logged in detected!');
          break;
        }
      }
    }

    console.log('Starting scrape...\n');

    const posts = [];
    const seenPosts = new Set();
    let scrollCount = 0;
    let noNewCount = 0;

    while (scrollCount < 150 && noNewCount < 8) {
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
            if (!postId) postId = `post_${idx}_${Date.now().toString(36)}`;

            let content = '';
            const selectors = ['[data-ad-preview="message"]', 'div[dir="auto"] > span'];
            for (const sel of selectors) {
              const el = article.querySelector(sel);
              if (el?.innerText) {
                const text = el.innerText.trim();
                if (text.length > content.length) content = text;
              }
            }

            let timestamp = null;
            const timeAbbr = article.querySelector('abbr[data-utime]');
            if (timeAbbr) {
              const utime = timeAbbr.getAttribute('data-utime');
              if (utime) timestamp = new Date(parseInt(utime) * 1000).toISOString();
            }

            let location = '';
            const locEl = article.querySelector('a[href*="/places/"]');
            if (locEl) location = locEl.innerText.trim();

            const media = [];
            const seenUrls = new Set();

            article.querySelectorAll('img[src*="scontent"]').forEach(img => {
              if (img.src && !seenUrls.has(img.src) && !img.src.includes('emoji')) {
                seenUrls.add(img.src);
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
        const key = `${post.id}_${post.content?.substring(0, 20)}`;
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
        console.log(`Scroll ${scrollCount + 1}: +${added} posts (total: ${posts.length})`);
      }

      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise(r => setTimeout(r, 2000));
      scrollCount++;
    }

    console.log(`\nDone! Total posts: ${posts.length}`);

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      scraped_at: new Date().toISOString(),
      profile_url: PROFILE_URL,
      total_posts: posts.length,
      posts
    }, null, 2));

    console.log(`Saved to: ${OUTPUT_PATH}`);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    console.log('\nPress Enter to close browser...');
    await new Promise(r => process.stdin.once('data', r));
    await browser.close();
  }
}

scrape().catch(console.error);
