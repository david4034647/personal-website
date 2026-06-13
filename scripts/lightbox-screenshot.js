#!/usr/bin/env node
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 900 });
  await page.goto('https://david-cloudbase-2gg25rq10444f0b8-1305192904.tcloudbaseapp.com/', { waitUntil: 'networkidle2', timeout: 120000 });

  try {
    await page.waitForSelector('#submitBtn', { timeout: 15000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('#submitBtn');
      return btn && !btn.disabled && !btn.textContent.includes('(');
    }, { timeout: 15000 });
    await page.click('#submitBtn');
    await page.waitForTimeout(1500);
  } catch (e) {}

  await page.goto('https://david-cloudbase-2gg25rq10444f0b8-1305192904.tcloudbaseapp.com/#posts', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForTimeout(2000);

  const cardIndex = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('article.post-card'));
    const idx = cards.findIndex(c => c.querySelector('.media-badge') && /4/.test(c.querySelector('.media-badge').textContent));
    return idx;
  });
  console.log('multi card index:', cardIndex);
  if (cardIndex >= 0) {
    const cards = await page.$$('article.post-card');
    await cards[cardIndex].hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(__dirname, '..', 'data', 'carousel-buttons.png') });

    await cards[cardIndex].click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(__dirname, '..', 'data', 'lightbox-buttons.png') });
  }
  console.log('done');
  await browser.close();
})();
