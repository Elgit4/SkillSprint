import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/auth.css', import.meta.url), 'utf8');

test('the auth showcase has one clear promise and one integrated learning visual', () => {
  const start = html.indexOf('<section class="auth-showcase"');
  const end = html.indexOf('</section>', start);
  assert.ok(start >= 0 && end > start, 'Expected the authentication showcase region');
  const showcase = html.slice(start, end);

  assert.equal((showcase.match(/<h1\b/g) || []).length, 1, 'The showcase should have one primary headline');
  assert.match(showcase, /id="authShowcaseTitle"/);
  assert.match(showcase, /class="auth-workbench"/);
  assert.match(showcase, /Turn curiosity into<br><em>real skills\\.<\\/em>/);
  assert.doesNotMatch(showcase, /TECH SKILLS, BUILT BY DOING|YOUR NEXT MOVE STARTS HERE|auth-float-card|auth-showcase-bottom|auth-feature/);
});

test('auth copy avoids internal provider terminology', () => {
  assert.doesNotMatch(main, /Your PIN is protected by Supabase Auth/);
  assert.match(main, /Keep your PIN private/);
});

test('mobile account branding sits outside the form card and the auth fields remain available', () => {
  const workspaceStart = html.indexOf('<section class="auth-workspace"');
  const workspaceEnd = html.indexOf('</section>', workspaceStart);
  const workspace = html.slice(workspaceStart, workspaceEnd);
  assert.ok(workspace.indexOf('class="auth-mobile-brand"') < workspace.indexOf('class="auth-form-wrap"'));
  for (const id of ['authForm', 'authPhone', 'authUsername', 'authDisplayName', 'authPassword', 'authConfirmPassword', 'authModeToggle', 'authPasswordToggle', 'forgotPassword', 'authMessage']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Missing auth control: ' + id);
  }
});

test('the composed authentication layout has explicit desktop, mobile and accessible focus treatment', () => {
  assert.match(css, /#authGate\s+\.auth-workbench/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /#authGate\s+\.auth-submit:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
