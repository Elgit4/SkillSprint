-- Follow-up migration for the live SkillSprint schema.
-- Run after 001_initial_schema.sql on a fresh project.
alter table public.profiles
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists locale text,
  add column if not exists daily_goal_minutes integer not null default 10 check (daily_goal_minutes between 5 and 180),
  add column if not exists technical_interests text[] not null default '{}',
  add column if not exists reminders_enabled boolean not null default false;

alter table public.user_progress
  add column if not exists longest_streak integer not null default 0,
  add column if not exists completed_lessons integer not null default 0;

create table if not exists public.learning_paths (
  id text primary key, title text not null, description text not null default '',
  level text not null default 'Beginner', sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb, is_published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.lessons (
  id text primary key, path_id text references public.learning_paths(id) on delete set null,
  type text not null check (type in ('multiple_choice','code_fix','fill_blank')),
  category text not null default '', title text not null, subtitle text not null default '',
  body text not null default '', content jsonb not null default '{}'::jsonb,
  reward_xp integer not null default 0 check (reward_xp >= 0), sort_order integer not null default 0,
  is_published boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.achievements (
  id text primary key, name text not null, description text not null default '',
  event_type text not null, threshold integer not null default 1,
  criteria jsonb not null default '{}'::jsonb, is_published boolean not null default true
);
create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(), primary key(user_id,achievement_id)
);
create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, payload jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);
create table if not exists public.lesson_answer_keys (
  lesson_id text primary key references public.lessons(id) on delete cascade,
  correct_answer jsonb not null
);

alter table public.learning_paths enable row level security;
alter table public.lessons enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.learning_events enable row level security;
alter table public.lesson_answer_keys enable row level security;

drop policy if exists "Published paths are readable" on public.learning_paths;
create policy "Published paths are readable" on public.learning_paths for select to authenticated using (is_published);
drop policy if exists "Published lessons are readable" on public.lessons;
create policy "Published lessons are readable" on public.lessons for select to authenticated using (is_published);
drop policy if exists "Published achievements are readable" on public.achievements;
create policy "Published achievements are readable" on public.achievements for select to authenticated using (is_published);
drop policy if exists "Users read own achievements" on public.user_achievements;
create policy "Users read own achievements" on public.user_achievements for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users read own events" on public.learning_events;
create policy "Users read own events" on public.learning_events for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.lesson_answer_keys from anon, authenticated;
comment on table public.lesson_answer_keys is 'Private answer keys. No client policies by design; only the trusted lesson submission function may read these values.';
revoke insert, update, delete on public.user_progress, public.lesson_attempts, public.learning_events from authenticated;
grant select on public.learning_paths, public.lessons, public.achievements, public.user_achievements, public.learning_events to authenticated;

-- Answer keys must be copied out of lessons before the content field is stripped.
insert into public.lesson_answer_keys(lesson_id,correct_answer)
select id,content->'correct_answer' from public.lessons where content ? 'correct_answer'
on conflict (lesson_id) do update set correct_answer=excluded.correct_answer;
update public.lessons set content=content-'correct_answer' where content ? 'correct_answer';

create or replace function public.submit_lesson_attempt(p_lesson_id text,p_answer jsonb,p_duration_seconds integer default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid(); v_lesson public.lessons%rowtype; v_key jsonb; v_correct boolean:=false;
  v_first boolean:=false; v_xp integer:=0; v_today date; v_yesterday date; v_tz text;
  v_progress public.user_progress%rowtype; v_streak integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_answer is null then raise exception 'Answer required' using errcode='22023'; end if;
  if p_duration_seconds is not null and (p_duration_seconds<0 or p_duration_seconds>7200) then raise exception 'Invalid duration' using errcode='22023'; end if;
  select * into v_lesson from public.lessons where id=p_lesson_id and is_published;
  if not found then raise exception 'Lesson not found' using errcode='P0002'; end if;
  select correct_answer into v_key from public.lesson_answer_keys where lesson_id=p_lesson_id;
  if not found then raise exception 'Answer key missing' using errcode='P0001'; end if;
  v_correct:=v_key=p_answer;
  if v_correct then
    select not exists(select 1 from public.lesson_attempts where user_id=v_uid and lesson_id=p_lesson_id and is_correct) into v_first;
    if v_first then v_xp:=v_lesson.reward_xp; end if;
  end if;
  insert into public.lesson_attempts(user_id,lesson_id,answer,is_correct,duration_seconds,xp_awarded)
  values(v_uid,p_lesson_id,p_answer,v_correct,p_duration_seconds,v_xp);
  select coalesce(timezone,'UTC') into v_tz from public.profiles where id=v_uid;
  v_today:=(now() at time zone coalesce(v_tz,'UTC'))::date; v_yesterday:=v_today-1;
  select * into v_progress from public.user_progress where user_id=v_uid for update;
  if v_progress.last_activity_date=v_today then v_streak:=v_progress.current_streak;
  elsif v_progress.last_activity_date=v_yesterday then v_streak:=v_progress.current_streak+1;
  else v_streak:=1; end if;
  update public.user_progress set total_xp=total_xp+v_xp,current_streak=v_streak,
    longest_streak=greatest(longest_streak,v_streak),last_activity_date=v_today,
    completed_lessons=completed_lessons+case when v_first then 1 else 0 end,updated_at=now()
  where user_id=v_uid;
  insert into public.learning_events(user_id,event_type,payload)
  values(v_uid,'lesson.attempted',jsonb_build_object('lesson_id',p_lesson_id,'correct',v_correct,'duration_seconds',p_duration_seconds,'xp_awarded',v_xp));
  if v_first then
    insert into public.learning_events(user_id,event_type,payload)
    values(v_uid,'lesson.completed',jsonb_build_object('lesson_id',p_lesson_id)),
          (v_uid,'mission.completed',jsonb_build_object('lesson_id',p_lesson_id));
    insert into public.user_achievements(user_id,achievement_id)
    select v_uid,id from public.achievements where is_published and event_type in ('lesson.completed','mission.completed')
      and (criteria->>'lesson_id' is null or criteria->>'lesson_id'=p_lesson_id) on conflict do nothing;
  end if;
  if v_streak>=3 then
    insert into public.user_achievements(user_id,achievement_id)
    select v_uid,id from public.achievements where is_published and event_type='streak.checkin' and v_streak>=threshold on conflict do nothing;
  end if;
  return jsonb_build_object('correct',v_correct,'first_completion',v_first,'xp_awarded',v_xp,'current_streak',v_streak);
end;
$$;
revoke all on function public.submit_lesson_attempt(text,jsonb,integer) from public,anon;
grant execute on function public.submit_lesson_attempt(text,jsonb,integer) to authenticated;
revoke all on function public.handle_new_auth_user() from public,anon,authenticated;
grant update(display_name,avatar_url,timezone,locale,daily_goal_minutes,technical_interests,reminders_enabled)
on public.profiles to authenticated;
