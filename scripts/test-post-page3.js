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

    const images = await page.evaluate(() => {
      const article = document.querySelector('[role="article"]');
      if (!article) return { article: false, images: [] };
      const seen = new Set();
      const result = [];
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
          result.push({ src, w, h });
        }
      });
      return { article: true, images: result };
    });
    console.log(`Article found: ${images.article}, images: ${images.images.length}`);
    images.images.forEach((img, i) => console.log(`  ${i + 1}. ${img.w}x${img.h} ${img.src.substring(0, 100)}...`));
  }

  await browser.close();
})();
