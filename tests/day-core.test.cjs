const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../dist/day-core.js');
const D = globalThis.DayCore;

const plan = [{ name: 'ABAP', min: 60 }, { name: 'Pausa', min: 10 }];

test('dia novo segue o modelo e não compartilha objetos com ele', () => {
  const d = D.newDay(plan);
  assert.deepEqual(d.blocks, [{ name: 'ABAP', min: 60, done: false }, { name: 'Pausa', min: 10, done: false }]);
  d.blocks[0].name = 'outro';
  assert.equal(plan[0].name, 'ABAP');
  assert.equal(d.timerMinutes, 10);
  D.validateDay('2026-11-16', d);
});

test('dia vazio: só abrir o app não conta como registro', () => {
  assert.equal(D.isEmptyDay(D.newDay(plan)), true);
  assert.equal(D.isEmptyDay(undefined), true);
  assert.equal(D.isEmptyDay({ ...D.newDay(plan), rounds: 1 }), false);
  assert.equal(D.isEmptyDay({ ...D.newDay(plan), task: 'x' }), false);
  assert.equal(D.isEmptyDay({ ...D.newDay(plan), journal: 'x' }), false);
  const done = D.newDay(plan);
  done.blocks[0].done = true;
  assert.equal(D.isEmptyDay(done), false);
});

test('limpeza de dias vazios preserva o dia aberto', () => {
  const days = { '2026-11-14': D.newDay(plan), '2026-11-15': { ...D.newDay(plan), rounds: 2 }, '2026-11-16': D.newDay(plan) };
  D.pruneEmptyDays(days, '2026-11-16');
  assert.deepEqual(Object.keys(days).sort(), ['2026-11-15', '2026-11-16']);
});

test('pendências vêm do último dia anterior com checklist', () => {
  const days = {
    '2026-11-10': { checks: [{ text: 'velha', done: false }] },
    '2026-11-14': { checks: [{ text: 'feita', done: true }, { text: 'aberta', done: false }, { text: 'levada', done: false, movedTo: '2026-11-15' }] },
    '2026-11-15': { checks: [] },
    '2026-11-17': { checks: [{ text: 'futuro', done: false }] },
  };
  const src = D.carrySource(days, '2026-11-16');
  assert.equal(src.date, '2026-11-14');
  assert.deepEqual(src.open.map(c => c.text), ['aberta']);
  assert.equal(D.carrySource({ '2026-11-14': { checks: [{ text: 'x', done: true }] } }, '2026-11-16'), null);
});

test('sugestão vem do "primeiro passo de amanhã" mais recente', () => {
  const days = { '2026-11-10': { nextStep: 'antigo' }, '2026-11-14': { nextStep: '  revisar CDS  ' }, '2026-11-15': { nextStep: '  ' } };
  assert.equal(D.suggestion(days, '2026-11-16'), 'revisar CDS');
  assert.equal(D.suggestion(days, '2026-11-10'), '');
});

test('datas', () => {
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(D.validDate('2026-02-29'), false);
  assert.equal(D.validDate('2028-02-29'), true);
  assert.equal(D.dateKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('validação de dia recusa dados estragados', () => {
  const ok = { blocks: [], checks: [], distractions: [], timerMinutes: 10 };
  D.validateDay('2026-11-16', ok);
  D.validateDay('2026-11-16', { ...ok, appointments: [{ id: 'a', title: 'T', start: '09:00', end: '10:00' }] });
  assert.throws(() => D.validateDay('2026-13-01', ok));
  assert.throws(() => D.validateDay('2026-11-16', { ...ok, blocks: 'x' }));
  assert.throws(() => D.validateDay('2026-11-16', { ...ok, timerMinutes: 0 }));
  assert.throws(() => D.validateDay('2026-11-16', { ...ok, checks: [{ text: 1 }] }));
  assert.throws(() => D.validateDay('2026-11-16', { ...ok, distractions: [null] }));
  assert.throws(() => D.validateDay('2026-11-16', { ...ok, appointments: [{ id: 'a', title: 'T', start: '10:00', end: '09:00' }] }));
  assert.throws(() => D.validateDay('2026-11-16', { $enc: 1, iv: 'x', ct: 'y' }), 'documento cifrado não passa como dia');
});

test('validação do modelo de plano', () => {
  D.validatePlan(plan);
  assert.throws(() => D.validatePlan([]));
  assert.throws(() => D.validatePlan([{ name: 'x', min: 0 }]));
});

test("quadro: cartões por coluna, itens levados ficam só no destino", () => {
  const days = {
    "2026-11-20": { checks: [{ text: "velha", done: false, movedTo: "2026-11-23" }, { text: "feita antiga", done: true }] },
    "2026-11-22": { checks: [{ text: "atrasada", done: false }, { text: "andando", done: false, doing: true }] },
    "2026-11-23": { checks: [{ text: "velha", done: false, from: "2026-11-20" }, { text: "pronta", done: true }] },
  };
  const c = D.boardCards(days, "2026-11-23");
  assert.deepEqual(c.todo.map((x) => x.text), ["atrasada", "velha"]);
  assert.equal(c.todo[0].late, true);
  assert.equal(c.todo[1].late, false);
  assert.deepEqual(c.doing.map((x) => [x.text, x.date, x.index]), [["andando", "2026-11-22", 1]]);
  assert.deepEqual(c.done.map((x) => x.text), ["pronta", "feita antiga"]);
  assert.deepEqual(D.boardCards(days, "2026-12-30").done, []);
});

test("quadro: mudar status mantém done e doing coerentes", () => {
  const c = { text: "x", done: false };
  D.setCheckStatus(c, "doing");
  assert.deepEqual(c, { text: "x", done: false, doing: true });
  D.setCheckStatus(c, "done");
  assert.deepEqual(c, { text: "x", done: true });
  D.setCheckStatus(c, "todo");
  assert.deepEqual(c, { text: "x", done: false });
  assert.throws(() => D.setCheckStatus(c, "outro"));
  assert.throws(() =>
    D.validateDay("2026-11-23", { blocks: [], checks: [{ text: "x", doing: "sim" }], distractions: [], timerMinutes: 25 }),
  );
});
