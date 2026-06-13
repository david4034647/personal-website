const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const CHROME_COOKIES_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Cookies');

function getChromeSafeStorageKey() {
  const { execSync } = require('child_process');
  const key = execSync('security find-generic-password -a "Chrome" -s "Chrome Safe Storage" -w', { encoding: 'utf8' }).trim();
  return Buffer.from(key, 'base64');
}

function decryptCookie(encryptedValue, key) {
  if (!encryptedValue || encryptedValue.length === 0) return '';

  // Prefix 'v10' or 'v11' indicates encrypted
  const prefix = encryptedValue.slice(0, 3).toString('utf8');
  if (prefix !== 'v10' && prefix !== 'v11') {
    return encryptedValue.toString('utf8');
  }

  const iv = Buffer.alloc(16, ' ');
  const derivedKey = crypto.pbkdf2Sync(key, 'saltysalt', 1003, 16, 'sha1');

  const decipher = crypto.createDecipheriv('aes-128-cbc', derivedKey, iv);
  let decrypted = decipher.update(encryptedValue.slice(3));
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  // Strip trailing padding
  return decrypted.toString('utf8').replace(/\x00+$/, '');
}

function getFacebookCookies() {
  return new Promise((resolve, reject) => {
    const key = getChromeSafeStorageKey();
    const db = new sqlite3.Database(CHROME_COOKIES_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) reject(err);
    });

    const query = `
      SELECT host_key, name, value, path, expires_utc, is_secure, is_httponly, encrypted_value
      FROM cookies
      WHERE host_key LIKE '%facebook.com%'
    `;

    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      const cookies = rows.map(row => ({
        domain: row.host_key,
        name: row.name,
        value: decryptCookie(row.encrypted_value, key) || row.value,
        path: row.path,
        expires: row.expires_utc,
        secure: row.is_secure === 1,
        httpOnly: row.is_httponly === 1,
      })).filter(c => c.value);

      db.close();
      resolve(cookies);
    });
  });
}

module.exports = { getFacebookCookies };

if (require.main === module) {
  getFacebookCookies().then(cookies => {
    console.log('Found', cookies.length, 'Facebook cookies');
    const important = cookies.filter(c => ['c_user', 'xs', 'datr', 'sb'].includes(c.name));
    console.log('Important cookies:', important.map(c => ({ name: c.name, value: c.value.slice(0, 20) + '...' })));
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
