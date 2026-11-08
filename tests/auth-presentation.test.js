import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/auth.css', import.meta.url), 'utf8');

test('the auth showcase uses one concise headline and supporting sentence', () => {
  const start = html.indexOf('<section class="auth-showcase"');
  const end = html.indexOf('</section>', start);
  assert.ok(start >= 0 && end > start, 'Expected the authentication showcase region');
  const showcase = html.slice(start, end);

  assert.equal((showcase.match(/<h1\\b/g) || []).length, 1, 'The showcase should have one primary headline');
  assert.match(showcase, /id="authShowcaseTitle"/);
  assert.ok(showcase.includes('Learn by<br><em>building.</em>'));
  assert.ok(showcase.includes('Practical technology missions that turn what you learn into real skills.'));
  assert.doesNotMatch(showcase, /auth-workbench|auth-overline|auth-float-card|auth-feature|LIVE PREVIEW|MY FIRST PROJECT/);
});

test('the account form copy stays focused on the phone and PIN flow', () => {
  const start = html.indexOf('<section class="auth-workspace"');
  const end = html.indexOf('</section>', start);
  const workspace = html.slice(start, end);

  assert.match(workspace, /<h2 id="authTitle">Sign in<\\/h2>/);
  assert.match(workspace, /Use your telephone number and six-digit PIN\\./);
  assert.match(workspace, /Keep your PIN private/);
  assert.doesNotMatch(workspace, /Supabase|SMS|email provider|secure account access/i);
  assert.doesNotMatch(workspace, /authFormEyebrow|auth-privacy|installAppBtnAuth/);
  assert.match(main, /Add your details and choose a six-digit PIN\\./);
  assert.match(main, /Use your telephone number and six-digit PIN\\./);
});

test('mobile account branding sits outside the form card and all account controls remain available', () => {
  const workspaceStart = html.indexOf('<section class="auth-workspace"');
  const workspaceEnd = html.indexOf('</section>', workspaceStart);
  const workspace = html.slice(workspaceStart, workspaceEnd);
  assert.ok(workspace.indexOf('class="auth-mobile-brand"') < workspace.indexOf('class="auth-form-wrap"'));
  for (const id of ['authForm', 'authPhone', 'authUsername', 'authDisplayName', 'authPassword', 'authConfirmPassword', 'authModeToggle', 'authPasswordToggle', 'forgotPassword', 'authMessage']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'Missing auth control: ' + id);
  }
});

test('authentication text alignment and responsive focus treatment are explicit', () => {
  assert.match(css, /#authGate \\.auth-form-heading h2\\s*\\{[^}]*text-align:\\s*left/s);
  assert.match(css, /#authGate \\.auth-form-heading p\\s*\\{[^}]*text-align:\\s*left/s);
  assert.match(css, /@media\\s*\\(max-width:\\s*900px\\)/);
  assert.match(css, /#authGate\\s+\\.auth-submit:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\\s*reduce/);
});
