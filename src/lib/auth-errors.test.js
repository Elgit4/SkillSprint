import test from 'node:test';
import assert from 'node:assert/strict';
import { isDuplicateAccountError, isInvalidRefreshTokenError } from './auth-errors.js';

test('recognizes Supabase duplicate phone-account signup responses', () => {
  assert.equal(isDuplicateAccountError({ code: 'user_already_exists' }), true);
  assert.equal(isDuplicateAccountError({ message: 'User already registered' }), true);
  assert.equal(isDuplicateAccountError({ message: 'Invalid login credentials' }), false);
});

test('recognizes stale Supabase refresh-token responses', () => {
  assert.equal(isInvalidRefreshTokenError({ code: 'refresh_token_not_found' }), true);
  assert.equal(isInvalidRefreshTokenError({ message: 'Invalid Refresh Token: Refresh Token Not Found' }), true);
  assert.equal(isInvalidRefreshTokenError({ message: 'Invalid login credentials' }), false);
});
