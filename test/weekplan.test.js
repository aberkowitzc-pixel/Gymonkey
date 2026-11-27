import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeks } from '../calendar.js';
import { buildWeekContext, hasPending, hasDeficit, moveOptions, setMove, validateActions, applyActions, describeAction, adjustmentsFor, pruneSchedule } from '../weekplan.js';

// Viernes 27 de noviembre de 2026
const NOW = new Date(2026, 10, 27, 10, 0).getTime();
const at = (iso, h = 18) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };
const exercises = [
  { id: 'pb', name: 'Press de banca', muscle: 'Pecho' }, { id: 'rb', name: 'Remo con barra', muscle: 'Espalda' }, { id: 'pm', name: 'Press militar', muscle: 'Hombros' },
  { id: 'sq', name: 'Sentadilla', muscle: 'Piernas' }, { id: 'rm', name: 'Prensa', muscle: 'Piernas' }, { id: 'dm', name: 'Dominadas', muscle: 'Espalda' },
];
const tg = (sets) => ({ sets, reps: '8-10' });
const routines = [
  { id: 'a', name: 'Torso A', fromPlan: true, weekday: 'Lunes', exerciseIds: ['pb', 'rb', 'pm'], targets: { pb: tg(3), rb: tg(3), pm: tg(3) } },
  { id: 'b', name: 'Pierna A', fromPlan: true, weekday: 'Miércoles', exerciseIds: ['sq', 'rm'], targets: { sq: tg(4), rm: tg(3) } },
  { id: 'c', name: 'Full body B', fromPlan: true, weekday: 'Viernes', exerciseIds: ['dm', 'pb'], targets: { dm: tg(3), pb: tg(3) } },
];
const wk = (id, iso, entries, extra = {}) => ({ id, start: at(iso), end: at(iso) + 36e5, entries: entries.map(([exerciseId, n, planned]) => ({ exerciseId, planned, sets: Array.from({ length: n }, () => ({ done: true })) })), ...extra });
const ctxOf = (workouts, moves = []) => buildWeekContext({ now: NOW, weeks: buildWeeks({ now: NOW, routines, workouts, moves }), workouts, exercises, planWeek: { text: 'S3/8 · Acumulación', deload: false } });

test('contexto de la semana: sesiones, estados y días libres', () => {
  // Torso A hecho entero; Pierna A (miércoles) sin hacer; hoy (viernes) Full body B por hacer
  const ctx = ctxOf([wk('w1', '2026-11-23', [['pb', 3, 3], ['rb', 3, 3], ['pm', 3, 3]])]);
  assert.equal(ctx.today, '2026-11-27');
  assert.deepEqual(ctx.week, { start: '2026-11-23', end: '2026-11-29', plan: 'S3/8 · Acumulación', deload: false });
  assert.deepEqual(ctx.days.map((d) => d.status), ['done', 'rest', 'missed', 'rest', 'planned', 'rest', 'rest']);
  assert.equal(ctx.days[2].session, 'Pierna A');
  assert.deepEqual(ctx.days[2].planned.map((p) => `${p.exercise}:${p.sets}`), ['Sentadilla:4', 'Prensa:3']);
  assert.deepEqual(ctx.free_days.map((d) => d.date), ['2026-11-28', '2026-11-29', '2026-12-01', '2026-12-03', '2026-12-05', '2026-12-06']);
  assert.equal(ctx.next_week[0].session, 'Torso A');
});

test('volumen por músculo: lo que falta es lo previsto menos lo hecho y lo que aún queda', () => {
  const ctx = ctxOf([wk('w1', '2026-11-23', [['pb', 3, 3], ['rb', 3, 3], ['pm', 3, 3]])]);
  const v = Object.fromEntries(ctx.volume.map((x) => [x.muscle, x]));
  assert.deepEqual(v.Piernas, { muscle: 'Piernas', planned_sets: 7, done_sets: 0, remaining_sets: 0, shortfall: 7 });   // la sesión de piernas se perdió
  assert.equal(v.Pecho.planned_sets, 6);       // 3 del lunes + 3 del viernes
  assert.equal(v.Pecho.done_sets, 3);
  assert.equal(v.Pecho.remaining_sets, 3);      // el viernes aún está por hacer
  assert.equal(v.Pecho.shortfall, 0);
  assert.equal(hasPending(ctx), true);
  assert.equal(hasDeficit(ctx), true);
});

test('una semana al día no necesita revisión', () => {
  const ctx = ctxOf([wk('w1', '2026-11-23', [['pb', 3, 3], ['rb', 3, 3], ['pm', 3, 3]]), wk('w2', '2026-11-25', [['sq', 4, 4], ['rm', 3, 3]])]);
  assert.equal(hasPending(ctx), false);
  assert.equal(hasDeficit(ctx), false);
});

test('una sesión parcial con ejercicios sin hacer cuenta como pendiente', () => {
  const ctx = ctxOf([wk('w1', '2026-11-23', [['pb', 3, 3], ['rb', 3, 3]], { partial: true, skipped: ['pm'] }), wk('w2', '2026-11-25', [['sq', 4, 4], ['rm', 3, 3]])]);
  assert.equal(ctx.days[0].status, 'partial');
  assert.deepEqual(ctx.days[0].skipped_exercises, ['Press militar']);
  assert.equal(hasPending(ctx), true);
  assert.equal(ctx.volume.find((v) => v.muscle === 'Hombros').shortfall, 3);
});

test('mover a mano: libre, intercambio, saltar y deshacer', () => {
  const state = { moves: [] };
  const weeks = () => buildWeeks({ now: NOW, routines, workouts: [], moves: state.moves });
  const cellAt = (iso) => weeks().flatMap((w) => w.days).find((c) => c.iso === iso);
  setMove(state, cellAt('2026-11-25'), '2026-11-28', cellAt);                // Pierna A: miércoles → sábado
  assert.deepEqual(state.moves, [{ name: 'Pierna A', from: '2026-11-25', to: '2026-11-28' }]);
  assert.equal(cellAt('2026-11-28').routine.name, 'Pierna A');
  setMove(state, cellAt('2026-11-28'), '2026-11-29', cellAt);               // otra vez: sábado → domingo (sigue siendo UN movimiento)
  assert.deepEqual(state.moves, [{ name: 'Pierna A', from: '2026-11-25', to: '2026-11-29' }]);
  setMove(state, cellAt('2026-11-29'), '2026-11-25', cellAt);               // volver a su día
  assert.deepEqual(state.moves, []);
  setMove(state, cellAt('2026-11-23'), '2026-11-25', cellAt);               // Torso A ↔ Pierna A
  assert.equal(cellAt('2026-11-23').routine.name, 'Pierna A');
  assert.equal(cellAt('2026-11-25').routine.name, 'Torso A');
  setMove(state, cellAt('2026-11-25'), null, cellAt);                        // saltar Torso A (que ahora está el miércoles)
  assert.equal(cellAt('2026-11-25').routine, null);
  assert.equal(cellAt('2026-11-23').routine.name, 'Pierna A');
  state.moves = [];
  setMove(state, cellAt('2026-11-23'), null, cellAt);                        // saltar sin más: el día queda marcado como saltado
  assert.equal(cellAt('2026-11-23').status, 'skipped');
});

test('opciones de destino: solo desde hoy, libres o intercambiables, nunca días ya hechos', () => {
  const w = [wk('w1', '2026-11-27', [['dm', 3, 3]])];
  const weeks = buildWeeks({ now: NOW, routines, workouts: w });
  const cell = weeks[0].days[2];                   // Pierna A, miércoles perdido
  const opts = moveOptions(weeks, cell, '2026-11-27');
  assert.ok(opts.every((o) => o.iso >= '2026-11-27'));
  assert.ok(!opts.some((o) => o.iso === '2026-11-27'));        // hoy ya tiene su entreno hecho
  assert.ok(opts.some((o) => o.iso === '2026-11-28' && !o.swapWith));
  assert.ok(!opts.some((o) => o.iso === '2026-12-02'));                                  // la misma sesión la semana siguiente: no tiene sentido intercambiarla
  assert.ok(opts.some((o) => o.iso === '2026-11-30' && o.swapWith?.name === 'Torso A'));  // otra sesión sin hacer sí
});

const ACTIONS = [
  { kind: 'move_session', session: 'Pierna A', from_date: '2026-11-25', to_date: '2026-11-28', exercise: '', muscle_group: '', exercise_type: 'reps', sets: 0, reps: '', rir: '', rest_seconds: 0, reason: 'Recuperar piernas' },
  { kind: 'add_sets', session: 'Full body B', from_date: '', to_date: '2026-11-27', exercise: 'Dominadas', muscle_group: 'Espalda', exercise_type: 'reps', sets: 5, reps: '', rir: '', rest_seconds: 0, reason: 'x' },
  { kind: 'add_exercise', session: 'Full body B', from_date: '', to_date: '2026-11-27', exercise: 'Remo con mancuerna', muscle_group: 'Espalda', exercise_type: 'reps', sets: 3, reps: '10-12', rir: '2', rest_seconds: 90, reason: 'y' },
];

test('se descartan las acciones que no encajan con la semana real', () => {
  const ctx = ctxOf([wk('w1', '2026-11-23', [['pb', 3, 3], ['rb', 3, 3], ['pm', 3, 3]])]);
  const bad = [
    { ...ACTIONS[0], to_date: '2026-11-26' },                    // el jueves es un día libre... pero ya pasó
    { ...ACTIONS[0], session: 'Inventada' },
    { ...ACTIONS[1], to_date: '2026-11-23' },                    // sesión ya hecha
    { ...ACTIONS[1], exercise: 'Curl' },                         // ese ejercicio no está en la sesión
    { ...ACTIONS[0], to_date: '2026-11-27' },                    // hoy no está libre
    { kind: 'borrar_todo', session: 'Torso A', from_date: '', to_date: '' },
  ];
  assert.equal(validateActions(bad, ctx).valid.length, 0);
  const { valid, dropped } = validateActions([...ACTIONS, bad[0]], ctx);
  assert.equal(valid.length, 3);
  assert.equal(dropped, 1);
  assert.equal(valid[1].sets, 2);                                // máximo 2 series extra por ejercicio
});

test('límites: dos sesiones no caen el mismo día, máximo 2 ejercicios nuevos por sesión y 6 acciones', () => {
  const ctx = ctxOf([]);
  const two = validateActions([ACTIONS[0], { ...ACTIONS[0], session: 'Torso A', from_date: '2026-11-23' }], ctx);
  assert.equal(two.valid.length, 1);
  const many = validateActions([ACTIONS[2], { ...ACTIONS[2], exercise: 'A' }, { ...ACTIONS[2], exercise: 'B' }], ctx);
  assert.equal(many.valid.length, 2);
  assert.equal(validateActions(Array(10).fill(ACTIONS[1]), ctx).valid.length, 6);
});

test('aplicar: movimientos y ajustes para la próxima vez que se empiece la sesión', () => {
  const ctx = ctxOf([wk('w1', '2026-11-23', [['pb', 3, 3], ['rb', 3, 3], ['pm', 3, 3]])]);
  const { valid } = validateActions(ACTIONS, ctx);
  const state = { moves: [], adjust: [] };
  let n = 0;
  applyActions(state, valid, ctx, { uid: () => `id${++n}` });
  assert.deepEqual(state.moves, [{ name: 'Pierna A', from: '2026-11-25', to: '2026-11-28' }]);
  assert.equal(state.adjust.length, 2);
  assert.equal(state.adjust[0].week, '2026-11-23');
  assert.deepEqual(adjustmentsFor(state, 'Full body B', NOW).map((x) => x.kind), ['add_sets', 'add_exercise']);
  assert.equal(adjustmentsFor(state, 'Torso A', NOW).length, 0);
  state.adjust[0].consumed = true;
  assert.equal(adjustmentsFor(state, 'Full body B', NOW).length, 1);
  // el movimiento se ve en el calendario
  const cell = buildWeeks({ now: NOW, routines, workouts: [], moves: state.moves })[0].days[5];
  assert.equal(cell.routine.name, 'Pierna A');
});

test('describir acciones y limpiar lo antiguo', () => {
  const ctx = ctxOf([]);
  assert.match(describeAction(ACTIONS[0], ctx).html, /Mover <b>Pierna A<\/b> del mié 25 al sáb 28/);
  assert.match(describeAction({ ...ACTIONS[1], sets: 2 }, ctx).html, /\+2 series de <b>Dominadas<\/b> en Full body B \(vie 27\)/);
  const state = { moves: [{ name: 'x', from: '2026-10-01', to: null }, { name: 'y', from: '2026-11-25', to: null }], adjust: [{ week: '2026-10-05' }, { week: '2026-11-23' }] };
  pruneSchedule(state, NOW);
  assert.equal(state.moves.length, 1);
  assert.equal(state.adjust.length, 1);
});

test('el ejercicio añadido por la revisión conserva su carga de partida', () => {
  const ctx = ctxOf([]);
  const add = { ...ACTIONS[2], start_load_kg: 18 };
  const { valid } = validateActions([add], ctx);
  const state = { moves: [], adjust: [] };
  applyActions(state, valid, ctx, { uid: () => 'x' });
  assert.equal(state.adjust[0].start_load_kg, 18);
  const none = { moves: [], adjust: [] };
  applyActions(none, validateActions([{ ...ACTIONS[2], start_load_kg: undefined }], ctx).valid, ctx, { uid: () => 'y' });
  assert.equal(none.adjust[0].start_load_kg, 0);
});
