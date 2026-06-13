const puppeteer = require('puppeteer');
const { getFacebookCookies } = require('./facebook-auth');

(async () => {
  const cookies = await getFacebookCookies();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setCookie(...cookies);
  await page.setViewport({ width: 1920, height: 1080 });

  const postId = 'pfbid0257XrSkKvpLYwxrUsRQLo8rXnYN9aiH6KxYPU6fLVUsxJL5wXM4xJtGZ6dECVsRq6l';
  const url = `https://www.facebook.com/david.dai.1213/posts/${postId}`;
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.screenshot({ path: './data/post-page-test.png' });

  const images = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .map(img => img.src)
      .filter(src => src.includes('scontent') || src.includes('fbcdn'));
  });
  console.log('Found images:', images.length);
  console.log(images.slice(0, 5));

  await browser.close();
})();
