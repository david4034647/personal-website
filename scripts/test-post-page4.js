const puppeteer = require('puppeteer');
const { getFacebookCookies } = require('./facebook-auth');

(async () => {
  const cookies = await getFacebookCookies();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setCookie(...cookies);
  await page.setViewport({ width: 1920, height: 1080 });

  const postIds = [
    'pfbid0AcRjhm4163oCPFyeFYKfskwEpF44q5Cz1ZyvqvpZ7AWyChYifzVNZM5CZRwRuzdfl',
    'pfbid0343pyh216rX67RoR44VWUnNa6cR63n7HDAcm152qYNUuCDHjt8QfwB9cRGm8uikXXl',
    'pfbid0Qhs9RxtBmjUwcUiUnmBHggEHNaSgUidHxTDRX1y2kfxwqKUbKH39uwhkPJGrhaDul'
  ];

  for (const postId of postIds) {
    const url = `https://www.facebook.com/david.dai.1213/posts/${postId}`;
    console.log('\nNavigating to', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.screenshot({ path: `./data/post-${postId}-v4.png` });

    const result = await page.evaluate((pid) => {
      // Find article containing the post link
      const links = Array.from(document.querySelectorAll('a[href*="/posts/"]'));
      let article = null;
      for (const link of links) {
        if (link.getAttribute('href').includes(pid)) {
          article = link.closest('[role="article"]') || link.closest('div[data-pagelet]');
          break;
        }
      }
      if (!article) {
        // Fallback: find any element whose text or attributes contain pfbid
        const all = Array.from(document.querySelectorAll('*'));
        const el = all.find(e => {
          const html = e.outerHTML || '';
          return html.includes(pid) && e.getAttribute('role') === 'article';
        });
        article = el || null;
      }
      if (!article) return { found: false, reason: 'no article' };

      const seen = new Set();
      const images = [];
      article.querySelectorAll('img').forEach(img => {
        const src = img.src;
        if (!src) return;
        if (src.includes('static.xx.fbcdn.net')) return;
        if (!src.includes('scontent') && !src.includes('fbcdn')) return;
        const w = img.naturalWidth || parseInt(img.getAttribute('width')) || 0;
        const h = img.naturalHeight || parseInt(img.getAttribute('height')) || 0;
        if (w > 0 && w < 120) return;
        if (h > 0 && h < 120) return;
        if (!seen.has(src)) {
          seen.add(src);
          images.push({ src, w, h });
        }
      });
      return { found: true, images };
    }, postId);

    console.log(JSON.stringify(result, null, 2).substring(0, 2000));
  }

  await browser.close();
})();
