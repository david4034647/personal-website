const puppeteer = require('puppeteer');
const { getFacebookCookies } = require('./facebook-auth');

(async () => {
  const cookies = await getFacebookCookies();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setCookie(...cookies);
  await page.setViewport({ width: 1920, height: 1080 });

  const postId = 'pfbid0AcRjhm4163oCPFyeFYKfskwEpF44q5Cz1ZyvqvpZ7AWyChYifzVNZM5CZRwRuzdfl';
  const url = `https://www.facebook.com/david.dai.1213/posts/${postId}`;
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  const result = await page.evaluate(() => {
    const main = document.querySelector('div[role="main"]');
    const articles = Array.from(document.querySelectorAll('[role="article"]'));
    const infos = articles.map((a, i) => {
      const imgs = a.querySelectorAll('img');
      const mediaImgs = Array.from(imgs).filter(img => {
        const src = img.src || '';
        return (src.includes('scontent') || src.includes('fbcdn')) && !src.includes('static.xx.fbcdn.net');
      });
      return { index: i, imgCount: mediaImgs.length, text: a.textContent?.substring(0, 50) };
    });
    return { mainFound: !!main, articleCount: articles.length, infos };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
