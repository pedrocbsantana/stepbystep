const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../dist/day-core.js');
require('../dist/study-core.js');
const C = globalThis.StudyCore;

test('revisões espaçadas: agenda, notas, repetição e fim do ciclo', () => {
  const n = { review: null };
  C.schedule(n, '2026-11-01');
  assert.equal(n.review.nextDue, '2026-11-02');
  assert.equal(C.rate(n, 'good', '2026-11-01'), false, 'não revisa antes da data');
  assert.equal(C.rate(n, 'no', '2026-11-02'), true);
  assert.equal(n.review.stage, 0);
  assert.equal(n.review.nextDue, '2026-11-03');
  assert.equal(C.rate(n, 'no', '2026-11-02'), false, 'mesma revisão não conta duas vezes');
  C.rate(n, 'partial', '2026-11-03');
  assert.equal(n.review.stage, 0);
  assert.equal(n.review.nextDue, '2026-11-05');
  C.rate(n, 'good', '2026-11-05');
  assert.equal(n.review.stage, 1);
  assert.equal(n.review.nextDue, '2026-11-06');
  C.rate(n, 'good', '2026-11-06');
  assert.equal(n.review.nextDue, '2026-11-08');
  C.rate(n, 'good', '2026-11-08');
  assert.equal(n.review.nextDue, '2026-11-16');
  C.rate(n, 'good', '2026-11-16');
  assert.equal(n.review.enabled, false);
  assert.equal(n.review.history.length, 6);
  C.schedule(n, '2026-12-01');
  assert.equal(n.review.history.length, 6, 'reagendar mantém o histórico');
  assert.equal(n.review.stage, 0);
});

test('datas', () => {
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.validDate('2026-02-30'), false);
});

test('Markdown escapa HTML e destaca código', () => {
  const html = C.markdown('# Título\n**teste**\n- [x] feito\n```abap\nSELECT 1 < 2\n```\n<img src=x onerror=alert(1)>');
  assert.ok(html.includes('syntax-keyword'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('☑'));
});

test('mesclar backup: local ganha, novos entram, sem duplicar', () => {
  const current = { days: { '2026-11-01': { preserve: true } }, music: { selected: 'keep' }, study: C.empty() };
  current.study.subjects.push({ id: 's-one', name: 'local' });
  const incoming = { days: { '2026-11-01': { preserve: false }, '2026-11-02': { other: true } }, study: C.empty() };
  incoming.study.subjects.push({ id: 's-one', name: 'remote' }, { id: 's-two', name: 'new' });
  const merged = C.mergeBackup(current, incoming);
  assert.equal(merged.study.subjects[0].name, 'local');
  assert.equal(merged.study.subjects.length, 2);
  assert.equal(merged.days['2026-11-01'].preserve, true);
  assert.equal(merged.music.selected, 'keep');
  assert.equal(current.study.subjects.length, 1, 'não altera o original');
  assert.equal(C.mergeBackup(merged, incoming).study.subjects.length, 2);
});

test('validação de estudos e de backup', () => {
  const bad = C.empty();
  bad.subjects = [{ id: 's-one', name: 'x' }];
  bad.topics = [{ id: 's-t', name: 't', subjectId: 's-one', parentId: 's-t' }];
  assert.throws(() => C.validateStudy(bad), /Hierarquia/);
  assert.throws(() => C.validateBackup({ format: 'invalid' }));
  const day = { blocks: [{ name: 'A', min: 0 }], checks: [], distractions: [], timerMinutes: 10 };
  assert.throws(
    () => C.validateBackup({ format: 'stepbystep-backup', version: 1, data: { days: { '2026-11-01': day }, study: C.empty() } }),
    /2026-11-01/,
    'erro diz qual dia está estragado',
  );
});

test('importar o mesmo backup duas vezes não duplica sessões', () => {
  const a = { days: {}, study: C.empty() }, b = { days: {}, study: C.empty() };
  b.study.sessions = [{ id: 'session-one', date: '2026-11-04', minutes: 12.5, subjectName: 'ABAP' }];
  const first = C.mergeBackup(a, b), second = C.mergeBackup(first, b);
  assert.equal(second.study.sessions.length, 1);
  assert.equal(second.study.sessions[0].minutes, 12.5);
});
