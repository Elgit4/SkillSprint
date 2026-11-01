
alter table public.profiles
  add column if not exists daily_goal_minutes integer not null default 10
    check (daily_goal_minutes between 5 and 180),
  add column if not exists technical_interests text[] not null default '{}',
  add column if not exists reminders_enabled boolean not null default false;

create table if not exists public.lesson_answer_keys (
  lesson_id text primary key references public.lessons(id) on delete cascade,
  correct_answer jsonb not null
);
alter table public.lesson_answer_keys enable row level security;
revoke all on public.lesson_answer_keys from anon, authenticated;

insert into public.lesson_answer_keys(lesson_id, correct_answer)
select id, content -> 'correct_answer'
from public.lessons
where content ? 'correct_answer'
on conflict (lesson_id) do update set correct_answer = excluded.correct_answer;

update public.lessons
set content = content - 'correct_answer'
where content ? 'correct_answer';

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  insert into public.profiles (id, email, display_name, avatar_url)
  values (new.id, new.email, v_name, new.raw_user_meta_data ->> 'avatar_url')
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

create or replace function public.submit_lesson_attempt(
  p_lesson_id text,
  p_answer jsonb,
  p_duration_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_lesson public.lessons%rowtype;
  v_correct_answer jsonb;
  v_correct boolean := false;
  v_first_completion boolean := false;
  v_awarded integer := 0;
  v_today date;
  v_yesterday date;
  v_timezone text;
  v_progress public.user_progress%rowtype;
  v_new_streak integer;
  v_unlocked text[] := array[]::text[];
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_answer is null then
    raise exception 'An answer is required' using errcode = '22023';
  end if;
  if p_duration_seconds is not null and (p_duration_seconds < 0 or p_duration_seconds > 7200) then
    raise exception 'Duration must be between 0 and 7200 seconds' using errcode = '22023';
  end if;

  select * into v_lesson
  from public.lessons
  where id = p_lesson_id and is_published = true;
  if not found then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;

  select correct_answer into v_correct_answer
  from public.lesson_answer_keys
  where lesson_id = p_lesson_id;
  if not found then
    raise exception 'Answer key is not configured for this lesson' using errcode = 'P0001';
  end if;

  v_correct := (v_correct_answer = p_answer);
  if v_correct then
    select not exists (
      select 1 from public.lesson_attempts
      where user_id = v_user_id and lesson_id = p_lesson_id and is_correct = true
    ) into v_first_completion;
    if v_first_completion then
      v_awarded := v_lesson.reward_xp;
    end if;
  end if;

  insert into public.lesson_attempts(user_id, lesson_id, answer, is_correct, duration_seconds, xp_awarded)
  values (v_user_id, p_lesson_id, p_answer, v_correct, p_duration_seconds, v_awarded);

  select coalesce(timezone, 'UTC') into v_timezone
  from public.profiles where id = v_user_id;
  v_today := (now() at time zone coalesce(v_timezone, 'UTC'))::date;
  v_yesterday := v_today - 1;

  select * into v_progress
  from public.user_progress
  where user_id = v_user_id
  for update;

  if v_progress.last_activity_date = v_today then
    v_new_streak := v_progress.current_streak;
  elsif v_progress.last_activity_date = v_yesterday then
    v_new_streak := v_progress.current_streak + 1;
  else
    v_new_streak := 1;
  end if;

  update public.user_progress
  set total_xp = total_xp + v_awarded,
      current_streak = v_new_streak,
      longest_streak = greatest(longest_streak, v_new_streak),
      last_activity_date = v_today,
      completed_lessons = completed_lessons + case when v_first_completion then 1 else 0 end,
      updated_at = now()
  where user_id = v_user_id;

  insert into public.learning_events(user_id, event_type, payload)
  values (v_user_id, 'lesson.attempted', jsonb_build_object(
    'lesson_id', p_lesson_id, 'correct', v_correct,
    'first_completion', v_first_completion, 'xp_awarded', v_awarded,
    'duration_seconds', p_duration_seconds
  ));

  if v_first_completion then
    insert into public.learning_events(user_id, event_type, payload)
    values
      (v_user_id, 'lesson.completed', jsonb_build_object('lesson_id', p_lesson_id)),
      (v_user_id, 'mission.completed', jsonb_build_object('lesson_id', p_lesson_id));

    insert into public.user_achievements(user_id, achievement_id)
    select v_user_id, a.id
    from public.achievements a
    where a.is_published = true
      and a.event_type in ('lesson.completed', 'mission.completed')
      and (a.criteria ->> 'lesson_id' is null or a.criteria ->> 'lesson_id' = p_lesson_id)
    on conflict do nothing;

    select coalesce(array_agg(ua.achievement_id), array[]::text[])
    into v_unlocked
    from public.user_achievements ua
    where ua.user_id = v_user_id
      and ua.unlocked_at >= now() - interval '3 seconds';
  end if;

  if v_new_streak >= 3 then
    insert into public.user_achievements(user_id, achievement_id)
    select v_user_id, a.id
    from public.achievements a
    where a.is_published = true
      and a.event_type = 'streak.checkin'
      and v_new_streak >= a.threshold
    on conflict do nothing;
    select v_unlocked || coalesce(array_agg(ua.achievement_id), array[]::text[])
    into v_unlocked
    from public.user_achievements ua
    where ua.user_id = v_user_id
      and ua.unlocked_at >= now() - interval '3 seconds';
  end if;

  return jsonb_build_object(
    'correct', v_correct,
    'first_completion', v_first_completion,
    'xp_awarded', v_awarded,
    'current_streak', v_new_streak,
    'unlocked_achievements', to_jsonb(v_unlocked)
  );
end;
$$;

revoke all on function public.submit_lesson_attempt(text, jsonb, integer) from public, anon;
grant execute on function public.submit_lesson_attempt(text, jsonb, integer) to authenticated;

revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name, avatar_url, timezone, locale, daily_goal_minutes, technical_interests, reminders_enabled)
on public.profiles to authenticated;

insert into public.achievements(id,name,description,event_type,threshold,criteria,is_published) values
('on-a-roll','On a roll','Practice on three different days in a row.','streak.checkin',3,'{}',true)
on conflict (id) do update set
  name=excluded.name, description=excluded.description,
  event_type=excluded.event_type, threshold=excluded.threshold,
  criteria=excluded.criteria, is_published=excluded.is_published;
;
