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
assert.deepEqual(items.map(v => v.uid), ['review-n1-1', 'event-a2', 'event-a1', 'followup-p1-2026-11-07']);
assert.equal(items.find(v => v.kind === 'review').date, '2026-11-05', 'revisão atrasada aparece hoje');
assert.ok(!JSON.stringify(items).includes('clareza'), 'Clareza nunca entra nos lembretes');

const s = R.summary(db, '2026-11-05');
assert.deepEqual([s.events, s.reviews, s.followups], [1, 1, 0]);
assert.equal(s.text, '1 compromisso · 1 revisão');

const up = R.upcoming(db, new Date('2026-11-05T09:52:00'), 10);
assert.deepEqual(up.map(v => v.id), ['a1']);
assert.equal(R.upcoming(db, new Date('2026-11-05T09:40:00'), 10).length, 0);

const ics = R.toICS(items, new Date('2026-11-05T12:00:00Z'));
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
assert.ok(ics.includes('DTSTART:20261105T100000'));
assert.ok(ics.includes('SUMMARY:Entrevista\\, técnica\\; 1ª fase'));
assert.ok(ics.includes('DESCRIPTION:Link\\nsala 2'));
assert.ok(ics.includes('DTSTART;VALUE=DATE:20261107') && ics.includes('DTEND;VALUE=DATE:20261108'));
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, 'linha dobrada: ' + line);

// Só exporta o que é novo ou mudou; compromisso concluído não vai
const exported = {};
let next = R.changed(items, exported);
assert.equal(next.length, 3);
next.forEach(v => (exported[v.uid] = R.signature(v)));
assert.equal(R.changed(items, exported).length, 0);
db.days['2026-11-05'].appointments[0].start = '10:30';
assert.deepEqual(R.changed(R.collect(db, '2026-11-05'), exported).map(v => v.uid), ['event-a1']);

console.log('PASS: lembretes — coleta, resumo, próximos compromissos, .ics e exportação incremental.');
