const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../dist/day-core.js');
require('../dist/applications-core.js');
require('../dist/study-core.js');
const A = ApplicationCore, C = StudyCore;

const item = {
  id: 'qa-app', company: 'Teste', role: 'ABAP Júnior', status: 'Enviada', url: 'https://example.com/vaga',
  appliedOn: '2026-11-04', followUp: '', notes: '', location: 'Remoto', nextAction: '',
  createdAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z',
  history: [{ status: 'Enviada', at: '2026-11-04T00:00:00Z' }],
};

test('validação de candidatura', () => {
  A.validate([item]);
  assert.throws(() => A.validate([{ ...item, status: 'inventado' }]));
});

test('busca ignora acentos', () => {
  assert.equal(A.normalize('Júnior'), 'junior');
});

test('status ativos', () => {
  assert.equal(A.active('Encerrada'), false);
  assert.equal(A.active('Entrevista'), true);
});

test('links só http/https', () => {
  assert.throws(() => A.safeURL('javascript:alert(1)'));
});

test('importar backup não duplica nem sobrescreve candidatura existente', () => {
  assert.equal(A.merge([item], [item]).length, 1);
  const current = { days: {}, study: C.empty(), applications: [item] };
  const incoming = { days: {}, study: C.empty(), applications: [{ ...item, role: 'Não sobrescrever' }] };
  const merged = C.mergeBackup(current, incoming);
  assert.equal(merged.applications.length, 1);
  assert.equal(merged.applications[0].role, 'ABAP Júnior');
  C.validateBackup({ format: 'stepbystep-backup', version: 1, data: current });
});
