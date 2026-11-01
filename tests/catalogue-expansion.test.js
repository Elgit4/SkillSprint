import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../tests/fixtures/migrations/007_expand_learning_catalogue.sql', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('catalogue migration adds three published technical learning paths', () => {
  for (const id of ['mobile', 'cloud', 'design']) assert.match(sql, new RegExp(`\\('${id}',`));
  assert.match(sql, /is_published=true/);
  assert.match(main, /mobile: 'phone', cloud: 'activity', design: 'sparkle'/);
});

test('catalogue migration adds 30 questions with server-side answer keys', () => {
  const ids = [...sql.matchAll(/\('((?:mobile|cloud|design)-[a-z]+-\d+)'/g)].map((match) => match[1]);
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30);
  assert.match(sql, /insert into public\.lesson_answer_keys\(lesson_id,correct_answer\)/i);
  assert.match(sql, /jsonb_build_array\(jsonb_build_object\('id','a'/i);
  assert.match(sql, /on conflict\(lesson_id\) do update set correct_answer=excluded\.correct_answer/i);
});

test('each new topic has five questions so Next and Skip can advance through a real sequence', () => {
  for (const topic of ['mobile-flutter', 'mobile-state', 'cloud-deploy', 'cloud-container', 'design-ui', 'design-research']) {
    const count = [...sql.matchAll(new RegExp(`\\('${topic}-\\d+'`, 'g'))].length;
    assert.equal(count, 5, `${topic} should contain five linked questions`);
  }
});
