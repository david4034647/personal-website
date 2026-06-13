#!/usr/bin/env node
/**
 * Test: Verify the frontend gracefully handles broken media URLs.
 *
 * This test opens index.html in a headless browser, scrolls through the page,
 * and verifies that images which fail to load are marked with .media-error
 * (showing a placeholder) instead of leaving a broken image icon.
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function startServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
      const ext = path.extname(filePath);
      const contentType = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.mp4': 'video/mp4',
      }[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

async function main() {
  const port = 9876;
  const server = await startServer(port);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 2000 });

  try {
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForFunction(() => {
      return document.querySelectorAll('.post-card').length > 3;
    }, { timeout: 30000 });

    // Scroll through the page to trigger lazy loading
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 800;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });

    // Give images time to load/error
    await new Promise(r => setTimeout(r, 8000));

    const stats = await page.evaluate(() => {
      const images = document.querySelectorAll('.carousel-item img');
      const broken = Array.from(images).filter(img => img.complete && img.naturalWidth === 0);
      const unhandledBroken = broken.filter(img => !img.closest('.carousel-item')?.classList.contains('media-error'));
      const visiblePosts = document.querySelectorAll('.post-card:not([style*="display: none"])').length;
      return {
        totalImages: images.length,
        broken: broken.length,
        unhandledBroken: unhandledBroken.length,
        visiblePosts,
      };
    });

    console.log('Frontend stats:', JSON.stringify(stats, null, 2));

    if (stats.unhandledBroken > 0) {
      console.log(`\n❌ TEST FAILED: ${stats.unhandledBroken} broken images are not handled.`);
      process.exit(1);
    }

    console.log('\n✅ TEST PASSED: All broken images are handled gracefully.');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
