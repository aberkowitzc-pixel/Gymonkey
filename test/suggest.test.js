import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestSession, gapMuscles, freeDays } from '../suggest.js';
import { buildWeeks } from '../calendar.js';

// Sábado 28 de noviembre de 2026
const NOW = new Date(2026, 10, 28, 10, 0).getTime();
const at = (d, h = 18) => new Date(2026, 10, d, h).getTime();
const exercises = [
  { id: 'sq', name: 'Sentadilla', muscle: 'Piernas' },
  { id: 'pb', name: 'Press de banca', muscle: 'Pecho' },
  { id: 'rb', name: 'Remo con barra', muscle: 'Espalda' },
  { id: 'pm', name: 'Press militar', muscle: 'Hombros' },
  { id: 'cu', name: 'Curl', muscle: 'Brazos' },
  { id: 'ht', name: 'Hip thrust', muscle: 'Glúteos' },
  { id: 'pl', name: 'Plancha', muscle: 'Core', type: 'time' },
  { id: 'ap', name: 'Aperturas', muscle: 'Pecho' },
];
const routines = [
  { id: 'a', name: 'Torso', fromPlan: true, weekday: 'Martes', exerciseIds: ['pb', 'rb', 'pm'], targets: { pb: { sets: 4, reps: '6-8', rir: 2 }, rb: { sets: 4, reps: '8-10', rir: 2 }, pm: { sets: 3, reps: '8-10', rir: 2 } } },
  { id: 'b', name: 'Pierna', fromPlan: true, weekday: 'Jueves', exerciseIds: ['sq', 'ht'], targets: { sq: { sets: 4, reps: '5-8', rir: 2 }, ht: { sets: 3, reps: '8-12', rir: 2 } } },
];
const done = (n) => Array.from({ length: n }, () => ({ w: '50', r: '8', done: true }));
const wk = (d, entries) => ({ id: `w${d}`, start: at(d), end: at(d) + 36e5, entries: entries.map(([exerciseId, n]) => ({ exerciseId, sets: done(n) })) });

test('lo que menos has trabajado: primero el grupo con más series pendientes del plan esta semana', () => {
  // Hizo Torso el martes; Pierna (jueves) no.
  const workouts = [wk(24, [['pb', 4], ['rb', 4], ['pm', 3]])];
  const order = gapMuscles({ routines, workouts, exercises, now: NOW });
  assert.deepEqual(order.slice(0, 2), ['Piernas', 'Glúteos']);
  const s = suggestSession({ focus: 'gap', routines, workouts, exercises, now: NOW, count: 2 });
  assert.deepEqual(s.map((x) => x.exerciseId), ['sq', 'ht']);
  assert.deepEqual(s[0].target, { sets: 4, reps: '5-8', rir: 2 }, 'usa el objetivo del plan');
});

test('torso: uno por grupo, con los del plan antes que los de la lista y objetivo por defecto si no está en el plan', () => {
  const s = suggestSession({ focus: 'torso', routines, workouts: [], exercises, now: NOW, count: 5 });
  assert.deepEqual(s.map((x) => x.exerciseId), ['pb', 'rb', 'pm', 'cu', 'ap']);
  assert.deepEqual(s[3].target, { sets: 3, reps: '8-12', rir: 2 });
});

test('evita lo hecho en las últimas 48 h si hay alternativa', () => {
  const workouts = [wk(27, [['pb', 3]])];
  const s = suggestSession({ focus: 'torso', routines, workouts, exercises, now: NOW, count: 1 });
  assert.equal(s[0].exerciseId, 'ap');
});

test('sin plan: sugiere desde la lista de ejercicios; ejercicios por tiempo en segundos', () => {
  const s = suggestSession({ focus: 'pierna', routines: [], workouts: [], exercises, now: NOW, count: 3 });
  assert.deepEqual(s.map((x) => x.exerciseId), ['sq', 'ht', 'pl']);
  assert.equal(s[2].target.reps, '30-45');
});

test('sesiones extra en el calendario y días libres para programarlas', () => {
  const extras = [{ id: 'x1', iso: '2026-11-30', name: 'Extra', exerciseIds: ['cu'], targets: {}, extra: true }];
  const weeks = buildWeeks({ now: NOW, routines, workouts: [], extras });
  const mon = weeks[1].days[0];
  assert.equal(mon.routine.id, 'x1');
  assert.equal(mon.status, 'planned');
  const free = freeDays(weeks, '2026-11-28', 7).map((d) => d.iso);
  // Sábado y domingo libres; lunes ya tiene la extra; martes y jueves son del plan.
  assert.deepEqual(free, ['2026-11-28', '2026-11-29', '2026-12-02', '2026-12-04']);
});
