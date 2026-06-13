#!/usr/bin/env node
/**
 * Inspect current Facebook profile DOM to design scraper selectors.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const { getFacebookCookies } = require('./facebook-auth');

const CONFIG = {
  profileUrl: 'https://www.facebook.com/david.dai.1213',
  screenshotDir: path.join(__dirname, '..', 'data'),
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function inspect() {
  console.log('Extracting cookies...');
  const fbCookies = await getFacebookCookies();
  console.log('Cookies:', fbCookies.map(c => c.name).join(', '));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setCookie(...fbCookies);

    console.log(`Navigating to ${CONFIG.profileUrl}`);
    await page.goto(CONFIG.profileUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);

    // Scroll a bit to load some posts
    await page.evaluate(() => window.scrollBy(0, 1200));
    await sleep(3000);

    const report = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('[role="article"]'));
      return articles.slice(0, 5).map((article, i) => {
        const firstLink = article.querySelector('a[href*="/posts/"], a[href*="/photos/"], a[href*="/videos/"]');
        const dateLike = Array.from(article.querySelectorAll('a, span'))
          .filter(el => /\d+\s*(分钟|小时|天|周|月|年|分钟|小时|日|週|月|年|ago|January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d+月\d+日)/i.test(el.textContent))
          .slice(0, 3)
          .map(el => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 80), href: el.getAttribute('href') }));
        const imgs = Array.from(article.querySelectorAll('img'))
          .filter(img => img.src && (img.src.includes('scontent') || img.src.includes('fbcdn')))
          .slice(0, 4)
          .map(img => ({ src: img.src.slice(0, 200), alt: img.alt?.slice(0, 60), width: img.naturalWidth, height: img.naturalHeight }));
        const textSpans = Array.from(article.querySelectorAll('span[dir="auto"], div[dir="auto"]'))
          .filter(el => el.textContent.trim().length > 5)
          .slice(0, 3)
          .map(el => el.textContent.trim().slice(0, 200));
        const reactions = Array.from(article.querySelectorAll('span, div'))
          .filter(el => /\d+\s*(次赞|like|reaction|评论|comment|分享|share)/i.test(el.getAttribute('aria-label') || el.textContent))
          .slice(0, 3)
          .map(el => ({ aria: el.getAttribute('aria-label')?.slice(0, 80), text: el.textContent.trim().slice(0, 80) }));
        return { index: i, firstLinkHref: firstLink?.getAttribute('href'), dates: dateLike, images: imgs, texts: textSpans, reactions };
      });
    });

    console.log(JSON.stringify(report, null, 2));

    await page.screenshot({ path: path.join(CONFIG.screenshotDir, 'inspect-dom.png') });
    console.log('Screenshot saved to data/inspect-dom.png');
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

inspect().catch(console.error);
