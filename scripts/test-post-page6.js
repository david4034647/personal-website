const puppeteer = require('puppeteer');
const { getFacebookCookies } = require('./facebook-auth');

(async () => {
  const cookies = await getFacebookCookies();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setCookie(...cookies);
  await page.setViewport({ width: 1920, height: 1080 });

  const postIds = [
    'pfbid0AcRjhm4163oCPFyeFYKfskwEpF44q5Cz1ZyvqvpZ7AWyChYifVNZM5CZRwRuzdfl',
    'pfbid0343pyh216rX67RoR44VWUnNa6cR63n7HDAcm152qYNUuCDHjt8QfwB9cRGm8uikXXl',
    'pfbid0Qhs9RxtBmjUwcUiUnmBHggEHNaSgUidHxTDRX1y2kfxwqKUbKH39uwhkPJGrhaDul'
  ];

  for (const postId of postIds) {
    const url = `https://www.facebook.com/david.dai.1213/posts/${postId}`;
    console.log('\nNavigating to', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const result = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('[role="article"]'));
      // Pick article with longest text content (target post usually has content)
      let target = articles.reduce((best, a) => {
        const text = a.textContent || '';
        return text.length > (best?.text?.length || 0) ? { el: a, text } : best;
      }, null);
      if (!target) return { found: false };

      const seen = new Set();
      const images = [];
      target.el.querySelectorAll('img').forEach(img => {
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
      return { found: true, textPreview: target.text.substring(0, 100), images };
    });

    console.log(`Found: ${result.found}, text: ${result.textPreview}`);
    console.log(`Images: ${result.images?.length}`);
    result.images?.forEach((img, i) => console.log(`  ${i + 1}. ${img.w}x${img.h} ${img.src.substring(0, 100)}...`));
  }

  await browser.close();
})();
