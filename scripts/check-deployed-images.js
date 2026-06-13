#!/usr/bin/env node
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const failed = [];
  page.on('requestfailed', req => {
    failed.push({url: req.url().slice(-120), err: req.failure().errorText});
  });
  page.on('response', res => {
    const status = res.status();
    const url = res.url();
    if (status >= 400 && (url.includes('img.gnso.cn') || url.includes('scontent'))) {
      failed.push({url: url.slice(-120), status});
    }
  });

  await page.goto('https://david-cloudbase-2gg25rq10444f0b8-1305192904.tcloudbaseapp.com/', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.screenshot({ path: path.join(__dirname, '..', 'data', 'check-before-consent.png') });

  try {
    await page.waitForSelector('#submitBtn', { timeout: 15000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('#submitBtn');
      return btn && !btn.disabled && !btn.textContent.includes('(');
    }, { timeout: 15000 });
    await page.click('#submitBtn');
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('consent handling:', e.message);
  }
  await page.screenshot({ path: path.join(__dirname, '..', 'data', 'check-after-consent.png') });

  await page.goto('https://david-cloudbase-2gg25rq10444f0b8-1305192904.tcloudbaseapp.com/#posts', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForTimeout(3000);

  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(__dirname, '..', 'data', 'check-posts.png') });

  console.log('failed/403 count:', failed.length);
  for (const f of failed.slice(0, 30)) console.log(f);

  const imgs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src.slice(-80),
      nw: img.naturalWidth,
      nh: img.naturalHeight,
      complete: img.complete
    }));
  });
  const notLoaded = imgs.filter(i => i.nw === 0);
  console.log('total imgs', imgs.length, 'not loaded', notLoaded.length);
  if (notLoaded.length <= 5) {
    for (const i of notLoaded) console.log(i);
  } else {
    for (const i of notLoaded.slice(0, 10)) console.log(i);
  }
  await browser.close();
})();
