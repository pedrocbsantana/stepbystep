const assert = require('node:assert/strict');
require('../dist/sync-core.js');
const S = globalThis.SyncCore;

// Servidor de mentira com a mesma regra do banco: upsert por chave, rev crescente.
const server = { rows: new Map(), seq: 0 };
const upsert = (changes, device) => changes.forEach(c => server.rows.set(c.key, { key: c.key, data: JSON.parse(JSON.stringify(c.data)), deleted: c.deleted, rev: ++server.seq, device }));
const since = rev => [...server.rows.values()].filter(r => r.rev > rev).sort((a, b) => a.rev - b.rev);

function device(db) { return { db, known: {}, lastRev: 0 }; }
function sync(d, opts) {
  const rows = since(d.lastRev);
  const changed = S.applyRemote(d.db, rows, d.known, opts);
  d.lastRev = Math.max(d.lastRev, ...rows.map(r => r.rev));
  const changes = S.localChanges(S.explode(d.db), d.known);
  upsert(changes, 'x');
  changes.forEach(c => (d.known[c.key] = c.hash));
  return { changed, pushed: changes.length };
}
const day = extra => ({ blocks: [], checks: [], distractions: [], timerMinutes: 10, rounds: 0, ...extra });

// Hash estável: ordem de chaves não importa
assert.equal(S.hash({ a: 1, b: { c: 2, d: 3 } }), S.hash({ b: { d: 3, c: 2 }, a: 1 }));
assert.notEqual(S.hash({ a: 1 }), S.hash({ a: 2 }));

// PC com dados, celular vazio
const pc = device({
  days: { '2026-11-05': day({ checks: [{ text: 'A', done: false }] }) },
  planTemplate: [{ name: 'ABAP', min: 60 }],
  study: { version: 1, subjects: [{ id: 's1', name: 'ABAP', order: 0 }], topics: [], notes: [], sessions: [], active: { local: true } },
  applications: [{ id: 'p1', company: 'ACME', role: 'Dev' }],
  clareza: { start: '2026-10-01T00:00:00Z', reasons: 'foco', env: { phoneOut: true }, streaks: [], checkins: [{ id: 'c1', urge: 2 }], sos: [], plans: [] },
  meta: { lastBackupAt: 1 }, focusPrefs: { bell: true },
});
const phone = device({ days: {} });

assert.ok(sync(pc).pushed >= 6);
const r1 = sync(phone);
assert.ok(r1.changed.includes('day:2026-11-05'));
assert.deepEqual(phone.db.days['2026-11-05'].checks, [{ text: 'A', done: false }]);
assert.equal(phone.db.study.subjects[0].name, 'ABAP');
assert.equal(phone.db.applications[0].company, 'ACME');
assert.equal(phone.db.clareza.reasons, 'foco');
assert.equal(phone.db.clareza.checkins.length, 1);
assert.equal(phone.db.planTemplate[0].name, 'ABAP');
assert.equal(phone.db.meta, undefined, 'meta não sincroniza');
assert.equal(phone.db.study.active, undefined, 'sessão ativa não sincroniza');
assert.equal(r1.pushed, 0, 'nada novo para enviar depois de receber');

// Celular edita; PC recebe
phone.db.days['2026-11-05'].checks.push({ text: 'B', done: false });
phone.db.clareza.checkins.push({ id: 'c2', urge: 4 });
assert.equal(sync(phone).pushed, 2);
sync(pc);
assert.equal(pc.db.days['2026-11-05'].checks.length, 2);
assert.equal(pc.db.clareza.checkins.length, 2);

// Remoção propaga
pc.db.applications = [];
sync(pc);
sync(phone);
assert.equal(phone.db.applications.length, 0);

// Conflito: os dois mudam o mesmo dia sem sincronizar; quem sincroniza por último mantém a sua versão
pc.db.days['2026-11-05'].rounds = 3;
phone.db.days['2026-11-05'].rounds = 5;
sync(pc);
const rp = sync(phone);
assert.ok(!rp.changed.includes('day:2026-11-05'), 'alteração local não enviada não é sobrescrita');
assert.equal(phone.db.days['2026-11-05'].rounds, 5);
sync(pc);
assert.equal(pc.db.days['2026-11-05'].rounds, 5);

// Primeiro vínculo de um aparelho com dados próprios: união; "dados da nuvem" vence conflitos
const tablet = device({ days: { '2026-11-05': day({ rounds: 9 }), '2026-11-01': day({ rounds: 1 }) } });
sync(tablet, { preferRemote: true });
assert.equal(tablet.db.days['2026-11-05'].rounds, 5, 'nuvem venceu o conflito');
assert.equal(tablet.db.days['2026-11-01'].rounds, 1, 'dia só local foi mantido');
sync(pc);
assert.equal(pc.db.days['2026-11-01'].rounds, 1, 'e enviado para os outros');

// Idempotência: sincronizar de novo não muda nada
assert.deepEqual(sync(pc), { changed: [], pushed: 0 });
assert.deepEqual(sync(phone).pushed, 0);

// Dia vazio criado só por abrir o app não sobrescreve o dia vindo da nuvem
const empty = v => !(v.rounds || v.checks?.length || v.distractions?.length);
const skip = (k, v) => k.startsWith('day:') && empty(v);
const fresh = { db: { days: { '2026-11-05': day() } }, known: {}, lastRev: 0 };
S.applyRemote(fresh.db, since(0), fresh.known, { skip });
assert.equal(fresh.db.days['2026-11-05'].rounds, 5, 'nuvem preencheu o dia vazio');
assert.equal(S.localChanges(S.explode(fresh.db, skip), fresh.known).filter(c => c.key.startsWith('day:')).length, 0);

console.log('PASS: sincronização — hash estável, envio e recebimento, remoção, conflito, primeiro vínculo e idempotência.');
