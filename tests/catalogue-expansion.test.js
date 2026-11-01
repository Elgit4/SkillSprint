import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../tests/fixtures/migrations/007_expand_learning_catalogue.sql', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('catalogue migration adds three published technical learning paths', () => {
  for (const id of ['mobile', 'cloud', 'design']) assert.match(sql, new RegExp(`\\\\('${id}',`));
  assert.match(sql, /is_published=true/);
  assert.match(main, /mobile: 'phone', cloud: 'activity', design: 'sparkle'/);
});

test('catalogue migrations contain 120 unique topic-scoped questions and private answer keys', () => {
  const ids = [...sql.matchAll(/\\('((?:mobile|cloud|design)-(?:[a-z]+-)?\\d+)'/g)].map((match) => match[1]);
  assert.equal(ids.length, 120);
  assert.equal(new Set(ids).size, 120);
  assert.match(sql, /insert into public\\.lesson_answer_keys\\(lesson_id,correct_answer\\)/i);
  assert.match(sql, /jsonb_build_array\\(jsonb_build_object\\('id','a'/i);
  assert.match(sql, /on conflict ?\\(lesson_id\\) do update/i);
});

test('all six newer topics contain twenty questions after the repair migration', () => {
  for (const topic of ['mobile-flutter', 'mobile-state', 'cloud-deploy', 'cloud-container', 'design-ui', 'design-research']) {
    const count = [...sql.matchAll(new RegExp(`\\\\('${topic}-\\\\d+'`, 'g'))].length;
    assert.equal(count, 20, `${topic} should contain twenty linked questions`);
  }
  assert.match(sql, /delete from public\\.lessons[\\s\\S]*?repair/i);
});

test('lesson loading paginates until the final published row instead of stopping at 500', () => {
  const start = main.indexOf('async function fetchAllPublishedLessons');
  const end = main.indexOf('async function refresh()', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const loader = main.slice(start, end);
  assert.match(loader, /\\.range\\(from, to\\)/);
  assert.match(loader, /if \\(page\\.length < pageSize\\) break/);
  assert.doesNotMatch(loader, /\\.limit\\(500\\)/);
});
