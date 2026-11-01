-- SkillSprint base schema. The client never writes XP, streaks or lesson results directly.
create extension if not exists pgcrypto;

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
  total_xp bigint not null default 0 check(total_xp>=0),
  current_streak integer not null default 0 check(current_streak>=0),
  longest_streak integer not null default 0 check(longest_streak>=0),
  last_activity_date date,
  completed_lessons integer not null default 0 check(completed_lessons>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.learning_paths (
  id text primary key,title text not null,description text not null default '',
  level text not null default 'Beginner',sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,is_published boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.lessons (
  id text primary key,path_id text references public.learning_paths(id) on delete set null,
  type text not null check(type in ('multiple_choice','code_fix','fill_blank')),
  category text not null default '',title text not null,subtitle text not null default '',body text not null default '',
  content jsonb not null default '{}'::jsonb,reward_xp integer not null default 0 check(reward_xp>=0),
  sort_order integer not null default 0,is_published boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.achievements (
  id text primary key,name text not null,description text not null default '',event_type text not null,
  threshold integer not null default 1,criteria jsonb not null default '{}'::jsonb,is_published boolean not null default true
);
create table if not exists public.lesson_answer_keys (
  lesson_id text primary key references public.lessons(id) on delete cascade,correct_answer jsonb not null
);
create table if not exists public.lesson_attempts (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null references public.lessons(id),answer jsonb not null,is_correct boolean not null,
  duration_seconds integer check(duration_seconds is null or duration_seconds>=0),
  xp_awarded integer not null default 0 check(xp_awarded>=0),attempted_at timestamptz not null default now()
);
create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),primary key(user_id,achievement_id)
);
create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,payload jsonb not null default '{}'::jsonb,occurred_at timestamptz not null default now()
);

create index if not exists lesson_attempts_user_time_idx on public.lesson_attempts(user_id,attempted_at desc);
create index if not exists lesson_attempts_user_lesson_idx on public.lesson_attempts(user_id,lesson_id);
create index if not exists learning_events_user_time_idx on public.learning_events(user_id,occurred_at desc);

alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.learning_paths enable row level security;
alter table public.lessons enable row level security;
alter table public.achievements enable row level security;
alter table public.lesson_answer_keys enable row level security;
alter table public.lesson_attempts enable row level security;
alter table public.user_achievements enable row level security;
alter table public.learning_events enable row level security;

create policy "Users read own profile" on public.profiles for select to authenticated using((select auth.uid())=id);
create policy "Users update own profile" on public.profiles for update to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
create policy "Users read own progress" on public.user_progress for select to authenticated using((select auth.uid())=user_id);
create policy "Published paths are readable" on public.learning_paths for select to authenticated using(is_published);
create policy "Published lessons are readable" on public.lessons for select to authenticated using(is_published);
create policy "Published achievements are readable" on public.achievements for select to authenticated using(is_published);
create policy "Users read own attempts" on public.lesson_attempts for select to authenticated using((select auth.uid())=user_id);
create policy "Users read own achievements" on public.user_achievements for select to authenticated using((select auth.uid())=user_id);
create policy "Users read own events" on public.learning_events for select to authenticated using((select auth.uid())=user_id);

revoke insert,update,delete on public.user_progress,public.lesson_attempts,public.learning_events from authenticated;
revoke all on public.lesson_answer_keys from anon,authenticated;
grant select on public.profiles,public.user_progress,public.learning_paths,public.lessons,public.achievements,public.lesson_attempts,public.user_achievements,public.learning_events to authenticated;
grant update(display_name,avatar_url,timezone,locale) on public.profiles to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_name text;
begin
  v_name:=nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name','')),'');
  insert into public.profiles(id,email,display_name,avatar_url) values(new.id,new.email,v_name,new.raw_user_meta_data->>'avatar_url')
  on conflict(id) do update set email=excluded.email,display_name=coalesce(excluded.display_name,public.profiles.display_name),avatar_url=coalesce(excluded.avatar_url,public.profiles.avatar_url),updated_at=now();
  insert into public.user_progress(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email,raw_user_meta_data on auth.users for each row execute function public.handle_new_auth_user();
