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
