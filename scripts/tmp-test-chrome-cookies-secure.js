const chromeCookies = require('chrome-cookies-secure');

chromeCookies.getCookies('https://www.facebook.com', 'chrome', (err, cookies) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  console.log('Total cookies:', cookies.length);
  const fbCookies = cookies.filter(c => c.domain.includes('facebook.com'));
  console.log('Facebook cookies:', fbCookies.length);
  const important = fbCookies.filter(c => ['c_user', 'xs'].includes(c.name));
  console.log('Important:', important.map(c => ({ name: c.name, value: c.value.slice(0, 20) + '...' })));
});
