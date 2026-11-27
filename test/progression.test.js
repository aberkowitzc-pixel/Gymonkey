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

import { suggestedReps, inferRange } from '../progression.js';

test('repeticiones sugeridas: sube el peso → mínimo del rango; mantiene → una más que la última vez', () => {
  const up = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 8], [60, 8], [60, 8]])], now: NOW });
  assert.equal(suggestedReps(up, 0), 6);
  const hold = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 8], [60, 7], [60, 6]])], now: NOW });
  assert.deepEqual([0, 1, 2].map((i) => suggestedReps(hold, i)), [8, 8, 7]);
  const almost = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 6], [60, 5], [60, 5]])], now: NOW });
  assert.deepEqual([0, 1, 2].map((i) => suggestedReps(almost, i)), [7, 6, 6]);
});

test('repeticiones sugeridas: primera vez, bajada, descarga y vuelta tras una pausa', () => {
  assert.equal(suggestedReps(suggestLoad({ name: 'Press de banca', reps: '6-8', history: [], now: NOW }), 0), 6);
  assert.equal(suggestedReps(suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 4], [60, 3]])], now: NOW }), 0), 6);
  assert.equal(suggestedReps(suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(7, [[60, 8], [60, 8]])], deload: true, now: NOW }), 0), 6);
  assert.equal(suggestedReps(suggestLoad({ name: 'Press de banca', reps: '6-8', history: [sess(30, [[60, 7], [60, 7]])], now: NOW }), 0), 7);
  assert.equal(suggestedReps(null, 0), null);
});

test('sin objetivo del plan, el rango se deduce de la última sesión', () => {
  assert.equal(inferRange([{ r: 8 }, { r: 7 }, { r: 6 }]), '6-8');
  assert.equal(inferRange([{ r: 5 }, { r: 5 }, { r: 5 }]), '5-7');
  assert.equal(inferRange([]), '8-12');
  const s = suggestLoad({ name: 'Remo', reps: inferRange([{ r: 10 }, { r: 10 }, { r: 10 }]), history: [sess(7, [[40, 10], [40, 10], [40, 10]])], now: NOW });
  assert.equal(s.kind, 'hold');
});

test('si la última sesión quedó incompleta no sube el peso: repite y completa', () => {
  const full = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [{ ...sess(7, [[60, 8], [60, 8]]), incomplete: false }], now: NOW });
  assert.equal(full.kind, 'up');
  const partial = suggestLoad({ name: 'Press de banca', reps: '6-8', history: [{ ...sess(7, [[60, 8], [60, 8]]), incomplete: true }], now: NOW });
  assert.equal(partial.kind, 'hold');
  assert.equal(partial.weight, 60);
  assert.match(partial.note, /no terminaste todas las series/);
});
