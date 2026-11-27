import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestLoad, parseRange, loadStep } from '../progression.js';

const NOW = Date.UTC(2026, 10, 27);
const day = 864e5;
const sess = (daysAgo, sets) => ({ t: NOW - daysAgo * day, sets: sets.map(([w, r]) => ({ w, r })) });

test('rangos de repeticiones', () => {
  assert.deepEqual(parseRange('6-8'), [6, 8]);
  assert.deepEqual(parseRange('10–12'), [10, 12]);
  assert.deepEqual(parseRange('5'), [5, 5]);
  assert.deepEqual(parseRange(''), [8, 12]);
});

test('primera vez: sin peso y con indicación de calibrar', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [], now: NOW });
  assert.equal(s.weight, null);
  assert.equal(s.kind, 'calibrate');
});

test('primera vez con marca de referencia del plan', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [], startLoad: 60, now: NOW });
  assert.equal(s.weight, 60);
  assert.equal(s.kind, 'start');
});

test('tope del rango en todas las series: sube la carga', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 8], [60, 8], [60, 8]])], now: NOW });
  assert.equal(s.kind, 'up');
  assert.equal(s.weight, 62.5);
});

test('incrementos distintos según el ejercicio', () => {
  assert.equal(loadStep('Sentadilla'), 5);
  assert.equal(loadStep('Curl de bíceps'), 1);
  assert.equal(loadStep('Press de banca'), 2.5);
  const s = suggestLoad({ name: 'Sentadilla', reps: '6-8', history: [sess(7, [[100, 8], [100, 8], [100, 8]])], now: NOW });
  assert.equal(s.weight, 105);
});

test('dentro del rango: mantiene el peso y busca una repetición más', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 8], [60, 7], [60, 6]])], now: NOW });
  assert.equal(s.kind, 'hold');
  assert.equal(s.weight, 60);
});

test('a una repetición del mínimo: repite', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 6], [60, 5], [60, 5]])], now: NOW });
  assert.equal(s.kind, 'hold');
  assert.equal(s.weight, 60);
});

test('muy por debajo del mínimo: baja un 5 %', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 4], [60, 3], [60, 3]])], now: NOW });
  assert.equal(s.kind, 'down');
  assert.equal(s.weight, 57.5);
});

test('las series de aproximación no cuentan', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[30, 12], [60, 8], [60, 8]])], now: NOW });
  assert.equal(s.kind, 'up');
  assert.equal(s.weight, 62.5);
});

test('semana de descarga: 90 % del peso', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 8], [60, 8], [60, 8]])], deload: true, now: NOW });
  assert.equal(s.kind, 'deload');
  assert.equal(s.weight, 55);
});

test('tras más de 3 semanas sin entrenarlo: vuelve más ligero', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(30, [[60, 7], [60, 7], [60, 6]])], now: NOW });
  assert.equal(s.kind, 'break');
  assert.equal(s.weight, 55);
});

test('peso corporal: no propone kilos', () => {
  const up = suggestLoad({ name: 'Dominadas', reps: '6-10', history: [sess(7, [[0, 10], [0, 10], [0, 10]])], now: NOW });
  assert.equal(up.weight, null);
  assert.equal(up.kind, 'up');
  const hold = suggestLoad({ name: 'Dominadas', reps: '6-10', history: [sess(7, [[0, 8], [0, 7], [0, 6]])], now: NOW });
  assert.equal(hold.kind, 'hold');
});

test('ignora sesiones sin series válidas y usa la última con datos', () => {
  const s = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(2, [['', '']]), sess(9, [[60, 8], [60, 8], [60, 8]])], now: NOW });
  assert.equal(s.kind, 'up');
});
