#!/usr/bin/env node
/**
 * Facebook Profile Scraper
 * Scrapes posts from a Facebook profile, downloads media immediately,
 * and saves to JSON
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { getFacebookCookies } = require('./facebook-auth');

// Configuration
const CONFIG = {
  profileUrl: 'https://www.facebook.com/david.dai.1213',
  dataDir: path.join(__dirname, '..', 'data'),
  mediaDir: path.join(__dirname, '..', 'media'),
  outputFile: path.join(__dirname, '..', 'data', 'posts.json'),
  cutoffDate: new Date('2023-01-01'),
  minDelay: 1500,
  maxDelay: 3500,
  scrollAttempts: 150,
  downloadConcurrency: 3,
};

/**
 * Generate random delay between min and max milliseconds
 */
function randomDelay(min = CONFIG.minDelay, max = CONFIG.maxDelay) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Log with timestamp
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Check if the page requires login
 */
async function checkLoginRequired(page) {
  const loginSelectors = [
    'input[name="email"]',
    'input[name="pass"]',
    '[data-testid="royal_login_form"]',
    'form[action="/login/"]',
  ];

  for (const selector of loginSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await element.evaluate(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        if (isVisible) return true;
      }
    } catch (e) {
      // Continue checking other selectors
    }
  }

  const url = page.url();
  return url.includes('/login') || url.includes('/checkpoint');
}

/**
 * Parse Chinese/Japanese date strings like "4月5日" or "2024年4月5日"
 */
function parseRelativeTime(timeText) {
  if (!timeText) return null;

  const now = new Date();
  const text = timeText.toLowerCase().trim();

  // Just now variants
  if (/刚刚|just now|今|now/i.test(text)) {
    return now;
  }

  // "X minutes/hours/days ago" style (English)
  const agoMatch = text.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/);
  if (agoMatch) {
    const value = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2];
    const date = new Date(now);
    switch (unit) {
      case 'minute': date.setMinutes(date.getMinutes() - value); break;
      case 'hour': date.setHours(date.getHours() - value); break;
      case 'day': date.setDate(date.getDate() - value); break;
      case 'week': date.setDate(date.getDate() - value * 7); break;
      case 'month': date.setMonth(date.getMonth() - value); break;
      case 'year': date.setFullYear(date.getFullYear() - value); break;
    }
    return date;
  }

  // Chinese "X分钟前", "X小时前", "X天前"
  const cnAgoMatch = text.match(/(\d+)\s*(分钟|小时|天|周|星期|月|年)前/);
  if (cnAgoMatch) {
    const value = parseInt(cnAgoMatch[1], 10);
    const unit = cnAgoMatch[2];
    const date = new Date(now);
    if (unit === '分钟') date.setMinutes(date.getMinutes() - value);
    else if (unit === '小时') date.setHours(date.getHours() - value);
    else if (unit === '天') date.setDate(date.getDate() - value);
    else if (unit === '周' || unit === '星期') date.setDate(date.getDate() - value * 7);
    else if (unit === '月') date.setMonth(date.getMonth() - value);
    else if (unit === '年') date.setFullYear(date.getFullYear() - value);
    return date;
  }

  // Absolute Chinese date: "2024年4月5日" or "4月5日"
  const cnDateMatch = text.match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (cnDateMatch) {
    const year = cnDateMatch[1] ? parseInt(cnDateMatch[1], 10) : now.getFullYear();
    const month = parseInt(cnDateMatch[2], 10) - 1;
    const day = parseInt(cnDateMatch[3], 10);
    const candidate = new Date(year, month, day);
    // If inferred year is in the future, assume last year
    if (candidate > now && !cnDateMatch[1]) {
      candidate.setFullYear(year - 1);
    }
    return candidate;
  }

  // English absolute dates
  const enDateMatch = text.match(/([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?/);
  if (enDateMatch) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const month = monthNames.findIndex(m => enDateMatch[1].toLowerCase().startsWith(m));
    const day = parseInt(enDateMatch[2], 10);
    const year = enDateMatch[3] ? parseInt(enDateMatch[3], 10) : now.getFullYear();
    if (month !== -1) {
      return new Date(year, month, day);
    }
  }

  return null;
}

/**
 * Extract file extension from URL
 */
function getFileExtension(url) {
  try {
    const urlWithoutParams = url.split('?')[0];
    const pathname = new URL(urlWithoutParams).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ext) return ext;
    if (url.includes('.jpg') || url.includes('.jpeg')) return '.jpg';
    if (url.includes('.png')) return '.png';
    if (url.includes('.gif')) return '.gif';
    if (url.includes('.webp')) return '.webp';
    if (url.includes('.mp4')) return '.mp4';
    if (url.includes('.webm')) return '.webm';
    return '.jpg';
  } catch (error) {
    const match = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?|$)/i);
    if (match) {
      return match[1].toLowerCase() === 'jpeg' ? '.jpg' : `.${match[1].toLowerCase()}`;
    }
    return '.jpg';
  }
}

/**
 * Extract post data from a post element
 */
async function extractPostData(page, postElement) {
  try {
    return await page.evaluate((el, cutoffTimestamp) => {
      const post = {
        id: null,
        content: null,
        created_time: null,
        reactions: 0,
        comments: 0,
        shares: 0,
        media: []
      };

      // Extract post ID from permalink containing pfbid
      const permalinkEl = el.querySelector('a[href*="/posts/pfbid"]');
      if (permalinkEl) {
        const href = permalinkEl.getAttribute('href');
        const pfbidMatch = href.match(/\/posts\/(pfbid[\w-]+)/);
        if (pfbidMatch) {
          post.id = pfbidMatch[1];
        }
      }

      if (!post.id) {
        const fallbackLink = el.querySelector('a[href*="/posts/"]');
        if (fallbackLink) {
          const href = fallbackLink.getAttribute('href');
          const match = href.match(/\/posts\/([\w-]+)/);
          if (match) post.id = match[1];
        }
      }

      // Extract timestamp from the permalink link text or aria-label
      if (permalinkEl) {
        const timeText = permalinkEl.textContent || permalinkEl.getAttribute('aria-label');
        if (timeText) {
          post._timeText = timeText.trim();
        }
      }

      // Extract content
      const contentCandidates = Array.from(el.querySelectorAll('div[dir="auto"], span[dir="auto"]'));
      for (const candidate of contentCandidates) {
        const text = candidate.textContent.trim();
        if (!text || text.length < 2) continue;
        if (/^\d{1,2}月\d{1,2}日\s*[·・]/.test(text)) continue;
        if (/^\d{1,2}月\d{1,2}日$/.test(text)) continue;
        if (/分享对象|公开|日本|柳川|地点|・/.test(text) && text.length < 30) continue;
        if (candidate.closest('a')) continue;
        if (candidate.closest('[role="button"]')) continue;
        post.content = text;
        break;
      }

      // Extract media (images and videos)
      const seenUrls = new Set();
      const imageElements = el.querySelectorAll('img');
      imageElements.forEach(img => {
        const src = img.getAttribute('src');
        if (!src) return;
        if (src.includes('static.xx.fbcdn.net')) return;
        if (!src.includes('scontent') && !src.includes('fbcdn')) return;

        const width = img.naturalWidth || parseInt(img.getAttribute('width'), 10) || 0;
        const height = img.naturalHeight || parseInt(img.getAttribute('height'), 10) || 0;
        if ((width > 0 && width < 80) || (height > 0 && height < 80)) return;

        if (!seenUrls.has(src)) {
          seenUrls.add(src);
          post.media.push({ type: 'image', original_url: src });
        }
      });

      const videoSelectors = ['video[src]', 'video source[src]'];
      for (const selector of videoSelectors) {
        const videos = el.querySelectorAll(selector);
        videos.forEach(video => {
          const src = video.getAttribute('src');
          if (src && !seenUrls.has(src)) {
            seenUrls.add(src);
            post.media.push({ type: 'video', original_url: src });
          }
        });
      }

      return post;
    }, postElement, CONFIG.cutoffDate.getTime());
  } catch (error) {
    log(`Error extracting post data: ${error.message}`);
    return null;
  }
}

/**
 * Download a single media file using Puppeteer page
 */
async function downloadMediaWithPuppeteer(url, filePath, downloadPage, retryCount = 0) {
  const MAX_RETRIES = 2;
  try {
    const response = await downloadPage.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const status = response.status();
    if (status >= 400) {
      throw new Error(`HTTP ${status}`);
    }

    const buffer = await response.buffer();
    if (buffer.length === 0) {
      throw new Error('Empty response');
    }

    fs.writeFileSync(filePath, buffer);
    return { success: true, size: buffer.length };
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      log(`  Retry ${retryCount + 1}/${MAX_RETRIES} for media download`);
      await sleep(1000 * (retryCount + 1));
      return downloadMediaWithPuppeteer(url, filePath, downloadPage, retryCount + 1);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Download all media for a post
 */
async function downloadPostMedia(post, downloadPage) {
  if (!post.media || post.media.length === 0) return { downloaded: 0, failed: 0 };

  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < post.media.length; i++) {
    const item = post.media[i];
    const url = item.original_url;
    if (!url) continue;

    const ext = getFileExtension(url);
    const filename = `${post.id}_${i}${ext}`;
    const filePath = path.join(CONFIG.mediaDir, filename);

    // Skip if already exists
    if (fs.existsSync(filePath)) {
      item.local_path = filePath;
      downloaded++;
      continue;
    }

    log(`  Downloading media ${i + 1}/${post.media.length} for post ${post.id}`);
    const result = await downloadMediaWithPuppeteer(url, filePath, downloadPage);

    if (result.success) {
      item.local_path = filePath;
      downloaded++;
      log(`    ✓ Saved ${filename} (${result.size} bytes)`);
    } else {
      failed++;
      log(`    ✗ Failed: ${result.error}`);
    }

    // Small delay between downloads
    await sleep(randomDelay(300, 800));
  }

  return { downloaded, failed };
}

/**
 * Main scraping function
 */
async function scrapeFacebook() {
  log('Starting Facebook scraper with media download...');

  if (!fs.existsSync(CONFIG.dataDir)) {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    log(`Created data directory: ${CONFIG.dataDir}`);
  }
  if (!fs.existsSync(CONFIG.mediaDir)) {
    fs.mkdirSync(CONFIG.mediaDir, { recursive: true });
    log(`Created media directory: ${CONFIG.mediaDir}`);
  }

  log('Extracting Facebook cookies from Chrome...');
  let fbCookies;
  try {
    fbCookies = await getFacebookCookies();
    log(`Found cookies: ${fbCookies.map(c => c.name).join(', ')}`);
  } catch (error) {
    log(`ERROR: ${error.message}`);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    await page.setCookie(...fbCookies);
    log('Injected Facebook cookies into browser session');

    // Create a dedicated page for media downloads
    const downloadPage = await browser.newPage();
    await downloadPage.setCookie(...fbCookies);
    await downloadPage.setViewport({ width: 1920, height: 1080 });
    log('Created dedicated media download page');

    log(`Navigating to ${CONFIG.profileUrl}`);
    await page.goto(CONFIG.profileUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await sleep(randomDelay(2000, 4000));

    const requiresLogin = await checkLoginRequired(page);
    if (requiresLogin) {
      log('WARNING: Facebook requires login to view this profile');
      await page.screenshot({ path: path.join(CONFIG.dataDir, 'login-check.png') });
      process.exit(1);
    }

    // Handle cookie consent if present
    try {
      const cookieButton = await page.$('[data-testid="cookie-policy-dialog-accept-button"], button[title="Allow All Cookies"]');
      if (cookieButton) {
        await cookieButton.click();
        await sleep(randomDelay(1000, 2000));
      }
    } catch (e) {
      // Cookie dialog may not be present
    }

    const posts = [];
    const seenPostIds = new Set();
    let scrollCount = 0;
    let noNewPostsCount = 0;
    let reachedCutoff = false;
    let totalDownloaded = 0;
    let totalFailed = 0;

    log('Starting to scroll, collect posts, and download media...');

    while (scrollCount < CONFIG.scrollAttempts && noNewPostsCount < 8 && !reachedCutoff) {
      scrollCount++;
      log(`Scroll attempt ${scrollCount}/${CONFIG.scrollAttempts}`);

      const postElements = await page.$$('[role="article"]');
      log(`Found ${postElements.length} article elements`);

      let newPostsFound = 0;

      for (const postEl of postElements) {
        try {
          const postData = await extractPostData(page, postEl);

          if (postData && postData.id && !seenPostIds.has(postData.id)) {
            seenPostIds.add(postData.id);

            if (postData._timeText && !postData.created_time) {
              const parsedDate = parseRelativeTime(postData._timeText);
              if (parsedDate) {
                postData.created_time = parsedDate.toISOString();
              }
              delete postData._timeText;
            }

            if (postData.created_time) {
              const postDate = new Date(postData.created_time);
              if (postDate < CONFIG.cutoffDate) {
                log(`Reached post from before 2023: ${postData.created_time}`);
                reachedCutoff = true;
                break;
              }
            }

            // Download media immediately while URLs are fresh
            if (postData.media && postData.media.length > 0) {
              log(`Downloading ${postData.media.length} media for new post ${postData.id}`);
              const { downloaded, failed } = await downloadPostMedia(postData, downloadPage);
              totalDownloaded += downloaded;
              totalFailed += failed;
            }

            posts.push(postData);
            newPostsFound++;
            log(`Collected post ${postData.id} - ${postData.created_time || 'no date'} - ${postData.media.length} media (${totalDownloaded} downloaded, ${totalFailed} failed total)`);
          }
        } catch (error) {
          log(`Error processing post element: ${error.message}`);
        }
      }

      if (newPostsFound === 0) {
        noNewPostsCount++;
      } else {
        noNewPostsCount = 0;
        log(`Found ${newPostsFound} new posts (total: ${posts.length})`);
      }

      if (reachedCutoff) break;

      await page.evaluate(() => {
        const scrollAmount = Math.floor(Math.random() * 600) + 1000;
        window.scrollBy(0, scrollAmount);
      });

      const delay = randomDelay();
      log(`Waiting ${delay}ms before next scroll...`);
      await sleep(delay);

      if (Math.random() < 0.1) {
        await page.evaluate(() => window.scrollBy(0, -250));
        await sleep(randomDelay(500, 1000));
      }
    }

    log(`Scraping complete. Total posts collected: ${posts.length}`);
    log(`Media download summary: ${totalDownloaded} downloaded, ${totalFailed} failed`);

    posts.sort((a, b) => {
      if (!a.created_time) return 1;
      if (!b.created_time) return -1;
      return new Date(b.created_time) - new Date(a.created_time);
    });

    const output = {
      scraped_at: new Date().toISOString(),
      profile_url: CONFIG.profileUrl,
      total_posts: posts.length,
      posts: posts
    };

    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(output, null, 2));
    log(`Saved ${posts.length} posts to ${CONFIG.outputFile}`);

    await page.screenshot({ path: path.join(CONFIG.dataDir, 'final-state.png') });
  } catch (error) {
    log(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await browser.close();
    log('Browser closed');
  }
}

scrapeFacebook().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
