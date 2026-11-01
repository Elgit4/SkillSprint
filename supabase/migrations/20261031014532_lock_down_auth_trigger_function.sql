revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
comment on table public.lesson_answer_keys is 'Private answer keys. No client policies by design; only the trusted lesson submission function may read these values.';;
