const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ORIGINAL_PROFILE = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');

async function main() {
  if (!fs.existsSync(ORIGINAL_PROFILE)) {
    console.error('Chrome profile not found at', ORIGINAL_PROFILE);
    process.exit(1);
  }

  // Copy profile to temp location to avoid locking the original
  const tempProfile = path.join(os.tmpdir(), `chrome-profile-${Date.now()}`);
  console.log('Copying Chrome profile to', tempProfile);
  fs.mkdirSync(tempProfile, { recursive: true });

  // Copy Default directory and a few essential files
  const defaultProfile = path.join(ORIGINAL_PROFILE, 'Default');
  const tempDefault = path.join(tempProfile, 'Default');

  // Use cp -R for speed
  const { execSync } = require('child_process');
  execSync(`cp -R "${defaultProfile}" "${tempDefault}"`, { stdio: 'inherit' });

  console.log('Profile copied. Launching browser...');

  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: tempProfile,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  await page.goto('https://www.facebook.com/david.dai.1213', { waitUntil: 'networkidle2', timeout: 60000 });

  const loginRequired = await page.evaluate(() => {
    return document.querySelector('input[name="email"]') !== null ||
           document.querySelector('form[action="/login/"]') !== null ||
           document.body.innerText.includes('Log in') ||
           document.body.innerText.includes('Create new account');
  });

  const url = page.url();
  const title = await page.title();
  console.log('URL:', url);
  console.log('Title:', title);
  console.log('Login required:', loginRequired);

  // Look for posts
  const posts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="article"]')).slice(0, 3).map(el => ({
      text: el.innerText.slice(0, 200),
      hasImage: el.querySelector('img') !== null
    }));
  });
  console.log('Sample posts:', JSON.stringify(posts, null, 2));

  await browser.close();

  // Cleanup
  fs.rmSync(tempProfile, { recursive: true, force: true });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
