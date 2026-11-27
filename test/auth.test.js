import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedEmails } from '../lib/auth.js';

test('la lista de correos une ALLOWED_EMAILS y ALLOWED_EMAILS_EXTRA, sin espacios ni mayúsculas', () => {
  assert.deepEqual(allowedEmails({ ALLOWED_EMAILS: ' A@x.com , b@x.com ', ALLOWED_EMAILS_EXTRA: 'C@X.com' }), ['a@x.com', 'b@x.com', 'c@x.com']);
  assert.deepEqual(allowedEmails({ ALLOWED_EMAILS_EXTRA: 'solo@x.com' }), ['solo@x.com']);
  assert.deepEqual(allowedEmails({}), []);
});
