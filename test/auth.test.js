'use strict';
const assert = require('assert');
const { totp, weakPassword } = require('../src/auth');
// RFC 6238 SHA1 test vector: secret "12345678901234567890", T = 59 s -> 94287082 (8 digits; we use the last 6)
const secret = totp.b32enc(Buffer.from('12345678901234567890'));
assert.strictEqual(totp.totpAt(secret, Math.floor(59 / 30)), '287082');
assert.strictEqual(totp.b32dec(secret).toString(), '12345678901234567890');
assert.strictEqual(totp.totpStep(secret, '287082', 0, 59000), 1);
assert.strictEqual(totp.totpStep(secret, '287082', 1, 59000), 0, 'a used step is a replay');
assert.strictEqual(totp.totpStep(secret, '000000', 0, 59000), 0);
assert.strictEqual(totp.totpStep(secret, '28708', 0, 59000), 0);
// passwords
assert.ok(weakPassword('short'));
assert.ok(weakPassword('aaaaaaaaaaaa'), 'too uniform');
assert.ok(weakPassword('mypassword99'), 'common word');
assert.ok(weakPassword('maria-lives-here-1', { name: 'Maria' }), 'contains the name');
assert.strictEqual(weakPassword('tangerine-orbit-42'), null);
console.log('auth ok');
