-- Persist skipped questions through a narrow authenticated RPC.
-- The client does not receive direct INSERT permission on learning_events.

create or replace function public.record_lesson_skip(p_lesson_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path_id text;
  v_category text;
  v_event public.learning_events%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select path_id, category
    into v_path_id, v_category
    from public.lessons
   where id = p_lesson_id
     and is_published;

  if not found then
    raise exception 'Published lesson not found' using errcode = 'P0002';
  end if;

  insert into public.learning_events(user_id, event_type, payload)
  values (
    v_uid,
    'lesson.skipped',
    jsonb_build_object(
      'lesson_id', p_lesson_id,
      'path_id', v_path_id,
      'category', v_category
    )
  )
  returning * into v_event;

  return jsonb_build_object(
    'id', v_event.id,
    'event_type', v_event.event_type,
    'payload', v_event.payload,
    'occurred_at', v_event.occurred_at
  );
end;
$$;

revoke all on function public.record_lesson_skip(text) from public, anon;
grant execute on function public.record_lesson_skip(text) to authenticated;

comment on function public.record_lesson_skip(text) is
  'Records a skip for the authenticated learner after verifying the lesson is published. Called by SkillSprint continuous practice.';
