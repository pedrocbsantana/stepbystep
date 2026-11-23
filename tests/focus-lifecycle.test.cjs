const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Roda só o trecho de app.js que cuida de minimizar/voltar, com um navegador de mentira.
const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
const lifecycle = source.slice(source.indexOf('function flush()'), source.indexOf('// Verifica se o navegador'));
const handlers = {};
let saved, ticks = 0;
const context = {
  running: true, end: 61000, day: {}, db: {},
  Date: { now: () => 11000 }, Math, JSON,
  pause: () => { throw Error('Minimizar não pode pausar timer ou música'); },
  tick: () => ticks++,
  saveDB: () => { saved = JSON.stringify(context.db); },
  window: { addEventListener: (name, fn) => (handlers[name] = fn) },
  document: { hidden: true, addEventListener: (name, fn) => (handlers[name] = fn) },
};
vm.runInNewContext(lifecycle, context);

test('minimizar salva sem pausar e guarda o tempo restante', () => {
  handlers.visibilitychange();
  assert.equal(context.running, true);
  assert.equal(context.day.remaining, 50);
  assert.equal(saved, '{}');
});

test('voltar reconcilia o timer ativo', () => {
  context.document.hidden = false;
  handlers.visibilitychange();
  assert.equal(ticks, 1);
  handlers.pagehide();
  handlers.pageshow();
  assert.equal(ticks, 2);
});

test('timer pausado continua pausado', () => {
  context.running = false;
  handlers.visibilitychange();
  assert.equal(ticks, 2);
});
