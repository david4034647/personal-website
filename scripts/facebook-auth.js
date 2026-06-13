#!/usr/bin/env node
/**
 * Helper to extract Facebook cookies from the system's Chrome browser.
 * Requires Chrome to be installed and the user to be logged into Facebook.
 */

const chromeCookies = require('chrome-cookies-secure');

const FB_COOKIE_NAMES = ['c_user', 'xs', 'datr', 'sb', 'fr', 'presence'];

function getFacebookCookies() {
  return new Promise((resolve, reject) => {
    chromeCookies.getCookies('https://www.facebook.com', 'chrome', (err, cookies) => {
      if (err) {
        reject(err);
        return;
      }

      if (!cookies || !cookies.c_user || !cookies.xs) {
        reject(new Error('Facebook login cookies not found in Chrome. Please log in to Facebook in Chrome first.'));
        return;
      }

      const cookieObjects = Object.entries(cookies)
        .filter(([name]) => FB_COOKIE_NAMES.includes(name))
        .map(([name, value]) => ({
          name,
          value,
          domain: '.facebook.com',
          path: '/',
          secure: true,
          httpOnly: name === 'xs' || name === 'sb',
        }));

      resolve(cookieObjects);
    });
  });
}

module.exports = { getFacebookCookies };

if (require.main === module) {
  getFacebookCookies()
    .then(cookies => {
      console.log('Facebook cookies found:', cookies.map(c => c.name).join(', '));
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
