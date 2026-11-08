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

  assert.equal(showcase.split('<h1').length - 1, 1, 'The showcase should have one primary headline');
  assert.ok(showcase.includes('id="authShowcaseTitle"'));
  assert.ok(showcase.includes('Learn by<br><em>building.</em>'));
  assert.ok(showcase.includes('Practical technology missions that turn what you learn into real skills.'));
  assert.equal(showcase.includes('class="auth-workbench"'), false);
  assert.equal(showcase.includes('auth-overline'), false);
  assert.equal(showcase.includes('auth-float-card'), false);
  assert.equal(showcase.includes('LIVE PREVIEW'), false);
});

test('the account form copy stays focused on the phone and PIN flow', () => {
  const start = html.indexOf('<section class="auth-workspace"');
  const end = html.indexOf('</section>', start);
  const workspace = html.slice(start, end);

  assert.ok(workspace.includes('<h2 id="authTitle">Sign in</h2>'));
  assert.ok(workspace.includes('Use your telephone number and six-digit PIN.'));
  assert.ok(workspace.includes('Keep your PIN private'));
  assert.equal(workspace.includes('authFormEyebrow'), false);
  assert.equal(workspace.includes('auth-privacy'), false);
  assert.equal(workspace.includes('installAppBtnAuth'), false);
  assert.ok(main.includes('Add your details and choose a six-digit PIN.'));
  assert.ok(main.includes('Use your telephone number and six-digit PIN.'));
});

test('mobile account branding sits outside the form card and all account controls remain available', () => {
  const start = html.indexOf('<section class="auth-workspace"');
  const end = html.indexOf('</section>', start);
  const workspace = html.slice(start, end);
  assert.ok(workspace.indexOf('class="auth-mobile-brand"') < workspace.indexOf('class="auth-form-wrap"'));
  for (const id of ['authForm', 'authPhone', 'authUsername', 'authDisplayName', 'authPassword', 'authConfirmPassword', 'authModeToggle', 'authPasswordToggle', 'forgotPassword', 'authMessage']) {
    assert.ok(html.includes('id="' + id + '"'), 'Missing auth control: ' + id);
  }
});

test('authentication text alignment and responsive focus treatment are explicit', () => {
  assert.ok(css.includes('#authGate .auth-form-heading h2'));
  assert.ok(css.includes('#authGate .auth-form-heading p'));
  assert.ok(css.includes('text-align: left;'));
  assert.ok(css.includes('@media (max-width: 900px)'));
  assert.ok(css.includes('#authGate .auth-submit:focus-visible'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
});
