import test from 'node:test';
import assert from 'node:assert/strict';
import { isDuplicateAccountError, isInvalidRefreshTokenError, describeAuthError } from './auth-errors.js';

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

test('maps common Supabase Auth errors to useful phone/PIN guidance', () => {
  assert.match(
    describeAuthError({ code: 'invalid_credentials' }),
    /telephone number or PIN is incorrect/i,
  );
  assert.match(
    describeAuthError({ code: 'weak_password' }),
    /less obvious six-digit PIN/i,
  );
  assert.match(
    describeAuthError({ code: 'over_request_rate_limit' }),
    /wait a few minutes/i,
  );
  assert.match(
    describeAuthError({ status: 429, message: 'Too many requests' }),
    /wait a few minutes/i,
  );
  assert.match(
    describeAuthError({ code: 'email_address_invalid' }),
    /misconfigured on the server/i,
  );
  assert.match(
    describeAuthError({ code: 'email_not_confirmed' }),
    /awaiting confirmation/i,
  );
  assert.match(
    describeAuthError({ code: 'unexpected_failure', message: 'Database error saving new user' }),
    /could not finish creating your account/i,
  );
  assert.equal(describeAuthError({ code: 'some_unknown_error', message: 'Unknown' }), null);
});
