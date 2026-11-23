// Roda o sync.js de verdade, em dois "aparelhos", contra um Neon de mentira.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '../dist', f), 'utf8');
const SOURCES = ['day-core.js', 'applications-core.js', 'clareza-core.js', 'sync-core.js'].map(read);
const SYNC = read('sync.js');
const wait = (ms = 400) => new Promise(r => setTimeout(r, ms));

// ---------- Neon de mentira ----------
const server = { password: 'chave-certa', rows: new Map(), seq: 0, requests: [] };
async function fakeFetch(url, opts) {
  const conn = opts.headers['Neon-Connection-String'];
  const password = decodeURIComponent(conn.match(/:\/\/[^:]+:([^@]+)@/)[1]);
  const { query, params } = JSON.parse(opts.body);
  server.requests.push({ query, keepalive: opts.keepalive, size: opts.body.length });
  const reply = (status, body) => ({ ok: status === 200, json: async () => body });
  if (password !== server.password) return reply(400, { message: 'password authentication failed for user' });
  if (query.includes('count(*)')) return reply(200, { rows: [{ n: [...server.rows.values()].filter(r => !r.deleted).length }] });
  if (query.startsWith('SELECT key')) {
    const rows = [...server.rows.values()].filter(r => r.rev > Number(params[0])).sort((a, b) => a.rev - b.rev)
      .map(r => ({ key: r.key, data: r.data == null ? null : JSON.stringify(r.data), deleted: r.deleted, rev: String(r.rev) }));
    return reply(200, { rows });
  }
  if (query.includes('INSERT INTO sync_docs')) {
    for (const x of JSON.parse(params[0])) server.rows.set(x.key, { key: x.key, data: x.data, deleted: x.deleted, rev: ++server.seq });
    return reply(200, { rows: [] });
  }
  throw Error('consulta inesperada: ' + query);
}

// ---------- Aparelho de mentira ----------
function device(db, syncState) {
  const store = new Map();
  if (syncState) store.set('stepbystep-sync', JSON.stringify(syncState));
  const els = {}, winHandlers = {}, docHandlers = {};
  const el = id => (els[id] ??= { id, hidden: false, textContent: '', value: '', onclick: null, addEventListener() {}, focus() {} });
  const ctx = {
    db, key: 'um-passo-v1', $: el, console: { warn() {} },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    document: { hidden: false, addEventListener: (n, fn) => ((docHandlers[n] ??= []).push(fn)) },
    addEventListener: (n, fn) => ((winHandlers[n] ??= []).push(fn)),
    fetch: fakeFetch, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    load() {}, Date, JSON, Math, Object, Array, Number, String, Error, Promise, Set, Map, Uint8Array,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const s of SOURCES) vm.runInContext(s, ctx);
  vm.runInContext(SYNC, ctx);
  return {
    ctx, el,
    state: () => JSON.parse(store.get('stepbystep-sync') || '{}'),
    fire: (name) => (winHandlers[name] || []).forEach(fn => fn()),
    hide: () => { ctx.document.hidden = true; (docHandlers.visibilitychange || []).forEach(fn => fn()); },
    sync: () => ctx.Sync.sync(),
  };
}
const day = extra => ({ blocks: [{ name: 'ABAP', min: 60, done: true }], checks: [], distractions: [], timerMinutes: 10, rounds: 1, ...extra });
const linked = { device: 'd-a', key: 'chave-certa', known: {}, lastRev: 0 };
const plainText = () => JSON.stringify([...server.rows.values()].map(r => r.data));

const pc = device(
  { days: { '2026-11-16': day({ task: 'segredo do dia' }) }, clareza: { start: null, reasons: 'motivo segredo', env: {}, streaks: [], checkins: [], sos: [], plans: [] } },
  linked,
);

test('sem cifragem ativada, sobe como antes (compatível com versões antigas)', async () => {
  await pc.sync();
  assert.ok(server.rows.has('day:2026-11-16'));
  assert.ok(plainText().includes('segredo do dia'));
  assert.equal(pc.state().sealed, undefined);
  assert.equal(pc.el('syncSeal').hidden, false, 'botão de cifrar aparece');
});

test('ativar a cifragem reenvia tudo cifrado', async () => {
  pc.el('syncSeal').onclick();
  await wait();
  assert.ok(!plainText().includes('segredo'), 'nada legível no banco');
  assert.ok([...server.rows.values()].every(r => r.deleted || r.data.$enc === 1));
  assert.equal(pc.state().sealed, true);
  assert.equal(pc.el('syncSeal').hidden, true);
});

const phone = device({ days: {} }, { device: 'd-b', key: 'chave-certa', known: {}, lastRev: 0 });

test('outro aparelho abre os dados e passa a cifrar sozinho', async () => {
  await phone.sync();
  assert.equal(phone.ctx.db.days['2026-11-16'].task, 'segredo do dia');
  assert.equal(phone.ctx.db.clareza.reasons, 'motivo segredo');
  assert.equal(phone.state().sealed, true);
  phone.ctx.db.days['2026-11-16'].rounds = 4;
  await phone.sync();
  assert.ok(!plainText().includes('segredo'));
  await pc.sync();
  assert.equal(pc.ctx.db.days['2026-11-16'].rounds, 4);
});

test('ao minimizar, envia com keepalive', async () => {
  phone.ctx.db.days['2026-11-16'].rounds = 5;
  server.requests.length = 0;
  phone.hide();
  await wait();
  const insert = server.requests.find(r => r.query.includes('INSERT'));
  assert.ok(insert, 'enviou ao esconder');
  assert.equal(insert.keepalive, true);
  assert.ok(insert.size < 64 * 1024);
  assert.equal(server.requests.filter(r => r.query.startsWith('SELECT')).length, 0, 'não perde tempo baixando');
});

test('documento estragado na nuvem é ignorado', async () => {
  await pc.sync();
  assert.equal(pc.ctx.db.days['2026-11-16'].rounds, 5);
  server.rows.set('day:2026-11-16', { key: 'day:2026-11-16', data: { blocks: 'quebrado' }, deleted: false, rev: ++server.seq });
  await pc.sync();
  assert.equal(pc.ctx.db.days['2026-11-16'].rounds, 5, 'dia local intacto');
});

test('chave errada avisa sem quebrar', async () => {
  const other = device({ days: {} }, { device: 'd-c', key: 'chave-errada', known: {}, lastRev: 0 });
  await other.sync();
  assert.equal(other.state().error, 'Chave inválida.');
  assert.deepEqual(other.ctx.db.days, {});
});
