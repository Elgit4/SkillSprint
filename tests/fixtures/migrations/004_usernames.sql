alter table public.profiles add column if not exists username text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_username_format_check' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_username_format_check check (username is null or username ~ '^[a-z0-9_]{3,20}$');
  end if;
end $$;
create unique index if not exists profiles_username_lower_uidx on public.profiles(lower(username)) where username is not null;
create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
declare v_username text; v_display_name text;
begin
  v_username:=lower(btrim(coalesce(new.raw_user_meta_data->>'username','')));
  if v_username='' then v_username:='learner_'||substr(new.id::text,1,8); end if;
  v_display_name:=nullif(btrim(coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',v_username)),'');
  insert into public.profiles(id,email,username,display_name,avatar_url) values(new.id,new.email,v_username,coalesce(v_display_name,v_username),new.raw_user_meta_data->>'avatar_url')
  on conflict(id) do update set email=excluded.email,username=coalesce(nullif(lower(btrim(coalesce(new.raw_user_meta_data->>'username',''))),''),public.profiles.username),display_name=coalesce(excluded.display_name,public.profiles.display_name),avatar_url=coalesce(excluded.avatar_url,public.profiles.avatar_url),updated_at=now();
  insert into public.user_progress(user_id) values(new.id) on conflict(user_id) do nothing; return new;
end $$;
revoke all on function public.handle_new_auth_user() from public,anon,authenticated;
grant update(username,display_name,avatar_url,timezone,locale,daily_goal_minutes,technical_interests,reminders_enabled) on public.profiles to authenticated;
