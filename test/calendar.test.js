import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeks, mondayOf, isoLocal, guessRoutine, shortName, overlap } from '../calendar.js';

// Viernes 27 de noviembre de 2026
const NOW = new Date(2026, 10, 27, 10, 0).getTime();
const at = (iso, h = 18) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };
const routines = [
  { id: 'a', name: 'Torso A', fromPlan: true, weekday: 'Lunes', exerciseIds: ['pb', 'rb', 'pm'] },
  { id: 'b', name: 'Pierna A', fromPlan: true, weekday: 'Miércoles', exerciseIds: ['sq', 'rm'] },
  { id: 'c', name: 'Full body B', fromPlan: true, weekday: 'Viernes', exerciseIds: ['dm', 'pr', 'el'] },
  { id: 'm', name: 'Manual', exerciseIds: ['x'] },
];
const wk = (id, iso, ids, extra = {}) => ({ id, start: at(iso), end: at(iso) + 36e5, entries: ids.map((exerciseId) => ({ exerciseId })), ...extra });

test('semanas de lunes a domingo, esta y la siguiente', () => {
  const [w1, w2] = buildWeeks({ now: NOW, routines, workouts: [] });
  assert.equal(isoLocal(mondayOf(NOW)), '2026-11-23');
  assert.deepEqual(w1.days.map((d) => d.iso), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  assert.equal(w2.days[0].iso, '2026-11-30');
  assert.equal(w1.days[4].isToday, true);
  assert.deepEqual(w1.days.map((d) => d.routine?.id || null), ['a', null, 'b', null, 'c', null, null]);
});

test('estados: hecho, parcial, perdido, previsto y descanso', () => {
  const workouts = [wk('w1', '2026-11-23', ['pb', 'rb', 'pm']), wk('w2', '2026-11-25', ['sq'], { routineId: 'b', partial: true })];
  const [w1, w2] = buildWeeks({ now: NOW, routines, workouts });
  assert.deepEqual(w1.days.map((d) => d.status), ['done', 'rest', 'partial', 'rest', 'planned', 'rest', 'rest']);
  assert.deepEqual(w2.days.map((d) => d.status), ['planned', 'rest', 'planned', 'rest', 'planned', 'rest', 'rest']);
  const missed = buildWeeks({ now: NOW, routines, workouts: [] })[0];
  assert.deepEqual(missed.days.filter((d) => d.routine).map((d) => d.status), ['missed', 'missed', 'planned']);
});

test('un entreno hecho otro día de la semana cuenta para su día previsto', () => {
  const [w1] = buildWeeks({ now: NOW, routines, workouts: [wk('w1', '2026-11-26', ['sq', 'rm'])] });
  const wed = w1.days[2];
  assert.equal(wed.status, 'done');
  assert.equal(wed.movedTo, '2026-11-26');
  assert.equal(w1.days[3].status, 'rest');
});

test('un entreno fuera de plan aparece como extra', () => {
  const [w1] = buildWeeks({ now: NOW, routines, workouts: [wk('w1', '2026-11-28', ['zz'])] });
  assert.equal(w1.days[5].status, 'extra');
  assert.equal(w1.days[5].extra.id, 'w1');
});

test('el vínculo explícito manda sobre el parecido', () => {
  const [w1] = buildWeeks({ now: NOW, routines, workouts: [wk('w1', '2026-11-23', ['pb', 'rb', 'pm'], { routineId: 'b' })] });
  assert.equal(w1.days[0].status, 'missed');          // Torso A no se hizo (el entreno está ligado a Pierna A)
  assert.equal(w1.days[2].status, 'done');
});

test('vincular un entreno con la rutina del plan que más se parece', () => {
  assert.equal(guessRoutine(routines, ['pb', 'rb', 'pm', 'x'], '2026-11-23').id, 'a');
  assert.equal(guessRoutine(routines, ['sq'], '2026-11-25').id, 'b');   // 1 de 2 = 50 %
  assert.equal(guessRoutine(routines, ['zz'], '2026-11-25'), null);
  assert.equal(overlap({ entries: [{ exerciseId: 'pb' }] }, routines[0]).toFixed(2), '0.33');
});

test('nombre corto de la celda', () => {
  assert.equal(shortName('Torso A'), 'Torso A');
  assert.equal(shortName('Empuje (Push)'), 'Empuje');
  assert.equal(shortName('Full body B'), 'Full');
  assert.equal(shortName(''), '');
});
