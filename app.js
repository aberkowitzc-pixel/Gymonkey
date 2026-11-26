'use strict';

/* ============================================================
 * Gymonkey — registro de entrenamientos (PWA, sin dependencias)
 * Los datos se guardan en localStorage del dispositivo.
 * ============================================================ */

const STORAGE_KEY = 'gymonkey:v1';
const REST_SECONDS = 90;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DEFAULT_EXERCISES = [
  ['Press de banca', 'Pecho'],
  ['Press inclinado con mancuernas', 'Pecho'],
  ['Aperturas', 'Pecho'],
  ['Sentadilla', 'Piernas'],
  ['Peso muerto', 'Espalda'],
  ['Prensa de piernas', 'Piernas'],
  ['Zancadas', 'Piernas'],
  ['Dominadas', 'Espalda'],
  ['Remo con barra', 'Espalda'],
  ['Jalón al pecho', 'Espalda'],
  ['Press militar', 'Hombros'],
  ['Elevaciones laterales', 'Hombros'],
  ['Curl de bíceps', 'Brazos'],
  ['Extensión de tríceps', 'Brazos'],
  ['Fondos', 'Brazos'],
  ['Plancha', 'Core'],
].map(([name, muscle]) => ({ id: uid(), name, muscle }));

function defaultState() {
  const ex = (n) => DEFAULT_EXERCISES.find((e) => e.name === n).id;
  return {
    exercises: DEFAULT_EXERCISES,
    routines: [
      { id: uid(), name: 'Empuje (Push)', exerciseIds: [ex('Press de banca'), ex('Press militar'), ex('Elevaciones laterales'), ex('Extensión de tríceps')] },
      { id: uid(), name: 'Tirón (Pull)', exerciseIds: [ex('Dominadas'), ex('Remo con barra'), ex('Jalón al pecho'), ex('Curl de bíceps')] },
      { id: uid(), name: 'Pierna (Legs)', exerciseIds: [ex('Sentadilla'), ex('Peso muerto'), ex('Prensa de piernas'), ex('Zancadas')] },
    ],
    workouts: [],
    active: null,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* almacenamiento no disponible */ }
  return defaultState();
}

let state = load();
let tab = 'train';
let progressExerciseId = null;
let restEndsAt = 0;
let tickHandle = null;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignorar */ }
}

/* ---------- utilidades ---------- */

const $view = document.getElementById('view');
const $dialog = document.getElementById('dialog');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const exById = (id) => state.exercises.find((e) => e.id === id);
const exName = (id) => exById(id)?.name ?? 'Ejercicio eliminado';
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmtKg = (n) => (Math.round(n * 10) / 10).toLocaleString('es');
const fmtDate = (ts) => new Date(ts).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDuration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};
// 1RM estimado (fórmula de Epley)
const oneRM = (w, r) => (r > 0 ? w * (1 + r / 30) : 0);

function setVolume(sets) {
  return sets.filter((s) => s.done).reduce((t, s) => t + num(s.w) * num(s.r), 0);
}
function workoutVolume(w) {
  return w.entries.reduce((t, e) => t + setVolume(e.sets), 0);
}

/** Últimas series completadas de un ejercicio (para mostrar "anterior"). */
function lastSetsFor(exerciseId) {
  for (let i = state.workouts.length - 1; i >= 0; i--) {
    const entry = state.workouts[i].entries.find((e) => e.exerciseId === exerciseId);
    if (entry) {
      const done = entry.sets.filter((s) => s.done);
      if (done.length) return done;
    }
  }
  return [];
}

function newEntry(exerciseId) {
  const prev = lastSetsFor(exerciseId);
  const sets = prev.length
    ? prev.map((s) => ({ w: s.w, r: s.r, done: false }))
    : [{ w: '', r: '', done: false }, { w: '', r: '', done: false }, { w: '', r: '', done: false }];
  return { exerciseId, sets };
}

/* ---------- vistas ---------- */

function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const views = { train: viewTrain, routines: viewRoutines, history: viewHistory, progress: viewProgress };
  $view.innerHTML = views[tab]();
  renderRestBanner();
}

function viewTrain() {
  const a = state.active;
  if (!a) {
    const routines = state.routines.map((r) => `
      <button class="card block" style="text-align:left" data-action="start" data-id="${r.id}">
        <div class="row between"><h3>${esc(r.name)}</h3><span class="pill">${r.exerciseIds.length} ejercicios</span></div>
        <div class="muted" style="margin-top:4px">${r.exerciseIds.map((id) => esc(exName(id))).join(' · ') || 'Sin ejercicios'}</div>
      </button>`).join('');
    const weekAgo = Date.now() - 7 * 864e5;
    const thisWeek = state.workouts.filter((w) => w.start >= weekAgo).length;
    return `
      <div class="stats">
        <div class="card stat"><b>${thisWeek}</b><span class="muted">esta semana</span></div>
        <div class="card stat"><b>${state.workouts.length}</b><span class="muted">entrenos</span></div>
        <div class="card stat"><b>${fmtKg(state.workouts.reduce((t, w) => t + workoutVolume(w), 0) / 1000)}</b><span class="muted">toneladas</span></div>
      </div>
      <button class="primary block" data-action="start">+ Entreno vacío</button>
      <h2 style="margin-top:20px">Empezar desde una rutina</h2>
      ${routines || '<p class="muted">Crea una rutina en la pestaña Rutinas.</p>'}`;
  }

  const entries = a.entries.map((e, ei) => {
    const prev = lastSetsFor(e.exerciseId);
    const rows = e.sets.map((s, si) => `
      <tr class="${s.done ? 'done' : ''}">
        <td>${si + 1}</td>
        <td class="prev">${prev[si] ? `${fmtKg(num(prev[si].w))}×${num(prev[si].r)}` : '—'}</td>
        <td><input inputmode="decimal" placeholder="kg" value="${esc(s.w)}" data-field="w" data-e="${ei}" data-s="${si}" aria-label="Peso serie ${si + 1}"></td>
        <td><input inputmode="numeric" placeholder="reps" value="${esc(s.r)}" data-field="r" data-e="${ei}" data-s="${si}" aria-label="Repeticiones serie ${si + 1}"></td>
        <td><button class="check" data-action="toggle-set" data-e="${ei}" data-s="${si}" aria-label="Completar serie">✓</button></td>
      </tr>`).join('');
    return `
      <div class="card">
        <div class="row between">
          <h3>${esc(exName(e.exerciseId))}</h3>
          <button class="ghost danger" data-action="remove-entry" data-e="${ei}" aria-label="Quitar ejercicio">✕</button>
        </div>
        <table class="sets">
          <thead><tr><th>Serie</th><th>Anterior</th><th>Kg</th><th>Reps</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="row" style="margin-top:8px">
          <button class="block" data-action="add-set" data-e="${ei}">+ Serie</button>
          ${e.sets.length > 1 ? `<button data-action="remove-set" data-e="${ei}" aria-label="Quitar última serie">−</button>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="card row between">
      <div>
        <h3>${esc(a.name)}</h3>
        <span class="muted">Duración: <span class="timer" id="elapsed">${fmtDuration(Date.now() - a.start)}</span></span>
      </div>
      <button class="primary" data-action="finish">Terminar</button>
    </div>
    ${entries || '<div class="empty"><div class="big">💪</div>Añade tu primer ejercicio</div>'}
    <button class="block" data-action="add-exercise">+ Añadir ejercicio</button>
    <button class="block ghost danger" style="margin-top:12px" data-action="discard">Descartar entreno</button>`;
}

function viewRoutines() {
  const routines = state.routines.map((r) => `
    <div class="card">
      <div class="row between">
        <h3>${esc(r.name)}</h3>
        <div class="row">
          <button class="ghost" data-action="edit-routine" data-id="${r.id}">Editar</button>
          <button class="ghost danger" data-action="delete-routine" data-id="${r.id}" aria-label="Borrar rutina">✕</button>
        </div>
      </div>
      <div class="muted" style="margin-top:4px">${r.exerciseIds.map((id) => esc(exName(id))).join(' · ') || 'Sin ejercicios'}</div>
    </div>`).join('');

  const groups = {};
  state.exercises.forEach((e) => (groups[e.muscle] ||= []).push(e));
  const exercises = Object.keys(groups).sort().map((m) => `
    <div class="card">
      <span class="pill">${esc(m)}</span>
      ${groups[m].sort((a, b) => a.name.localeCompare(b.name)).map((e) => `
        <div class="row between" style="margin-top:6px">
          <span>${esc(e.name)}</span>
          <button class="ghost danger" data-action="delete-exercise" data-id="${e.id}" aria-label="Borrar ${esc(e.name)}">✕</button>
        </div>`).join('')}
    </div>`).join('');

  return `
    <div class="row between"><h2>Mis rutinas</h2><button class="primary" data-action="new-routine">+ Nueva</button></div>
    ${routines || '<p class="muted">Todavía no tienes rutinas.</p>'}
    <div class="row between" style="margin-top:20px"><h2>Ejercicios</h2><button data-action="new-exercise">+ Nuevo</button></div>
    ${exercises}
    <h2 style="margin-top:20px">Datos</h2>
    <div class="card row">
      <button class="block" data-action="export">Exportar copia</button>
      <button class="block" data-action="import">Importar</button>
    </div>`;
}

function viewHistory() {
  if (!state.workouts.length) {
    return '<div class="empty"><div class="big">🗓️</div>Aún no has terminado ningún entreno.</div>';
  }
  return '<h2>Historial</h2>' + [...state.workouts].reverse().map((w) => `
    <div class="card">
      <div class="row between">
        <div><h3>${esc(w.name)}</h3><span class="muted">${fmtDate(w.start)} · ${fmtDuration(w.end - w.start)} · ${fmtKg(workoutVolume(w))} kg</span></div>
        <button class="ghost danger" data-action="delete-workout" data-id="${w.id}" aria-label="Borrar entreno">✕</button>
      </div>
      <div class="stack" style="margin-top:8px">
        ${w.entries.map((e) => {
          const done = e.sets.filter((s) => s.done);
          return `<div class="row between"><span>${esc(exName(e.exerciseId))}</span><span class="muted">${done.map((s) => `${fmtKg(num(s.w))}×${num(s.r)}`).join(', ') || '—'}</span></div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function progressSeries(exerciseId) {
  const points = [];
  for (const w of state.workouts) {
    const entry = w.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const done = entry.sets.filter((s) => s.done && num(s.r) > 0);
    if (!done.length) continue;
    const best = Math.max(...done.map((s) => oneRM(num(s.w), num(s.r))));
    const maxW = Math.max(...done.map((s) => num(s.w)));
    points.push({ t: w.start, rm: best, maxW, vol: setVolume(entry.sets) });
  }
  return points;
}

function lineChart(points) {
  const W = 600, H = 260, P = { l: 56, r: 16, t: 16, b: 36 };
  const ys = points.map((p) => p.rm);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 5; max += 5; }
  const pad = (max - min) * 0.1; min = Math.max(0, min - pad); max += pad;
  const x = (i) => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : (i / (points.length - 1)) * (W - P.l - P.r));
  const y = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const ticks = [0, 0.5, 1].map((f) => min + f * (max - min));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rm).toFixed(1)}`).join(' ');
  const first = points[0], last = points[points.length - 1];
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del 1RM estimado">
      ${ticks.map((v) => `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 6}" y="${y(v) + 7}" text-anchor="end">${Math.round(v)}</text>`).join('')}
      <path class="lineplot" d="${path}"/>
      ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.rm)}" r="6"><title>${fmtDate(p.t)}: ${fmtKg(p.rm)} kg</title></circle>`).join('')}
      <text x="${P.l}" y="${H - 8}">${fmtDate(first.t)}</text>
      ${points.length > 1 ? `<text x="${W - P.r}" y="${H - 8}" text-anchor="end">${fmtDate(last.t)}</text>` : ''}
    </svg>`;
}

function viewProgress() {
  const used = state.exercises.filter((e) => progressSeries(e.id).length);
  if (!used.length) {
    return '<div class="empty"><div class="big">📈</div>Completa algunas series y aquí verás tu progreso.</div>';
  }
  if (!used.some((e) => e.id === progressExerciseId)) progressExerciseId = used[0].id;
  const pts = progressSeries(progressExerciseId);
  const pr = Math.max(...pts.map((p) => p.rm));
  const maxW = Math.max(...pts.map((p) => p.maxW));
  const delta = pts.length > 1 ? pts[pts.length - 1].rm - pts[0].rm : 0;
  return `
    <h2>Progreso</h2>
    <select data-action="pick-progress" aria-label="Ejercicio">
      ${used.map((e) => `<option value="${e.id}" ${e.id === progressExerciseId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
    </select>
    <div class="stats" style="margin-top:12px">
      <div class="card stat"><b>${fmtKg(pr)}</b><span class="muted">1RM est. (kg)</span></div>
      <div class="card stat"><b>${fmtKg(maxW)}</b><span class="muted">peso máx.</span></div>
      <div class="card stat"><b>${delta >= 0 ? '+' : ''}${fmtKg(delta)}</b><span class="muted">cambio</span></div>
    </div>
    <div class="card">
      <h3>1RM estimado</h3>
      <p class="muted" style="margin:4px 0 8px">Calculado con la fórmula de Epley a partir de tu mejor serie de cada sesión.</p>
      ${lineChart(pts)}
    </div>`;
}

/* ---------- temporizador de descanso ---------- */

function renderRestBanner() {
  let el = document.getElementById('rest');
  const remaining = restEndsAt - Date.now();
  if (remaining <= 0 || tab !== 'train' || !state.active) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'rest';
    el.className = 'rest-banner';
    document.body.appendChild(el);
  }
  el.innerHTML = `<span>Descanso <b class="timer">${fmtDuration(remaining)}</b></span>
    <span class="row"><button data-action="rest-add">+30 s</button><button data-action="rest-skip">Saltar</button></span>`;
}

function tick() {
  const el = document.getElementById('elapsed');
  if (el && state.active) el.textContent = fmtDuration(Date.now() - state.active.start);
  if (restEndsAt && Date.now() >= restEndsAt) {
    restEndsAt = 0;
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  renderRestBanner();
}

/* ---------- diálogos ---------- */

function openDialog(html, onSubmit) {
  $dialog.innerHTML = `<form method="dialog">${html}</form>`;
  const form = $dialog.querySelector('form');
  form.addEventListener('submit', (ev) => {
    if (ev.submitter?.value === 'cancel') return;
    onSubmit(new FormData(form), form);
  });
  $dialog.showModal();
}

function pickExercisesDialog({ title, selected = [], confirm, nameField, onDone }) {
  const list = [...state.exercises].sort((a, b) => a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name));
  openDialog(`
    <h2>${esc(title)}</h2>
    ${nameField !== undefined ? `<input name="name" placeholder="Nombre de la rutina" value="${esc(nameField)}" required>` : ''}
    <div class="pick-list">
      ${list.map((e) => `<label><input type="checkbox" name="ex" value="${e.id}" ${selected.includes(e.id) ? 'checked' : ''}> ${esc(e.name)} <span class="muted">· ${esc(e.muscle)}</span></label>`).join('')}
    </div>
    <div class="row"><button class="block" value="cancel" formnovalidate>Cancelar</button><button class="block primary" value="ok">${esc(confirm)}</button></div>`,
  (fd) => {
    // Mantener el orden original de los ya seleccionados y añadir los nuevos al final.
    const chosen = fd.getAll('ex');
    const ordered = [...selected.filter((id) => chosen.includes(id)), ...chosen.filter((id) => !selected.includes(id))];
    onDone(ordered, (fd.get('name') || '').trim());
  });
}

/* ---------- acciones ---------- */

const actions = {
  start(id) {
    const r = state.routines.find((x) => x.id === id);
    state.active = {
      name: r ? r.name : 'Entreno libre',
      start: Date.now(),
      entries: r ? r.exerciseIds.filter(exById).map(newEntry) : [],
    };
  },
  'add-exercise'() {
    pickExercisesDialog({
      title: 'Añadir ejercicios', confirm: 'Añadir',
      onDone: (ids) => { ids.forEach((id) => state.active.entries.push(newEntry(id))); commit(); },
    });
    return false;
  },
  'remove-entry'(_, el) { state.active.entries.splice(+el.dataset.e, 1); },
  'add-set'(_, el) {
    const sets = state.active.entries[+el.dataset.e].sets;
    const last = sets[sets.length - 1];
    sets.push({ w: last?.w ?? '', r: last?.r ?? '', done: false });
  },
  'remove-set'(_, el) { state.active.entries[+el.dataset.e].sets.pop(); },
  'toggle-set'(_, el) {
    const s = state.active.entries[+el.dataset.e].sets[+el.dataset.s];
    s.done = !s.done;
    if (s.done) restEndsAt = Date.now() + REST_SECONDS * 1000;
  },
  'rest-add'() { restEndsAt += 30000; },
  'rest-skip'() { restEndsAt = 0; },
  finish() {
    const a = state.active;
    const entries = a.entries
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
      .filter((e) => e.sets.length);
    if (!entries.length) {
      if (!confirm('No has completado ninguna serie. ¿Descartar el entreno?')) return false;
    } else {
      state.workouts.push({ id: uid(), name: a.name, start: a.start, end: Date.now(), entries });
      tab = 'history';
    }
    state.active = null;
    restEndsAt = 0;
  },
  discard() {
    if (!confirm('¿Descartar este entreno? Se perderán las series.')) return false;
    state.active = null;
    restEndsAt = 0;
  },
  'new-routine'() {
    pickExercisesDialog({
      title: 'Nueva rutina', confirm: 'Guardar', nameField: '',
      onDone: (ids, name) => { state.routines.push({ id: uid(), name: name || 'Rutina', exerciseIds: ids }); commit(); },
    });
    return false;
  },
  'edit-routine'(id) {
    const r = state.routines.find((x) => x.id === id);
    pickExercisesDialog({
      title: 'Editar rutina', confirm: 'Guardar', nameField: r.name, selected: r.exerciseIds,
      onDone: (ids, name) => { r.name = name || r.name; r.exerciseIds = ids; commit(); },
    });
    return false;
  },
  'delete-routine'(id) {
    if (!confirm('¿Borrar esta rutina?')) return false;
    state.routines = state.routines.filter((r) => r.id !== id);
  },
  'new-exercise'() {
    const muscles = [...new Set(state.exercises.map((e) => e.muscle))].sort();
    openDialog(`
      <h2>Nuevo ejercicio</h2>
      <div class="stack">
        <input name="name" placeholder="Nombre (p. ej. Hip thrust)" required>
        <input name="muscle" placeholder="Grupo muscular" list="muscles" required>
        <datalist id="muscles">${muscles.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      </div>
      <div class="row" style="margin-top:12px"><button class="block" value="cancel" formnovalidate>Cancelar</button><button class="block primary" value="ok">Crear</button></div>`,
    (fd) => {
      state.exercises.push({ id: uid(), name: fd.get('name').trim(), muscle: fd.get('muscle').trim() });
      commit();
    });
    return false;
  },
  'delete-exercise'(id) {
    const usedInHistory = state.workouts.some((w) => w.entries.some((e) => e.exerciseId === id));
    const msg = usedInHistory
      ? 'Este ejercicio aparece en tu historial. ¿Borrarlo de todos modos? El historial lo mostrará como "Ejercicio eliminado".'
      : '¿Borrar este ejercicio?';
    if (!confirm(msg)) return false;
    state.exercises = state.exercises.filter((e) => e.id !== id);
    state.routines.forEach((r) => { r.exerciseIds = r.exerciseIds.filter((x) => x !== id); });
  },
  'delete-workout'(id) {
    if (!confirm('¿Borrar este entreno del historial?')) return false;
    state.workouts = state.workouts.filter((w) => w.id !== id);
  },
  export() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gymonkey-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return false;
  },
  import() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      try {
        const data = JSON.parse(await input.files[0].text());
        if (!Array.isArray(data.exercises) || !Array.isArray(data.workouts) || !Array.isArray(data.routines)) throw new Error();
        if (!confirm('Esto reemplazará todos tus datos actuales. ¿Continuar?')) return;
        state = { ...defaultState(), ...data };
        commit();
      } catch (_) {
        alert('El archivo no es una copia válida de Gymonkey.');
      }
    };
    input.click();
    return false;
  },
};

function commit() { save(); render(); }

/* ---------- eventos ---------- */

document.addEventListener('click', (ev) => {
  const tabBtn = ev.target.closest('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT') return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (fn(el.dataset.id, el) !== false) commit();
});

// Escribir en los campos de peso/reps sin volver a pintar toda la vista (mantiene el foco).
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (!el.dataset.field || !state.active) return;
  state.active.entries[+el.dataset.e].sets[+el.dataset.s][el.dataset.field] = el.value;
  save();
});

document.addEventListener('change', (ev) => {
  if (ev.target.dataset.action === 'pick-progress') {
    progressExerciseId = ev.target.value;
    render();
  }
});

render();
tickHandle = setInterval(tick, 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
