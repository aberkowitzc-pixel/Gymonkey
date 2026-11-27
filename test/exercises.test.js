import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchExercise, findDuplicates, mergeExercises, addAlias } from '../exercises.js';

const ex = (id, name, extra = {}) => ({ id, name, muscle: 'x', type: 'reps', ...extra });
const lib = [ex('pb', 'Press de banca'), ex('sq', 'Sentadilla'), ex('sb', 'Sentadilla búlgara'), ex('rb', 'Remo con barra'), ex('rm', 'Remo con mancuerna'), ex('dm', 'Dominadas'), ex('el', 'Elevaciones laterales'), ex('pbd', 'Press de banca con mancuernas'), ex('cu', 'Curl de bíceps')];
const m = (name, list = lib) => { const r = matchExercise(name, list); return r ? `${r.exercise.id}:${r.how}` : null; };

test('mismo ejercicio con otro nombre se reconoce', () => {
  assert.equal(m('Press de banca'), 'pb:exact');
  assert.equal(m('press DE banca'), 'pb:exact');
  assert.equal(m('Press banca'), 'pb:similar');
  assert.equal(m('Banca press'), 'pb:similar');
  assert.equal(m('Press de banca con barra'), 'pb:similar');
  assert.equal(m('Dominada'), 'dm:similar');
  assert.equal(m('Elevación lateral'), 'el:similar');
  assert.equal(m('Sentadillas'), 'sq:similar');
});

test('ejercicios distintos NO se confunden', () => {
  assert.equal(m('Sentadilla búlgara', [ex('sq', 'Sentadilla')]), null);
  assert.equal(m('Peso muerto rumano', [ex('pm', 'Peso muerto')]), null);
  assert.equal(m('Plancha lateral', [ex('pl', 'Plancha')]), null);
  assert.equal(m('Press militar', [ex('pb', 'Press de banca')]), null);
  assert.equal(m('Curl martillo', [ex('cu', 'Curl de bíceps')]), null);
});

test('el material distingue cargas: barra, mancuernas, polea', () => {
  assert.equal(m('Press de banca con mancuernas', [ex('pb', 'Press de banca')]), null);
  assert.equal(m('Remo con mancuerna', [ex('rb', 'Remo con barra')]), null);
  assert.equal(m('Remo con barra', [ex('rm', 'Remo con mancuerna')]), null);
  assert.equal(m('Press de banca con mancuernas', [ex('pb', 'Press de banca'), ex('pbd', 'Press de banca con mancuernas')]), 'pbd:exact');
  assert.equal(m('Remo', [ex('rm', 'Remo con mancuerna')]), null);
});

test('los alias recuerdan nombres', () => {
  const e = ex('pb', 'Press de banca');
  addAlias(e, 'Bench plano');
  addAlias(e, 'bench plano');
  addAlias(e, 'Press de banca');
  assert.deepEqual(e.aliases, ['Bench plano']);
  assert.equal(m('Bench plano', [e]), 'pb:alias');
});

test('detecta duplicados', () => {
  const pairs = findDuplicates([ex('a', 'Press banca'), ex('b', 'Press de banca'), ex('c', 'Sentadilla'), ex('d', 'Sentadilla búlgara')]);
  assert.deepEqual(pairs.map(([x, y]) => `${x.id}-${y.id}`), ['a-b']);
});

test('unir ejercicios mueve historial, rutinas, entreno en curso y deja un alias', () => {
  const state = {
    exercises: [ex('pb', 'Press de banca'), ex('pb2', 'Press banca')],
    workouts: [
      { id: 'w1', entries: [{ exerciseId: 'pb2', sets: [{ w: '60', r: '8', done: true }] }] },
      { id: 'w2', skipped: ['pb2'], entries: [{ exerciseId: 'pb', sets: [{ w: '55', r: '8', done: true }] }, { exerciseId: 'pb2', sets: [{ w: '57.5', r: '8', done: true }] }] },
    ],
    routines: [{ id: 'r', exerciseIds: ['pb2', 'pb'], targets: { pb2: { sets: 3 } } }],
    active: { entries: [{ exerciseId: 'pb2', sets: [{ w: '', r: '', done: false }], group: 'g' }, { exerciseId: 'pb2', sets: [{ w: '60', r: '8', done: true }] }] },
  };
  const fresh = (id) => ({ exerciseId: id, sets: [{ w: '62.5', r: '6', done: false }], suggest: {} });
  assert.equal(mergeExercises(state, 'pb2', 'pb', { newEntry: fresh }), true);
  assert.deepEqual(state.exercises.map((e) => e.id), ['pb']);
  assert.deepEqual(state.exercises[0].aliases, ['Press banca']);
  assert.equal(state.workouts[0].entries[0].exerciseId, 'pb');
  assert.equal(state.workouts[1].entries.length, 1);
  assert.deepEqual(state.workouts[1].entries[0].sets.map((s) => s.w), ['55', '57.5']);
  assert.deepEqual(state.workouts[1].skipped, ['pb']);
  assert.deepEqual(state.routines[0].exerciseIds, ['pb']);
  assert.deepEqual(state.routines[0].targets, { pb: { sets: 3 } });
  assert.equal(state.active.entries[0].sets[0].w, '62.5');   // sin series hechas → se recalcula
  assert.equal(state.active.entries[0].group, 'g');
  assert.equal(state.active.entries[1].exerciseId, 'pb');     // con series hechas → solo se reasigna
  assert.equal(state.active.entries[1].sets[0].w, '60');
  assert.equal(mergeExercises(state, 'zz', 'pb'), false);
});

test('al unir, también se recalcula el ejercicio del entreno en curso que recibe el historial', () => {
  const state = {
    exercises: [ex('sq', 'Sentadilla'), ex('sqd', 'Sentadillas')],
    workouts: [{ id: 'w', entries: [{ exerciseId: 'sqd', sets: [{ w: '100', r: '6', done: true }] }] }],
    routines: [],
    active: { entries: [{ exerciseId: 'sq', sets: [{ w: '', r: '6', done: false }], suggest: { kind: 'calibrate' }, target: { sets: 3 } }] },
  };
  const seen = [];
  mergeExercises(state, 'sqd', 'sq', { newEntry: (id, tg) => { seen.push([id, state.workouts[0].entries[0].exerciseId, tg.sets]); return { exerciseId: id, sets: [{ w: '100', r: '6', done: false }], suggest: { kind: 'hold' } }; } });
  assert.deepEqual(seen, [['sq', 'sq', 3]]);       // el historial ya estaba movido cuando se recalculó
  assert.equal(state.active.entries[0].suggest.kind, 'hold');
  assert.equal(state.workouts[0].entries[0].exerciseId, 'sq');
  assert.deepEqual(state.exercises.map((e) => e.name), ['Sentadilla']);
  assert.deepEqual(state.exercises[0].aliases, ['Sentadillas']);
});
