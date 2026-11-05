const assert = require('node:assert/strict');
require('../dist/clareza-core.js');
require('../dist/applications-core.js');
require('../dist/study-core.js');
const K = globalThis.ClarezaCore, S = globalThis.StudyCore;
const at = s => new Date(s).getTime();

// Contagem, recorde e total acumulado
const c = K.empty();
K.begin(c, '2026-10-01T22:00:00');
assert.equal(K.current(c, at('2026-10-01T23:00:00')), 0);
assert.equal(K.current(c, at('2026-10-11T22:00:00')), 10);
assert.equal(K.restart(c, '2026-10-11T23:00:00', { triggers: ['Tédio', 123], note: 'x' }), 10);
assert.deepEqual(c.streaks[0].triggers, ['Tédio']);
assert.equal(K.current(c, at('2026-10-14T23:30:00')), 3);
assert.equal(K.best(c, at('2026-10-14T23:30:00')), 10);
assert.equal(K.total(c, at('2026-10-14T23:30:00')), 13, 'recomeço não apaga os dias anteriores');

// Marcos
assert.deepEqual(K.milestone(0), { prev: 0, next: 1, remaining: 1, progress: 0 });
assert.equal(K.milestone(10).next, 14);
assert.equal(K.milestone(10).remaining, 4);
assert.equal(K.milestone(400).next, null);

// Ajuste de início: sem futuro e sem passar do último recomeço
assert.throws(() => K.setStart(c, '2030-01-01T00:00:00', at('2026-10-15T00:00:00')));
assert.throws(() => K.setStart(c, '2026-10-05T00:00:00', at('2026-10-15T00:00:00')));
K.setStart(c, '2026-10-12T08:00:00', at('2026-10-15T00:00:00'));

// Calendário
assert.equal(K.dayStatus(c, '2026-10-11', at('2026-10-15T00:00:00')), 'reset');
assert.equal(K.dayStatus(c, '2026-10-05', at('2026-10-15T00:00:00')), 'firm');
assert.equal(K.dayStatus(c, '2026-09-20', at('2026-10-15T00:00:00')), null);
assert.equal(K.dayStatus(c, '2026-10-20', at('2026-10-15T00:00:00')), null, 'futuro fica vazio');

// Padrões
c.checkins.push({ id: 'k1', at: '2026-10-13T23:30:00', urge: 4, triggers: ['Celular na cama', 'Tédio'], note: '' });
c.sos.push({ id: 's1', at: '2026-10-14T01:00:00', result: 'passed', minutes: 10 });
const p = K.patterns(c);
assert.equal(p.triggers['Tédio'], 2);
assert.equal(p.periods.Noite, 2);
assert.equal(p.periods.Madrugada, 1);
assert.deepEqual(p.sos, { total: 1, passed: 1 });

// Validação
K.validate(c);
assert.throws(() => K.validate({ checkins: [{ id: 'x', at: 'nope', urge: 1 }] }));
assert.throws(() => K.validate({ sos: [{ id: 'x', at: '2026-10-14T01:00:00', result: 'talvez' }] }));

// Mesclagem idempotente; local ganha
const inc = JSON.parse(JSON.stringify(c));
inc.reasons = 'outro';
inc.checkins.push({ id: 'k2', at: '2026-10-14T10:00:00', urge: 1, triggers: [], note: '' });
const local = K.normalize({ ...JSON.parse(JSON.stringify(c)), reasons: 'meu motivo' });
const m1 = K.merge(local, inc), m2 = K.merge(m1, inc);
assert.equal(m1.checkins.length, 2);
assert.equal(m2.checkins.length, 2, 'importar duas vezes não duplica');
assert.equal(m1.reasons, 'meu motivo');
assert.equal(m1.start, local.start);
assert.equal(K.merge(K.empty(), inc).start, inc.start, 'backup restaura o início quando não há local');

// Integração com o backup completo
const day = { blocks: [], checks: [], distractions: [], timerMinutes: 10 };
const payload = { format: 'stepbystep-backup', version: 1, data: { days: { '2026-10-14': day }, study: S.empty(), clareza: inc } };
const valid = S.validateBackup(payload);
const merged = S.mergeBackup({ days: {}, study: S.empty() }, valid);
assert.equal(merged.clareza.checkins.length, 2);
assert.throws(() => S.validateBackup({ ...payload, data: { ...payload.data, clareza: { start: 'x' } } }));
// Backups antigos, sem Clareza, continuam válidos
S.validateBackup({ format: 'stepbystep-backup', version: 1, data: { days: {}, study: S.empty() } });

console.log('PASS: Clareza — contagem, total acumulado, marcos, calendário, padrões, validação e backup.');
