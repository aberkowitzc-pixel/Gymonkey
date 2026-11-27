// La semana de entreno: qué estaba previsto, qué se hizo, qué volumen falta por músculo,
// cómo reprogramar sesiones y cómo validar y aplicar lo que proponga la IA para compensar.
// Lógica pura (sin DOM) para poder probarla.

import { isoLocal, mondayOf, originalDate } from './calendar.js';
import { norm } from './exercises.js';
import { t, tn, dayShort } from './i18n.js';

const DAY = 864e5;
const parseISO = (iso) => new Date(`${iso}T12:00:00`);

/* ---------- datos de la semana para la IA ---------- */

/**
 * Resumen de la semana actual: sesiones (previstas, hechas, sin hacer), volumen por músculo y días libres.
 * `weeks` viene de buildWeeks (esta semana y la siguiente).
 */
export function buildWeekContext({ now = Date.now(), weeks, workouts, exercises, planWeek = null }) {
  const [wk, next] = weeks;
  const ex = (id) => exercises.find((e) => e.id === id);
  const todayISO = isoLocal(now);
  const volume = {};
  const add = (muscle, key, n) => { (volume[muscle] ||= { planned: 0, done: 0, remaining: 0 })[key] += n; };

  const days = wk.days.map((c) => {
    const planned = c.routine
      ? c.routine.exerciseIds.filter(ex).map((id) => ({ exercise: ex(id).name, muscle: ex(id).muscle, sets: c.routine.targets?.[id]?.sets || 3, reps: c.routine.targets?.[id]?.reps || '' }))
      : [];
    planned.forEach((p) => { add(p.muscle, 'planned', p.sets); if (c.status === 'planned') add(p.muscle, 'remaining', p.sets); });
    return {
      date: c.iso, weekday: c.weekday, status: c.status, is_today: c.isToday, is_past: c.isPast,
      session: c.routine?.name || null, moved_from: c.movedFrom || null, moved_to: c.movedTo || null,
      planned,
      done: c.workout ? c.workout.entries.map((e) => ({ exercise: ex(e.exerciseId)?.name || '', sets_done: e.sets.filter((s) => s.done !== false).length, sets_planned: e.planned ?? e.sets.length })) : [],
      skipped_exercises: (c.workout?.skipped || []).map((id) => ex(id)?.name).filter(Boolean),
    };
  });

  // Series hechas esta semana, en cualquier entreno.
  workouts.forEach((w) => {
    const iso = isoLocal(w.start);
    if (iso < wk.days[0].iso || iso > wk.days[6].iso) return;
    w.entries.forEach((e) => add(ex(e.exerciseId)?.muscle || 'Otros', 'done', e.sets.filter((s) => s.done !== false).length));
  });

  const free = (c) => c.iso >= todayISO && !c.routine && ['rest', 'moved', 'skipped'].includes(c.status);
  return {
    today: todayISO,
    week: { start: wk.days[0].iso, end: wk.days[6].iso, plan: planWeek?.text || '', deload: !!planWeek?.deload },
    days,
    volume: Object.entries(volume)
      .map(([muscle, v]) => ({ muscle, planned_sets: v.planned, done_sets: v.done, remaining_sets: v.remaining, shortfall: Math.max(0, v.planned - v.done - v.remaining) }))
      .filter((v) => v.planned_sets || v.done_sets),
    free_days: [...wk.days, ...next.days].filter(free).map((c) => ({ date: c.iso, weekday: c.weekday })),
    next_week: next.days.map((c) => ({ date: c.iso, weekday: c.weekday, session: c.routine?.name || null })),
  };
}

/** Sesiones sin hacer o a medias esta semana. */
export const hasPending = (ctx) => ctx.days.some((d) => d.status === 'missed' || (d.status === 'partial' && d.skipped_exercises.length > 0));
/** ¿Hay algo que revisar? Sesiones pendientes o músculos con series de menos. */
export const hasDeficit = (ctx) => hasPending(ctx) || ctx.volume.some((v) => v.shortfall >= 2);

/* ---------- reprogramar a mano ---------- */

/** Días a los que se puede mover la sesión de `cell`: libres, o con otra sesión aún por hacer (se intercambian). */
export function moveOptions(weeks, cell, todayISO) {
  return weeks.flatMap((w) => w.days)
    .filter((c) => c.iso >= todayISO && c.iso !== cell.iso)
    .filter((c) => !c.workout && (!c.routine || (c.status === 'planned' && c.routine.name !== cell.routine?.name)))
    .map((c) => ({ iso: c.iso, weekday: c.weekday, date: c.date, swapWith: c.routine || null }));
}

/**
 * Mueve (to = fecha) o salta (to = null) la sesión de `cell`; si el día de destino tiene otra sesión, se intercambian.
 * Poner `to` en la fecha original deshace el cambio. `cellAt(iso)` devuelve la celda de otro día.
 */
export function setMove(state, cell, to, cellAt) {
  state.moves ||= [];
  const name = cell.routine.name;
  const orig = originalDate(cell);
  const drop = (n, f) => { state.moves = state.moves.filter((m) => !(m.name === n && m.from === f)); };
  drop(name, orig);
  if (to === orig) return;
  const other = to ? cellAt(to) : null;
  if (other?.routine) {
    const oOrig = originalDate(other);
    drop(other.routine.name, oOrig);
    if (cell.iso !== oOrig) state.moves.push({ name: other.routine.name, from: oOrig, to: cell.iso });
  }
  state.moves.push({ name, from: orig, to: to || null });
}

/* ---------- compensación propuesta por la IA ---------- */

export const MAX_ACTIONS = 6;

/**
 * Se queda con las acciones que encajan con la semana real; el resto se descarta.
 * @returns {{ valid: object[], dropped: number }}
 */
export function validateActions(actions, ctx) {
  const dayBy = Object.fromEntries(ctx.days.map((d) => [d.date, d]));
  const free = new Set(ctx.free_days.map((d) => d.date));
  const open = (d) => d && ['missed', 'planned'].includes(d.status);
  const landed = new Set();
  const addEx = {};
  const valid = [];
  for (const a of actions || []) {
    if (valid.length >= MAX_ACTIONS) break;
    const from = dayBy[a.from_date];
    const to = dayBy[a.to_date];
    if (a.kind === 'move_session') {
      if (from && from.session === a.session && open(from) && free.has(a.to_date) && a.to_date !== a.from_date && !landed.has(a.to_date)) {
        landed.add(a.to_date);
        valid.push(a);
      }
    } else if (a.kind === 'skip_session') {
      if (from && from.session === a.session && open(from)) valid.push(a);
    } else if (a.kind === 'add_sets') {
      if (to && to.session === a.session && to.status === 'planned' && to.planned.some((p) => norm(p.exercise) === norm(a.exercise))) {
        valid.push({ ...a, sets: Math.min(2, Math.max(1, Math.round(a.sets) || 1)) });
      }
    } else if (a.kind === 'add_exercise') {
      const key = `${a.to_date}|${a.session}`;
      if (to && to.session === a.session && to.status === 'planned' && a.exercise?.trim() && (addEx[key] || 0) < 2) {
        addEx[key] = (addEx[key] || 0) + 1;
        valid.push({
          ...a, sets: Math.min(4, Math.max(1, Math.round(a.sets) || 3)), reps: a.reps || '8-12', rir: a.rir || '2',
          rest_seconds: Math.max(30, Math.round(a.rest_seconds) || 90),
        });
      }
    }
  }
  return { valid, dropped: (actions || []).length - valid.length };
}

/** Texto corto de una acción, para mostrarla. */
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function describeAction(a, ctx) {
  const day = (iso) => { const d = ctx.days.find((x) => x.date === iso) || ctx.next_week.find((x) => x.date === iso); return d ? `${dayShort(d.weekday)} ${Number(iso.slice(8))}` : iso; };
  const p = { s: escHtml(a.session), e: escHtml(a.exercise), a: day(a.from_date), b: day(a.to_date) };
  switch (a.kind) {
    case 'move_session': return { icon: '📅', html: t('Mover <b>{s}</b> del {a} al {b}', p) };
    case 'skip_session': return { icon: '⏭', html: t('Saltar <b>{s}</b> ({a})', p) };
    case 'add_sets': return { icon: '＋', html: tn(a.sets, '+{n} serie de <b>{e}</b> en {s} ({b})', '+{n} series de <b>{e}</b> en {s} ({b})', p) };
    case 'add_exercise': return { icon: '＋', html: t('Añadir <b>{e}</b> {sets}×{reps} a {s} ({b})', { ...p, sets: a.sets, reps: escHtml(a.reps) }) };
    default: return { icon: '•', html: escHtml(a.kind) };
  }
}

/** Aplica acciones ya validadas: mueve o salta sesiones y deja ajustes para la próxima vez que se empiece esa sesión. */
export function applyActions(state, actions, ctx, { uid }) {
  state.moves ||= [];
  state.adjust ||= [];
  const dayBy = Object.fromEntries(ctx.days.map((d) => [d.date, d]));
  for (const a of actions) {
    if (a.kind === 'move_session' || a.kind === 'skip_session') {
      const d = dayBy[a.from_date];
      const orig = d.moved_from || d.date;
      state.moves = state.moves.filter((m) => !(m.name === a.session && m.from === orig));
      state.moves.push({ name: a.session, from: orig, to: a.kind === 'move_session' ? a.to_date : null });
    } else {
      state.adjust.push({
        id: uid(), week: isoLocal(mondayOf(parseISO(a.to_date))), routine: a.session, date: a.to_date, kind: a.kind,
        exercise: a.exercise, muscle_group: a.muscle_group || 'Otros', exercise_type: a.exercise_type === 'time' ? 'time' : 'reps',
        sets: a.sets, reps: a.reps, rir: a.rir, rest_seconds: a.rest_seconds, start_load_kg: Math.max(0, Number(a.start_load_kg) || 0), reason: a.reason || '', consumed: false,
      });
    }
  }
}

/** Ajustes pendientes para una sesión que se empieza hoy (misma semana y mismo nombre de rutina). */
export function adjustmentsFor(state, routineName, now = Date.now()) {
  const wkISO = isoLocal(mondayOf(now));
  return (state.adjust || []).filter((x) => !x.consumed && x.routine === routineName && x.week === wkISO);
}

/** Quita movimientos y ajustes de hace más de tres semanas. */
export function pruneSchedule(state, now = Date.now()) {
  const limit = isoLocal(now - 21 * DAY);
  state.moves = (state.moves || []).filter((m) => m.from >= limit);
  state.adjust = (state.adjust || []).filter((x) => x.week >= limit);
}
