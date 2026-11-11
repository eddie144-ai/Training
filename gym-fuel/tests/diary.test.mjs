// Cut diary: day count, YouTube draft, private-by-default, and metadata with no clip bytes.
//   node --test gym-fuel/tests/diary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'diary.js'), 'utf8');
const context = vm.createContext({ console });
vm.runInContext(`${source}\nglobalThis.Diary = Diary;\n`, context);
const D = context.Diary;

test('the cut starts on 8 Nov 2026, and that day is day 1', () => {
  assert.equal(D.CUT_START, '2026-11-08');
  assert.equal(D.cutDay('2026-11-08'), 1);
  assert.equal(D.cutDay('2026-11-10'), 3);
  assert.equal(D.cutDay('2026-11-11'), 4);
  assert.equal(D.cutDay('2026-11-07'), 0);
  assert.equal(D.cutDay('nope'), null);
});

test('the day’s weigh-in is the one logged on that date', () => {
  const weights = [{ date: '2026-11-10', kg: 99 }, { date: '2026-11-11', kg: 98.54 }];
  assert.equal(D.weightKg(weights, '2026-11-11'), 98.5);
  assert.equal(D.weightKg(weights, '2026-11-09'), null);
  assert.equal(D.weightKg(null, '2026-11-11'), null);
});

test('a YouTube draft starts private and carries the day and the weight', () => {
  const draft = D.youtubeDraft({ cutDay: 4, weight: 98.5, date: '2026-11-11', note: 'Waist looks tighter' });
  assert.equal(draft.privacy, 'private');
  assert.equal(draft.title, 'Day 4 · 98.5 kg');
  assert.match(draft.description, /Day 4 of the cut/);
  assert.match(draft.description, /98\.5 kg/);
  assert.match(draft.description, /Waist looks tighter/);
  const named = D.youtubeDraft({ title: 'Morning check', cutDay: 4, weight: 98.5, date: '2026-11-11' });
  assert.equal(named.title, 'Morning check');
  assert.match(named.description, /Day 4/);
  assert.match(named.description, /98\.5 kg/);
  assert.equal(D.youtubeDraft({ cutDay: 4, date: '2026-11-11' }).title, 'Day 4');
  assert.match(D.youtubeDraft({ cutDay: 4, date: '2026-11-11' }).description, /No weigh-in/);
});

test('the upload body stays private unless he picks unlisted or public', () => {
  assert.equal(D.uploadBody({ title: 'Day 4', description: 'notes' }).status.privacyStatus, 'private');
  assert.equal(D.uploadBody({ privacy: 'friends' }).status.privacyStatus, 'private');
  assert.equal(D.uploadBody({ privacy: '' }).status.privacyStatus, 'private');
  assert.equal(D.uploadBody({ privacy: 'unlisted' }).status.privacyStatus, 'unlisted');
  assert.equal(D.uploadBody({ privacy: 'public', title: 'x'.repeat(200) }).status.privacyStatus, 'public');
  assert.equal(D.uploadBody({ privacy: 'public', title: 'x'.repeat(200) }).snippet.title.length, 100);
  assert.equal(D.uploadBody({ title: 'Day 4' }).snippet.categoryId, '22');
  assert.equal(D.uploadBody({}).status.selfDeclaredMadeForKids, false);
});

test('YouTube errors stay plain, including setup and quota', () => {
  assert.equal(D.youtubeProblem(403, { error: { errors: [{ reason: 'accessNotConfigured' }], message: 'YouTube Data API has not been used' } }).code, 'setup');
  assert.equal(D.youtubeProblem(403, { error: { errors: [{ reason: 'quotaExceeded' }], message: 'quota' } }).code, 'quota');
  assert.equal(D.youtubeProblem(403, { error: { errors: [{ reason: 'youtubeSignupRequired' }] } }).code, 'channel');
  assert.equal(D.youtubeProblem(401, { error: { message: 'Invalid Credentials' } }).code, 'auth');
  assert.equal(D.youtubeProblem(403, { error: { status: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', message: 'insufficient authentication scopes' } }).code, 'scope');
  assert.equal(D.youtubeProblem(0, null).code, 'network');
  assert.match(D.youtubeProblem(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }).text, /6 uploads/);
});

test('a saved entry keeps the note and drops the clip, the token and a bad link', () => {
  const clean = D.cleanEntry({
    id: 'abc',
    at: '2026-11-11T12:00:00.000Z',
    date: '2026-11-11',
    kind: 'video',
    title: 'Morning check',
    note: 'Waist looks tighter',
    weight: 98.5,
    cutDay: 4,
    mime: 'video/webm',
    bytes: 12,
    blob: 'CLIPMARKER',
    token: 'secret-token',
    youtube: { id: 'abcdefghijk', url: 'javascript:alert(1)', privacy: 'public' },
  });
  const raw = JSON.stringify(clean);
  assert.equal(raw.includes('CLIPMARKER'), false);
  assert.equal(raw.includes('secret-token'), false);
  assert.equal(raw.includes('javascript:'), false);
  assert.equal(clean.title, 'Morning check');
  assert.equal(clean.cutDay, 4);
  assert.equal(clean.weight, 98.5);
  assert.equal(clean.youtube.url, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(clean.youtube.privacy, 'public');
  assert.equal(D.cleanEntry({ id: 'x', date: '2026-11-08', kind: 'video', at: '2026-11-08T10:00:00.000Z', youtube: { id: 'javascript:alert(1)' } }).youtube, undefined);
  assert.equal(D.cleanEntry({ id: 'x', date: '2026-11-08', kind: 'video', at: '2026-11-08T10:00:00.000Z' }).cutDay, 1);
  assert.equal(D.cleanEntry({ id: 'x', date: '2026-11-08', kind: 'photo' }), null);
  assert.equal(D.cleanEntry(null), null);
});

test('the clip store is IndexedDB, and YouTube is a separate sign-in from Drive', () => {
  assert.match(source, /gymfuel-diary/);
  assert.doesNotMatch(source, /localStorage/);
  const yt = fs.readFileSync(path.join(root, 'youtube.js'), 'utf8');
  assert.match(yt, /https:\/\/www\.googleapis\.com\/auth\/youtube\.upload/);
  assert.doesNotMatch(yt, /localStorage/);
  assert.doesNotMatch(yt, /sessionStorage/);
  assert.match(yt, /privacy/);
  const drive = fs.readFileSync(path.join(root, 'drive.js'), 'utf8');
  assert.match(drive, /drive\.file/);
  assert.doesNotMatch(drive, /youtube/);
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.equal(app.split('YouTube.send(').length - 1, 1);
  assert.match(app, /data-act="yt-go"/);
});
