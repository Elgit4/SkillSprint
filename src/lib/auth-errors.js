/** Auth error classification for the phone-number + reusable PIN flow. */
export function isDuplicateAccountError(error) {
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const message = String(error?.message || error?.msg || error || '').toLowerCase();
  return code === 'user_already_exists'
    || /user already registered|already registered|user already exists/.test(message);
}

export function isInvalidRefreshTokenError(error) {
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const message = String(error?.message || error?.msg || error || '').toLowerCase();
  return code === 'refresh_token_not_found'
    || /invalid refresh token|refresh token not found/.test(message);
}

/**
 * Convert known Supabase Auth failures into guidance that fits the phone + PIN
 * interface. Unknown errors deliberately return null so the caller can retain
 * its existing fallback behaviour.
 */
export function describeAuthError(error) {
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const message = String(error?.message || error?.msg || error || '').toLowerCase();
  const status = Number(error?.status) || 0;

  if (code === 'invalid_credentials' || /invalid login credentials/.test(message)) {
    return 'The telephone number or PIN is incorrect. Check both and try again.';
  }
  if (code === 'weak_password' || /weak password|pwned|leaked password|password is too easy to guess/.test(message)) {
    return 'That PIN is too common or weak. Choose a less obvious six-digit PIN and try again.';
  }
  if (code === 'over_request_rate_limit' || status === 429 || /rate limit|too many requests/.test(message)) {
    return 'Too many attempts have been made. Wait a few minutes, then try again.';
  }
  if (code === 'over_email_send_rate_limit') {
    return 'Account registration is temporarily limited. Please try again later.';
  }
  if (code === 'signup_disabled') {
    return 'New SkillSprint accounts are currently disabled. Contact support.';
  }
  if (code === 'email_provider_disabled') {
    return 'Account access is temporarily unavailable. Contact SkillSprint support.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/.test(message)) {
    return 'This account is awaiting confirmation. Contact SkillSprint support.';
  }
  if (code === 'email_address_invalid' || /email address .* is invalid/.test(message)) {
    return 'Account creation is misconfigured on the server. Contact SkillSprint support.';
  }
  if (code === 'unexpected_failure' || /database error (saving|updating) new user/.test(message)) {
    return 'The server could not finish creating your account. Try again or contact SkillSprint support.';
  }
  return null;
}
