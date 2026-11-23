const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../dist/day-core.js');
require('../dist/applications-core.js');
require('../dist/clareza-core.js');
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

test('hash estável: ordem de chaves não importa', () => {
  assert.equal(S.hash({ a: 1, b: { c: 2, d: 3 } }), S.hash({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(S.hash({ a: 1 }), S.hash({ a: 2 }));
});

// Os testes abaixo seguem uma história com três aparelhos e o mesmo servidor.
const pc = device({
  days: { '2026-11-05': day({ checks: [{ text: 'A', done: false }] }) },
  planTemplate: [{ name: 'ABAP', min: 60 }],
  study: { version: 1, subjects: [{ id: 's1', name: 'ABAP', order: 0 }], topics: [], notes: [], sessions: [], active: { local: true } },
  applications: [{ id: 'p1', company: 'ACME', role: 'Dev' }],
  clareza: { start: '2026-10-01T00:00:00Z', reasons: 'foco', env: { phoneOut: true }, streaks: [], checkins: [{ id: 'c1', urge: 2 }], sos: [], plans: [] },
  meta: { lastBackupAt: 1 }, focusPrefs: { bell: true },
});
const phone = device({ days: {} });

test('PC com dados envia; celular vazio recebe tudo, menos o que é do aparelho', () => {
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
});

test('celular edita; PC recebe', () => {
  phone.db.days['2026-11-05'].checks.push({ text: 'B', done: false });
  phone.db.clareza.checkins.push({ id: 'c2', urge: 4 });
  assert.equal(sync(phone).pushed, 2);
  sync(pc);
  assert.equal(pc.db.days['2026-11-05'].checks.length, 2);
  assert.equal(pc.db.clareza.checkins.length, 2);
});

test('remoção propaga', () => {
  pc.db.applications = [];
  sync(pc);
  sync(phone);
  assert.equal(phone.db.applications.length, 0);
});

test('conflito: quem sincroniza por último mantém a sua versão', () => {
  pc.db.days['2026-11-05'].rounds = 3;
  phone.db.days['2026-11-05'].rounds = 5;
  sync(pc);
  const rp = sync(phone);
  assert.ok(!rp.changed.includes('day:2026-11-05'), 'alteração local não enviada não é sobrescrita');
  assert.equal(phone.db.days['2026-11-05'].rounds, 5);
  sync(pc);
  assert.equal(pc.db.days['2026-11-05'].rounds, 5);
});

test('primeiro vínculo com dados próprios: união; "dados da nuvem" vence conflitos', () => {
  const tablet = device({ days: { '2026-11-05': day({ rounds: 9 }), '2026-11-01': day({ rounds: 1 }) } });
  sync(tablet, { preferRemote: true });
  assert.equal(tablet.db.days['2026-11-05'].rounds, 5, 'nuvem venceu o conflito');
  assert.equal(tablet.db.days['2026-11-01'].rounds, 1, 'dia só local foi mantido');
  sync(pc);
  assert.equal(pc.db.days['2026-11-01'].rounds, 1, 'e enviado para os outros');
});

test('idempotência: sincronizar de novo não muda nada', () => {
  assert.deepEqual(sync(pc), { changed: [], pushed: 0 });
  assert.deepEqual(sync(phone).pushed, 0);
});

test('dia vazio criado só por abrir o app não sobrescreve o dia vindo da nuvem', () => {
  const skip = (k, v) => k.startsWith('day:') && DayCore.isEmptyDay(v);
  const fresh = { db: { days: { '2026-11-05': day() } }, known: {}, lastRev: 0 };
  S.applyRemote(fresh.db, since(0), fresh.known, { skip });
  assert.equal(fresh.db.days['2026-11-05'].rounds, 5, 'nuvem preencheu o dia vazio');
  assert.equal(S.localChanges(S.explode(fresh.db, skip), fresh.known).filter(c => c.key.startsWith('day:')).length, 0);
});

test('documento estragado da nuvem é recusado e não marca nada como conhecido', () => {
  const db = { days: { '2026-11-05': day({ rounds: 2 }) } };
  const known = { 'day:2026-11-05': S.hash(db.days['2026-11-05']) };
  const rejected = [];
  const rows = [
    { key: 'day:2026-11-05', data: { $enc: 1, iv: 'x', ct: 'y' }, deleted: false, rev: 1 },
    { key: 'day:2026-11-06', data: day({ rounds: 1 }), deleted: false, rev: 2 },
    { key: 'study:subjects:s9', data: { id: 'outro', name: 'x' }, deleted: false, rev: 3 },
    { key: 'day:2026-11-07', data: null, deleted: true, rev: 4 },
  ];
  const changed = S.applyRemote(db, rows, known, { validate: S.validateDoc, onReject: k => rejected.push(k) });
  assert.deepEqual(rejected, ['day:2026-11-05', 'study:subjects:s9']);
  assert.deepEqual(changed, ['day:2026-11-06']);
  assert.equal(db.days['2026-11-05'].rounds, 2, 'versão local intacta');
  assert.equal(known['day:2026-11-05'], S.hash(db.days['2026-11-05']), 'nada a reenviar por causa da recusa');
  assert.equal(S.localChanges(S.explode(db), known).filter(c => c.key === 'day:2026-11-05').length, 0);
});

test('validação por tipo de documento', () => {
  const ok = [
    ['plan', [{ name: 'A', min: 10 }]],
    ['music', { items: [], selected: '' }],
    ['sections', { agenda: true }],
    ['clz:core', { start: '2026-10-01T00:00:00Z', reasons: '', env: {} }],
    ['study:subjects:s1', { id: 's1', name: 'ABAP' }],
    ['study:topics:t1', { id: 't1', name: 'CDS', subjectId: 's1', parentId: null }],
    ['study:notes:n1', { id: 'n1', subjectId: 's1', title: '', body: '', questions: [] }],
    ['study:sessions:x1', { id: 'x1', minutes: 25, date: '2026-11-05', subjectName: 'ABAP' }],
    ['clz:checkins:c1', { id: 'c1', at: '2026-11-05T10:00:00Z', urge: 2 }],
    ['clz:plans:p1', { id: 'p1', when: 'a', then: 'b' }],
  ];
  for (const [k, v] of ok) assert.doesNotThrow(() => S.validateDoc(k, v), k);
  const bad = [
    ['plan', []],
    ['music', { items: 'x' }],
    ['study:subjects:s1', { id: 's1', name: 3 }],
    ['study:notes:n1', { id: 'n1', subjectId: 's1', title: '', body: null }],
    ['study:sessions:x1', { id: 'x1', minutes: -1, date: '2026-11-05', subjectName: 'A' }],
    ['clz:checkins:c1', { id: 'c1', at: 'ontem', urge: 2 }],
    ['app:p1', { id: 'p1', company: 'ACME' }],
    ['desconhecido:1', { id: '1' }],
  ];
  for (const [k, v] of bad) assert.throws(() => S.validateDoc(k, v), undefined, k);
});

test('cifragem: ida e volta, sem texto aberto e presa à chave do documento', async () => {
  const key = await S.deriveKey('senha-de-teste');
  const value = { reasons: 'motivo pessoal', env: { a: true }, start: null };
  const sealed = await S.seal(key, 'clz:core', value);
  assert.ok(S.isSealed(sealed));
  assert.ok(!JSON.stringify(sealed).includes('motivo'), 'nada legível no banco');
  assert.deepEqual(await S.unseal(key, 'clz:core', sealed), value);
  const again = await S.seal(key, 'clz:core', value);
  assert.notEqual(again.iv, sealed.iv, 'vetor novo a cada envio');
  await assert.rejects(S.unseal(key, 'day:2026-11-05', sealed), 'não abre se trocar de documento');
  await assert.rejects(S.unseal(await S.deriveKey('outra'), 'clz:core', sealed), 'não abre com outra chave');
  assert.deepEqual(await S.unseal(key, 'plan', [{ name: 'A', min: 1 }]), [{ name: 'A', min: 1 }], 'documento antigo, aberto, passa direto');
  const big = { text: 'x'.repeat(300000) };
  assert.deepEqual(await S.unseal(key, 'day:x', await S.seal(key, 'day:x', big)), big, 'textos grandes');
});
