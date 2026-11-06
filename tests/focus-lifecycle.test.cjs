const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('dist/app.js', 'utf8');
const lifecycle = source.slice(source.indexOf('function flush()'), source.indexOf('// Verifica se o navegador'));
const handlers = {};
let saved, ticks = 0;
const context = {
  running: true, end: 61000, day: {}, db: {}, key: 'test',
  Date: { now: () => 11000 }, Math, JSON,
  pause: () => { throw Error('Minimizar não pode pausar timer ou música'); },
  tick: () => ticks++, localStorage: { setItem: (k,v) => saved = v },
  window: { addEventListener: (name,fn) => handlers[name] = fn },
  document: { hidden: true, addEventListener: (name,fn) => handlers[name] = fn }
};
vm.runInNewContext(lifecycle, context);
handlers.visibilitychange();
assert.equal(context.running, true);
assert.equal(context.day.remaining, 50);
assert.equal(saved, '{}');
context.document.hidden = false;
handlers.visibilitychange();
assert.equal(ticks, 1);
handlers.pagehide();
handlers.pageshow();
assert.equal(ticks, 2);
context.running = false;
handlers.visibilitychange();
assert.equal(ticks, 2);
console.log('PASS: minimizar salva sem pausar; retorno reconcilia timer ativo; timer pausado permanece pausado.');
