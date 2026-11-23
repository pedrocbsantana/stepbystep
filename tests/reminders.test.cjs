const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../dist/reminders-core.js');
const R = globalThis.ReminderCore;

const db = {
  days: {
    '2026-11-04': { appointments: [{ id: 'old', title: 'Passado', start: '09:00', end: '10:00' }] },
    '2026-11-05': { appointments: [
      { id: 'a1', title: 'Entrevista, técnica; 1ª fase', start: '10:00', end: '11:00', notes: 'Link\nsala 2' },
      { id: 'a2', title: 'Feito', start: '08:00', end: '08:30', done: true },
    ] },
  },
  study: { notes: [
    { id: 'n1', title: 'CDS views', review: { enabled: true, nextDue: '2026-11-03', stage: 1 } },
    { id: 'n2', title: 'RAP', review: { enabled: false, nextDue: '2026-11-05', stage: 0 } },
  ] },
  applications: [
    { id: 'p1', company: 'ACME', role: 'Dev SAP', status: 'Enviada', followUp: '2026-11-07', nextAction: 'Mandar e-mail' },
    { id: 'p2', company: 'X', role: 'Y', status: 'Encerrada', followUp: '2026-11-06' },
  ],
  clareza: { start: '2026-10-01T00:00:00Z', checkins: [{ id: 'c', at: '2026-11-05T10:00:00Z', urge: 3 }] },
};
const items = R.collect(db, '2026-11-05');

test('coleta compromissos, revisões e acompanhamentos', () => {
  assert.deepEqual(items.map(v => v.uid), ['review-n1-1', 'event-a2', 'event-a1', 'followup-p1-2026-11-07']);
  assert.equal(items.find(v => v.kind === 'review').date, '2026-11-05', 'revisão atrasada aparece hoje');
  assert.ok(!JSON.stringify(items).includes('clareza'), 'Clareza nunca entra nos lembretes');
});

test('resumo do dia', () => {
  const s = R.summary(db, '2026-11-05');
  assert.deepEqual([s.events, s.reviews, s.followups], [1, 1, 0]);
  assert.equal(s.text, '1 compromisso · 1 revisão');
});

test('próximos compromissos (aviso 10 min antes)', () => {
  const up = R.upcoming(db, new Date('2026-11-05T09:52:00'), 10);
  assert.deepEqual(up.map(v => v.id), ['a1']);
  assert.equal(R.upcoming(db, new Date('2026-11-05T09:40:00'), 10).length, 0);
});

test('arquivo .ics', () => {
  const ics = R.toICS(items, new Date('2026-11-05T12:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20261105T100000'));
  assert.ok(ics.includes('SUMMARY:Entrevista\\, técnica\\; 1ª fase'));
  assert.ok(ics.includes('DESCRIPTION:Link\\nsala 2'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261107') && ics.includes('DTEND;VALUE=DATE:20261108'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, 'linha dobrada: ' + line);
});

test('exportação incremental: só o que é novo ou mudou; concluído não vai', () => {
  const exported = {};
  const next = R.changed(items, exported);
  assert.equal(next.length, 3);
  next.forEach(v => (exported[v.uid] = R.signature(v)));
  assert.equal(R.changed(items, exported).length, 0);
  const copy = JSON.parse(JSON.stringify(db));
  copy.days['2026-11-05'].appointments[0].start = '10:30';
  assert.deepEqual(R.changed(R.collect(copy, '2026-11-05'), exported).map(v => v.uid), ['event-a1']);
});

test('lembretes: padrão das configurações, lista própria e rótulos', () => {
  const R = globalThis.ReminderCore;
  assert.deepEqual(R.remindersOf({}, undefined), [10]);
  assert.deepEqual(R.remindersOf({}, { reminders: [60, 2880] }), [2880, 60]);
  assert.deepEqual(R.remindersOf({ reminders: [0, 10, 10] }, { reminders: [60] }), [10, 0]);
  assert.deepEqual(R.remindersOf({ reminders: [-5] }, {}), [10]);
  assert.equal(R.reminderLabel(0), 'na hora');
  assert.equal(R.reminderLabel(90), '1 h 30 min');
  assert.equal(R.reminderLabel(2880), '2 dias');
  assert.equal(R.reminderLabel(10080), '1 semana');
});

test('lembretes: avisa o vencido uma vez e junta os que venceram com o app fechado', () => {
  const R = globalThis.ReminderCore;
  const db = { prefs: {}, days: {
    '2026-11-25': { appointments: [{ id: 'a', title: 'Dentista', start: '14:00', end: '15:00', reminders: [2880, 60, 10] }] },
    '2026-11-20': { appointments: [{ id: 'old', title: 'Passado', start: '14:00', end: '15:00' }] },
  } };
  const notified = {};
  // 2 dias e 1 h antes: só o de 2 dias venceu.
  let due = R.dueReminders(db, new Date('2026-11-23T14:30:00'), notified);
  assert.deepEqual(due.map((d) => d.keys), [['2026-11-25|a|2880']]);
  assert.match(R.reminderText(due[0], new Date('2026-11-23T14:30:00')), /^Em 2 dias · .* · 14:00–15:00$/);
  due[0].keys.forEach((k) => (notified[k] = true));
  assert.deepEqual(R.dueReminders(db, new Date('2026-11-24T09:00:00'), notified), []);
  // Abriu 5 min antes: 1 h e 10 min venceram juntos, um aviso só.
  due = R.dueReminders(db, new Date('2026-11-25T13:55:00'), notified);
  assert.equal(due.length, 1);
  assert.deepEqual(due[0].keys, ['2026-11-25|a|60', '2026-11-25|a|10']);
  assert.match(R.reminderText(due[0], new Date('2026-11-25T13:55:00')), /^Em 5 min · hoje/);
  // Depois de começar, não avisa mais.
  assert.deepEqual(R.dueReminders(db, new Date('2026-11-25T14:01:00'), {}), []);
  assert.deepEqual(Object.keys(R.pruneNotified({ '2026-11-24|a|1': true, '2026-11-25|a|2': true }, '2026-11-25')), ['2026-11-25|a|2']);
});

test('lembretes: cada um vira um alarme no .ics', () => {
  const R = globalThis.ReminderCore;
  const ics = R.toICS([{ kind: 'event', uid: 'event-a', date: '2026-11-25', start: '14:00', end: '15:00', title: 'Dentista', reminders: [2880, 0] }]);
  assert.match(ics, /TRIGGER:-PT2880M/);
  assert.match(ics, /TRIGGER:PT0M/);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);
});
