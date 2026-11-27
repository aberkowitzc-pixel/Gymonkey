import { canonicalExercise } from './i18n.js';

// Reconocer que dos nombres son el mismo ejercicio ("Press banca" = "Press de banca"),
// detectar duplicados y unirlos sin perder el historial.

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Palabras que no distinguen un ejercicio de otro.
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'en', 'a', 'al', 'y', 'un', 'una', 'para']);

// Material: distingue ejercicios con cargas distintas (barra vs mancuernas).
const EQUIP = {
  barra: 'barra', mancuerna: 'mancuerna', polea: 'polea', cable: 'polea', maquina: 'maquina',
  smith: 'smith', multipower: 'smith', kettlebell: 'kettlebell', banda: 'banda', liga: 'banda',
};

const singular = (t) => {
  if (t.length > 5 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
};

const tokens = (name) => norm(name).split(' ').filter((t) => t && !STOP.has(t)).map(singular);
const core = (name) => [...new Set(tokens(name).filter((t) => !EQUIP[t]))].sort();
const equip = (name) => new Set(tokens(name).map((t) => EQUIP[t]).filter(Boolean));

/** El material es compatible si coincide, o si uno no lo dice y el otro es "barra" (lo habitual al nombrar un básico). */
function compatible(a, b) {
  if (a.size && b.size) return [...a].some((x) => b.has(x));
  if (!a.size && !b.size) return true;
  return (a.size ? a : b).has('barra');
}

/**
 * Busca en `exercises` el que corresponde a `name`.
 * @returns {{ exercise, how: 'exact'|'alias'|'similar' } | null}
 */
/** Reconoce el ejercicio por su nombre; si no se parece a ninguno, prueba con su equivalente en español (nombres en inglés o hebreo). */
export function matchExercise(name, exercises) {
  const m = matchByName(name, exercises);
  if (m) return m;
  const es = canonicalExercise(name);
  return es !== String(name || '').trim() ? matchByName(es, exercises) : null;
}

function matchByName(name, exercises) {
  const n = norm(name);
  if (!n) return null;
  for (const ex of exercises) if (norm(ex.name) === n) return { exercise: ex, how: 'exact' };
  for (const ex of exercises) if ((ex.aliases || []).some((a) => norm(a) === n)) return { exercise: ex, how: 'alias' };
  const c = core(name);
  if (!c.length) return null;
  const key = c.join(' ');
  const e = equip(name);
  for (const ex of exercises) {
    for (const k of [ex.name, ...(ex.aliases || [])]) {
      if (core(k).join(' ') === key && compatible(e, equip(k))) return { exercise: ex, how: 'similar' };
    }
  }
  return null;
}

/** Recuerda otro nombre del mismo ejercicio para reconocerlo la próxima vez. */
export function addAlias(ex, name) {
  const n = norm(name);
  if (!n || n === norm(ex.name)) return;
  ex.aliases ||= [];
  if (!ex.aliases.some((a) => norm(a) === n)) ex.aliases.push(String(name).trim());
}

/** Pares de ejercicios que parecen el mismo. */
export function findDuplicates(exercises) {
  const out = [];
  for (let i = 0; i < exercises.length; i++) {
    for (let j = i + 1; j < exercises.length; j++) {
      if (matchExercise(exercises[i].name, [exercises[j]])) out.push([exercises[i], exercises[j]]);
    }
  }
  return out;
}

/**
 * Une `fromId` dentro de `toId`: el historial, las rutinas y el entreno en curso pasan al segundo
 * y el nombre del primero queda como alias. Devuelve false si no se puede.
 * `newEntry(exerciseId, target)` (opcional) recalcula las sugerencias de un ejercicio del entreno en curso sin series hechas.
 */
export function mergeExercises(state, fromId, toId, { newEntry } = {}) {
  const from = state.exercises.find((e) => e.id === fromId);
  const to = state.exercises.find((e) => e.id === toId);
  if (!from || !to || from === to) return false;
  addAlias(to, from.name);
  (from.aliases || []).forEach((a) => addAlias(to, a));

  for (const w of state.workouts) {
    const mine = w.entries.filter((e) => e.exerciseId === fromId);
    if (!mine.length) continue;
    const dest = w.entries.find((e) => e.exerciseId === toId);
    if (dest) {
      mine.forEach((m) => { dest.sets = [...dest.sets, ...m.sets]; });
      w.entries = w.entries.filter((e) => !mine.includes(e));
    } else {
      mine.forEach((m) => { m.exerciseId = toId; });
    }
    if (w.skipped) w.skipped = [...new Set(w.skipped.map((id) => (id === fromId ? toId : id)))];
  }
  for (const r of state.routines) {
    r.exerciseIds = [...new Set(r.exerciseIds.map((id) => (id === fromId ? toId : id)))];
    if (r.targets?.[fromId]) {
      r.targets[toId] ??= r.targets[fromId];
      delete r.targets[fromId];
    }
  }
  if (state.active) {
    // Los ejercicios del entreno en curso que aún no tienen series hechas se recalculan con el historial unido.
    state.active.entries = state.active.entries.map((e) => {
      if (e.exerciseId !== fromId && e.exerciseId !== toId) return e;
      if (newEntry && !e.sets.some((s) => s.done)) {
        const fresh = newEntry(toId, e.target);
        if (e.group) fresh.group = e.group;
        return fresh;
      }
      return e.exerciseId === fromId ? { ...e, exerciseId: toId } : e;
    });
  }
  state.exercises = state.exercises.filter((e) => e.id !== fromId);
  return true;
}
