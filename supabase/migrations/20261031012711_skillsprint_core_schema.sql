
create extension if not exists pgcrypto;

create table if not exists public.learning_paths (
  id text primary key,
  title text not null,
  description text not null default '',
  level text not null default 'Beginner',
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id text primary key,
  path_id text references public.learning_paths(id) on delete set null,
  type text not null check (type in ('multiple_choice','code_fix','fill_blank')),
  category text not null default '',
  title text not null,
  subtitle text not null default '',
  body text not null default '',
  content jsonb not null default '{}'::jsonb,
  reward_xp integer not null default 0 check (reward_xp >= 0),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id text primary key,
  name text not null,
  description text not null default '',
  event_type text not null,
  threshold integer not null default 1,
  criteria jsonb not null default '{}'::jsonb,
  is_published boolean not null default true
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp bigint not null default 0 check (total_xp >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_activity_date date,
  completed_lessons integer not null default 0 check (completed_lessons >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null references public.lessons(id),
  answer jsonb not null,
  is_correct boolean not null,
  duration_seconds integer check (duration_seconds >= 0),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  attempted_at timestamptz not null default now()
);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists lesson_attempts_user_time_idx on public.lesson_attempts(user_id, attempted_at desc);
create index if not exists lesson_attempts_user_lesson_idx on public.lesson_attempts(user_id, lesson_id);
create index if not exists learning_events_user_time_idx on public.learning_events(user_id, occurred_at desc);

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email,''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  insert into public.user_progress (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.submit_lesson_attempt(
  p_lesson_id text,
  p_answer jsonb,
  p_duration_seconds integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_lesson public.lessons%rowtype;
  v_correct boolean := false;
  v_awarded integer := 0;
  v_today date;
  v_yesterday date;
  v_progress public.user_progress%rowtype;
  v_new_streak integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then raise exception 'Invalid duration'; end if;

  select * into v_lesson from public.lessons
  where id = p_lesson_id and is_published = true;
  if not found then raise exception 'Lesson not found'; end if;

  v_correct := (v_lesson.content ->> 'correct_answer') is not null
    and (v_lesson.content -> 'correct_answer') = p_answer;

  if v_correct then v_awarded := v_lesson.reward_xp; end if;

  insert into public.lesson_attempts(user_id, lesson_id, answer, is_correct, duration_seconds, xp_awarded)
  values (v_user_id, p_lesson_id, p_answer, v_correct, p_duration_seconds, v_awarded);

  v_today := (now() at time zone coalesce((select timezone from public.profiles where id = v_user_id), 'UTC'))::date;
  v_yesterday := v_today - 1;

  select * into v_progress from public.user_progress where user_id = v_user_id for update;
  if v_progress.last_activity_date = v_today then
    v_new_streak := v_progress.current_streak;
  elsif v_progress.last_activity_date = v_yesterday then
    v_new_streak := v_progress.current_streak + 1;
  else
    v_new_streak := 1;
  end if;

  update public.user_progress set
    total_xp = total_xp + v_awarded,
    current_streak = v_new_streak,
    longest_streak = greatest(longest_streak, v_new_streak),
    last_activity_date = v_today,
    completed_lessons = completed_lessons + case when v_correct then 1 else 0 end,
    updated_at = now()
  where user_id = v_user_id;

  insert into public.learning_events(user_id, event_type, payload)
  values (v_user_id, 'lesson.attempted', jsonb_build_object('lesson_id', p_lesson_id, 'correct', v_correct, 'xp_awarded', v_awarded, 'duration_seconds', p_duration_seconds));

  if v_correct then
    insert into public.learning_events(user_id, event_type, payload)
    values (v_user_id, 'lesson.completed', jsonb_build_object('lesson_id', p_lesson_id));
  end if;

  return jsonb_build_object('correct', v_correct, 'xp_awarded', v_awarded, 'current_streak', v_new_streak);
end;
$$;

alter table public.learning_paths enable row level security;
alter table public.lessons enable row level security;
alter table public.achievements enable row level security;
alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.lesson_attempts enable row level security;
alter table public.user_achievements enable row level security;
alter table public.learning_events enable row level security;

create policy "Published paths are readable" on public.learning_paths for select to authenticated using (is_published);
create policy "Published lessons are readable" on public.lessons for select to authenticated using (is_published);
create policy "Published achievements are readable" on public.achievements for select to authenticated using (is_published);

create policy "Users read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users read own progress" on public.user_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read own attempts" on public.lesson_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read own achievements" on public.user_achievements for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read own events" on public.learning_events for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.user_progress from authenticated;
revoke insert, update, delete on public.lesson_attempts from authenticated;
revoke insert, update, delete on public.learning_events from authenticated;
grant select on public.learning_paths, public.lessons, public.achievements, public.profiles, public.user_progress, public.lesson_attempts, public.user_achievements, public.learning_events to authenticated;
grant update (display_name, avatar_url, timezone, locale) on public.profiles to authenticated;
grant execute on function public.submit_lesson_attempt(text, jsonb, integer) to authenticated;
;
