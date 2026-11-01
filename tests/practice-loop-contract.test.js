import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/auth.css', import.meta.url), 'utf8');
const migration = await readFile(new URL('../tests/fixtures/migrations/006_record_lesson_skip.sql', import.meta.url), 'utf8');
const progression = await readFile(new URL('../tests/fixtures/migrations/002_secure_progression.sql', import.meta.url), 'utf8');

 test('quiz controls use semantic hidden states and only expose Next after a correct answer', () => {
  assert.match(main, /id="submitAnswer"[^>]*disabled/);
  assert.match(main, /id="skipPracticeQuestion"/);
  assert.match(main, /id="nextPracticeQuestion"[^>]*hidden/);
  assert.match(main, /if \(nextButton\) \{ nextButton\.hidden = false;/);
  assert.match(main, /if \(skipButton\) skipButton\.hidden = true;/);
  assert.match(main, /submitButton\.hidden = true;/);
  assert.match(css, /#modalBackdrop \[hidden\]\{display:none!important\}/);
});

test('Next transitions the current practice session before opening the next question', () => {
  assert.match(main, /function advancePracticeLoop\(\)[\s\S]*?advancePracticeSession\(state\.practiceSession\)/);
  assert.match(main, /openLesson\(advanced\.lessonId, \{ loop: true \}\)/);
  assert.match(main, /function startPracticeLoop\(lessonId\)[\s\S]*?createPracticeSession/);
});

test('Skip advances immediately and persists using the authenticated skip RPC', () => {
  const listenerStart = main.indexOf("$('#skipPracticeQuestion')?.addEventListener('click'");
  const listener = main.slice(listenerStart, main.indexOf('\n    });', listenerStart) + 7);
  assert.ok(listenerStart >= 0, 'Skip click listener is missing');
  assert.ok(listener.indexOf('advancePracticeLoop();') < listener.indexOf('await supabase.rpc('), 'UI must advance before network persistence completes');
  assert.match(listener, /supabase\.rpc\('record_lesson_skip'/);
  assert.match(listener, /state\.attempts\.unshift\(\{ lesson_id: lesson\.id, is_correct: false/);
  assert.match(listener, /toast\(`This question was skipped for the session/);
});

test('Skip RPC is authenticated, validates publication, and writes only the current learner event', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /v_uid uuid := auth\.uid\(\)/i);
  assert.match(migration, /if v_uid is null/i);
  assert.match(migration, /where id = p_lesson_id\s+and is_published/i);
  assert.match(migration, /values \(\s*v_uid,\s*'lesson\.skipped'/i);
  assert.match(migration, /revoke all on function public\.record_lesson_skip\(text\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.record_lesson_skip\(text\) to authenticated/i);
  assert.doesNotMatch(migration, /grant insert on public\.learning_events/i);
});

test('answer submission remains server-validated and client cannot read answer keys', () => {
  assert.match(main, /supabase\.rpc\('submit_lesson_attempt'/);
  assert.match(progression, /v_correct:=v_key=p_answer/i);
  assert.match(progression, /revoke all on public\.lesson_answer_keys from anon, authenticated/i);
  assert.match(progression, /grant execute on function public\.submit_lesson_attempt\(text,jsonb,integer\) to authenticated/i);
});


test('attempt results update the Review Misses list even if the subsequent refresh fails', () => {
  assert.match(main, /state\.attempts\.unshift\(localAttempt\);[\s\S]{0,1000}renderPractice\(\);/);
  assert.match(main, /if \(result\.correct\) \{[\s\S]{0,120}state\.completed\.add\(lesson\.id\)/);
});

test('question loops are grouped by path and category, not by individual lesson', async () => {
  const flow = await import('../src/lib/practice-flow.js');
  const topic = Array.from({ length: 5 }, (_, index) => ({ id: `topic-${index + 1}`, path_id: 'mobile', category: 'Flutter fundamentals' }));
  const unrelated = [{ id: 'other', path_id: 'mobile', category: 'Mobile app state' }, { id: 'web', path_id: 'web', category: 'Flutter fundamentals' }];
  const session = flow.createPracticeSession([...topic, ...unrelated], 'topic-1');
  assert.deepEqual(session.pool, topic.map((item) => item.id));
  assert.equal(session.pool.length, 5);
});

test('navigation restores the animated indicator and activates exactly one page and tab', () => {
  assert.match(main, /node\.classList\.toggle\('active', isTarget\)/);
  assert.match(main, /node\.classList\.toggle\('active', active\)/);
  assert.match(main, /indicator\.style\.transform = `translateX\(\$\{selectedIndex \* 100\}%\)`/);
  assert.match(css, /\.dock-indicator\{display:block!important/);
  assert.doesNotMatch(css, /\.dock-indicator\{display:none!important/);
});

test('robot avatar options use DiceBear and are allow-listed', () => {
  assert.match(main, /https:\/\/api\.dicebear\.com\/10\.x\/bottts\/svg/);
  assert.match(main, /AVATAR_OPTIONS\.some\(\(avatar\) => avatar\.src === raw\)/);
  assert.match(main, /image\.referrerPolicy = 'no-referrer'/);
});

test('level badge is dynamic, aligned, and announces a level-up', () => {
  assert.match(main, /emblem\.textContent = `LVL \$\{level\.level\}`/);
  assert.match(main, /emblem\.classList\.add\('level-up'\)/);
  assert.match(css, /\.level-emblem\{width:62px!important/);
  assert.match(css, /@keyframes levelBadgePop/);
});


test('All topics uses a path-wide question loop while a chosen category stays scoped', () => {
  assert.match(main, /const scope = startOptions\.scope \|\| \(state\.practiceCategory === 'all' \? 'path' : 'category'\)/);
});
