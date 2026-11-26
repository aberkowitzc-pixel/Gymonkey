'use strict';

/* ============================================================
 * Gymonkey — registro de entrenamientos (PWA, sin dependencias)
 * Los datos se guardan en localStorage del dispositivo.
 * ============================================================ */

const STORAGE_KEY = 'gymonkey:v1';
const REST_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300];
const DEFAULT_SETTINGS = { rest: 90, lockscreen: true, notify: false, sound: true, wakeLock: true };
const NOTE_TAG = 'gymonkey-timer';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function defaultExercises() {
  return [
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
    ['Plancha', 'Core', 'time'],
  ].map(([name, muscle, type = 'reps']) => ({ id: uid(), name, muscle, type }));
}

function defaultState() {
  const exercises = defaultExercises();
  const ex = (n) => exercises.find((e) => e.name === n).id;
  return {
    settings: { ...DEFAULT_SETTINGS },
    exercises,
    routines: [
      { id: uid(), name: 'Empuje (Push)', exerciseIds: [ex('Press de banca'), ex('Press militar'), ex('Elevaciones laterales'), ex('Extensión de tríceps')] },
      { id: uid(), name: 'Tirón (Pull)', exerciseIds: [ex('Dominadas'), ex('Remo con barra'), ex('Jalón al pecho'), ex('Curl de bíceps')] },
      { id: uid(), name: 'Pierna (Legs)', exerciseIds: [ex('Sentadilla'), ex('Peso muerto'), ex('Prensa de piernas'), ex('Zancadas')] },
    ],
    workouts: [],
    active: null,
  };
}

/** Completa datos guardados por versiones anteriores de la app. */
function migrate(s) {
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.exercises.forEach((e) => { if (!e.type) e.type = e.name === 'Plancha' ? 'time' : 'reps'; });
  if (s.active && s.active.timer === undefined) s.active.timer = null;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (_) { /* almacenamiento no disponible */ }
  return defaultState();
}

let state = load();
let tab = 'train';
let progressExerciseId = null;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignorar */ }
}

/* ---------- utilidades ---------- */

const $view = document.getElementById('view');
const $dialog = document.getElementById('dialog');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const exById = (id) => state.exercises.find((e) => e.id === id);
const exName = (id) => exById(id)?.name ?? 'Ejercicio eliminado';
const isTimed = (id) => exById(id)?.type === 'time';
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmtKg = (n) => (Math.round(n * 10) / 10).toLocaleString('es');
const fmtDate = (ts) => new Date(ts).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtClock = (ts) => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
const fmtDuration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};
const fmtSecs = (s) => fmtDuration(s * 1000);
// 1RM estimado (fórmula de Epley)
const oneRM = (w, r) => (r > 0 ? w * (1 + r / 30) : 0);
const restFor = (exerciseId) => exById(exerciseId)?.rest ?? state.settings.rest;

function fmtSet(exerciseId, s) {
  if (isTimed(exerciseId)) return (num(s.w) ? `${fmtKg(num(s.w))} kg · ` : '') + fmtSecs(num(s.r));
  return `${fmtKg(num(s.w))}×${num(s.r)}`;
}

function setVolume(sets) {
  return sets.filter((s) => s.done).reduce((t, s) => t + num(s.w) * num(s.r), 0);
}
function workoutVolume(w) {
  return w.entries.filter((e) => !isTimed(e.exerciseId)).reduce((t, e) => t + setVolume(e.sets), 0);
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

function restOptions(selected) {
  return REST_OPTIONS.map((s) => `<option value="${s}" ${s === selected ? 'selected' : ''}>${fmtSecs(s)}</option>`).join('');
}

/* ============================================================
 * Temporizadores: cronómetro de serie y descanso entre series
 * state.active.timer = { kind: 'set', e, s, start }  |
 *                      { kind: 'rest', e, start, duration }
 * Se guardan con marcas de tiempo, así siguen siendo correctos
 * aunque el móvil congele la página o se recargue.
 * ============================================================ */

function timerInfo() {
  const a = state.active;
  const t = a?.timer;
  if (!t) return null;
  const entry = a.entries[t.e];
  if (!entry) return null;
  const elapsed = Date.now() - t.start;
  const name = exName(entry.exerciseId);
  if (t.kind === 'rest') {
    return { kind: 'rest', name, elapsed, duration: t.duration, remaining: t.duration - elapsed, over: elapsed >= t.duration };
  }
  const set = entry.sets[t.s];
  const target = isTimed(entry.exerciseId) ? num(set?.r) * 1000 : 0;
  return { kind: 'set', name, elapsed, setNo: t.s + 1, target };
}

function startRest(e) {
  const a = state.active;
  a.timer = { kind: 'rest', e, start: Date.now(), duration: restFor(a.entries[e].exerciseId) * 1000, alerted: false };
  startMedia();
}

/* ---------- sonido y vibración ---------- */

let actx = null;
function audioCtx() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (_) { actx = null; }
  return actx;
}

function beep() {
  const c = audioCtx();
  if (!c) return;
  [0, 0.25, 0.5].forEach((d, i) => {
    const o = c.createOscillator(), g = c.createGain();
    const t0 = c.currentTime + d;
    o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + 0.2);
  });
}

function alarm(title, body) {
  if (state.settings.sound) {
    beep();
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  }
  if (document.hidden) showNote(title, body, { renotify: true, vibrate: [300, 150, 300] });
}

/* ---------- notificaciones ---------- */

const notesAllowed = () => state.settings.notify && 'Notification' in window && Notification.permission === 'granted';

async function showNote(title, body, extra = {}) {
  if (!notesAllowed()) return;
  const opts = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: NOTE_TAG, ...extra };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch (_) { /* ignorar */ }
}

async function clearNotes() {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    (await reg?.getNotifications({ tag: NOTE_TAG }))?.forEach((n) => n.close());
  } catch (_) { /* ignorar */ }
}

/* ---------- pantalla de bloqueo (Media Session) ----------
 * Los navegadores móviles solo muestran contenido "en vivo" en la
 * pantalla de bloqueo para lo que se está reproduciendo. Por eso,
 * mientras corre un temporizador se reproduce un audio inaudible y
 * se usa la API Media Session para mostrar el tiempo y una barra de
 * progreso en los controles multimedia del teléfono.
 */

let mediaAudio = null;
let mediaKey = '';

function inaudibleWavUrl(seconds = 10, rate = 8000) {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  // Señal de ±1 (≈ -90 dB): imperceptible, pero no es silencio absoluto.
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i & 1 ? 1 : -1, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** Debe llamarse desde un toque del usuario (requisito de reproducción en móviles). */
function startMedia() {
  mediaKey = '';
  if (!state.settings.lockscreen || !('mediaSession' in navigator)) return;
  if (!mediaAudio) {
    mediaAudio = new Audio(inaudibleWavUrl());
    mediaAudio.loop = true;
    mediaAudio.setAttribute('playsinline', '');
    const ms = navigator.mediaSession;
    const on = (action, fn) => { try { ms.setActionHandler(action, fn); } catch (_) { /* no soportado */ } };
    on('play', () => { mediaAudio.play().catch(() => {}); ms.playbackState = 'playing'; });
    on('pause', () => { mediaAudio.pause(); ms.playbackState = 'paused'; });
    on('nexttrack', () => {
      const t = state.active?.timer;
      if (!t) return;
      if (t.kind === 'rest') actions['rest-skip']();
      else actions['finish-set']();
      commit();
    });
  }
  if (mediaAudio.paused) mediaAudio.play().catch(() => {});
}

function stopMedia() {
  if (mediaAudio && !mediaAudio.paused) mediaAudio.pause();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  }
  mediaKey = '';
}

function updateMedia(info) {
  if (!mediaAudio) return;
  if (!info || !state.settings.lockscreen) { if (mediaKey !== 'off') { stopMedia(); mediaKey = 'off'; } return; }
  if (mediaAudio.paused) return; // el usuario lo pausó desde la pantalla de bloqueo
  let title, artist;
  if (info.kind === 'rest') {
    title = info.over
      ? `¡A por la siguiente serie! (+${fmtDuration(info.elapsed - info.duration)})`
      : `Descanso · quedan ${fmtDuration(info.remaining)}`;
    artist = `Llevas ${fmtDuration(info.elapsed)} de descanso · ${info.name}`;
  } else {
    title = `Serie ${info.setNo} · ${fmtDuration(info.elapsed)}`;
    artist = info.name + (info.target ? ` · objetivo ${fmtDuration(info.target)}` : '');
  }
  if (title + artist === mediaKey) return;
  mediaKey = title + artist;
  const ms = navigator.mediaSession;
  try {
    ms.metadata = new MediaMetadata({
      title, artist, album: 'Gymonkey',
      artwork: [192, 512].map((s) => ({ src: new URL(`icon-${s}.png`, location.href).href, sizes: `${s}x${s}`, type: 'image/png' })),
    });
    ms.playbackState = 'playing';
    if (info.kind === 'rest' && !info.over) {
      ms.setPositionState({ duration: info.duration / 1000, position: Math.min(info.elapsed, info.duration) / 1000, playbackRate: 1 });
    } else {
      ms.setPositionState();
    }
  } catch (_) { /* soporte parcial */ }
}

/* ---------- mantener la pantalla encendida ---------- */

let wakeLock = null;
async function syncWakeLock() {
  const want = state.settings.wakeLock && !!state.active && !document.hidden && 'wakeLock' in navigator;
  try {
    if (want && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (_) { wakeLock = null; }
}

/* ---------- banner flotante del temporizador ---------- */

let bannerKind = null;

function bannerTemplate(kind) {
  if (kind === 'set') {
    return `
      <div class="banner-head"><span><span data-slot="setno"></span> · <span data-slot="name"></span></span><span data-slot="target"></span></div>
      <div class="banner-main"><div><small>Tiempo de serie</small><b class="timer" data-slot="elapsed"></b></div></div>
      <div class="banner-actions">
        <button data-action="cancel-timer">Cancelar</button>
        <button class="solid" data-action="finish-set">✓ Serie hecha</button>
      </div>`;
  }
  const over = kind === 'rest-over';
  return `
    <div class="banner-head"><span>${over ? '¡Descanso terminado!' : 'Descanso'} · <span data-slot="name"></span></span><span>de <span data-slot="total"></span></span></div>
    <div class="banner-main">
      <div><small>Llevas</small><b class="timer" data-slot="elapsed"></b></div>
      <div class="right"><small>${over ? 'De más' : 'Quedan'}</small><b class="timer" data-slot="remaining"></b></div>
    </div>
    <div class="bar"><i></i></div>
    <div class="banner-actions">
      <button data-action="rest-adjust" data-d="-15">−15 s</button>
      <button data-action="rest-adjust" data-d="15">+15 s</button>
      <button class="solid" data-action="rest-skip">${over ? 'Cerrar' : 'Saltar'}</button>
    </div>`;
}

function renderBanner(info = timerInfo()) {
  let el = document.getElementById('banner');
  document.body.classList.toggle('has-banner', !!info);
  if (!info) { el?.remove(); bannerKind = null; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'banner';
    el.setAttribute('role', 'timer');
    document.body.appendChild(el);
  }
  const kind = info.kind === 'rest' && info.over ? 'rest-over' : info.kind;
  if (kind !== bannerKind) {
    bannerKind = kind;
    el.className = `banner ${kind}`;
    el.innerHTML = bannerTemplate(kind);
  }
  // Solo se actualizan los textos para no recrear los botones cada segundo.
  const slot = (k, v) => { const n = el.querySelector(`[data-slot="${k}"]`); if (n && n.textContent !== v) n.textContent = v; };
  slot('name', info.name);
  slot('elapsed', fmtDuration(info.elapsed));
  if (info.kind === 'rest') {
    slot('total', fmtDuration(info.duration));
    slot('remaining', info.over ? '+' + fmtDuration(info.elapsed - info.duration) : fmtDuration(info.remaining + 999));
    el.querySelector('.bar i').style.width = `${info.duration ? Math.min(100, (info.elapsed / info.duration) * 100) : 100}%`;
  } else {
    slot('setno', `Serie ${info.setNo}`);
    slot('target', info.target ? `objetivo ${fmtDuration(info.target)}` : '');
  }
}

function tick() {
  const a = state.active;
  const el = document.getElementById('elapsed');
  if (el && a) el.textContent = fmtDuration(Date.now() - a.start);
  const info = timerInfo();
  if (info && !a.timer.alerted) {
    if (info.kind === 'rest' && info.over) {
      a.timer.alerted = true; save();
      alarm('¡Descanso terminado!', `A por la siguiente serie de ${info.name}`);
    } else if (info.kind === 'set' && info.target && info.elapsed >= info.target) {
      a.timer.alerted = true; save();
      alarm('¡Tiempo!', `Serie ${info.setNo} de ${info.name}: objetivo cumplido`);
    }
  }
  renderBanner(info);
  updateMedia(info);
}

/* ---------- vistas ---------- */

function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const views = { train: viewTrain, routines: viewRoutines, history: viewHistory, progress: viewProgress };
  $view.innerHTML = views[tab]();
  bannerKind = null;
  document.getElementById('banner')?.remove();
  tick();
  syncWakeLock();
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

  const t = a.timer;
  const entries = a.entries.map((e, ei) => {
    const prev = lastSetsFor(e.exerciseId);
    const timed = isTimed(e.exerciseId);
    const rows = e.sets.map((s, si) => {
      const running = t?.kind === 'set' && t.e === ei && t.s === si;
      return `
      <tr class="${s.done ? 'done' : ''} ${running ? 'running' : ''}">
        <td>${si + 1}</td>
        <td class="prev">${prev[si] ? fmtSet(e.exerciseId, prev[si]) : '—'}</td>
        <td><input inputmode="decimal" placeholder="kg" value="${esc(s.w)}" data-field="w" data-e="${ei}" data-s="${si}" aria-label="Peso serie ${si + 1}"></td>
        <td><input inputmode="numeric" placeholder="${timed ? 'seg' : 'reps'}" value="${esc(s.r)}" data-field="r" data-e="${ei}" data-s="${si}" aria-label="${timed ? 'Segundos' : 'Repeticiones'} serie ${si + 1}"></td>
        <td class="btns">
          <button class="icon play" data-action="${running ? 'finish-set' : 'start-set'}" data-e="${ei}" data-s="${si}" aria-label="${running ? 'Terminar' : 'Cronometrar'} serie ${si + 1}">${running ? '■' : '▶'}</button>
          <button class="icon check" data-action="toggle-set" data-e="${ei}" data-s="${si}" aria-label="Completar serie ${si + 1}">✓</button>
        </td>
      </tr>`;
    }).join('');
    return `
      <div class="card">
        <div class="row between">
          <h3>${esc(exName(e.exerciseId))}</h3>
          <div class="row">
            <button class="ghost small" data-action="set-rest" data-e="${ei}" aria-label="Cambiar descanso">⏱ ${fmtSecs(restFor(e.exerciseId))}</button>
            <button class="ghost danger" data-action="remove-entry" data-e="${ei}" aria-label="Quitar ejercicio">✕</button>
          </div>
        </div>
        <table class="sets">
          <thead><tr><th>#</th><th>Anterior</th><th>Kg</th><th>${timed ? 'Seg' : 'Reps'}</th><th></th></tr></thead>
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
    <p class="muted hint">▶ cronometra la serie · ✓ la marca como hecha. Al terminar una serie empieza el descanso.</p>
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
          <button class="ghost link" data-action="edit-exercise" data-id="${e.id}">
            ${esc(e.name)}
            <span class="muted">${e.type === 'time' ? '· por tiempo ' : ''}· ⏱ ${fmtSecs(restFor(e.id))}${e.rest == null ? '' : ' (propio)'}</span>
          </button>
          <button class="ghost danger" data-action="delete-exercise" data-id="${e.id}" aria-label="Borrar ${esc(e.name)}">✕</button>
        </div>`).join('')}
    </div>`).join('');

  return `
    <div class="row between"><h2>Mis rutinas</h2><button class="primary" data-action="new-routine">+ Nueva</button></div>
    ${routines || '<p class="muted">Todavía no tienes rutinas.</p>'}
    <div class="row between" style="margin-top:20px"><h2>Ejercicios</h2><button data-action="new-exercise">+ Nuevo</button></div>
    <p class="muted hint">Toca un ejercicio para cambiar su descanso o si se mide por tiempo.</p>
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
          return `<div class="row between"><span>${esc(exName(e.exerciseId))}</span><span class="muted">${done.map((s) => fmtSet(e.exerciseId, s)).join(', ') || '—'}</span></div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function progressSeries(exerciseId) {
  const timed = isTimed(exerciseId);
  const points = [];
  for (const w of state.workouts) {
    const entry = w.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const done = entry.sets.filter((s) => s.done && num(s.r) > 0);
    if (!done.length) continue;
    const value = Math.max(...done.map((s) => (timed ? num(s.r) : oneRM(num(s.w), num(s.r)))));
    const maxW = Math.max(...done.map((s) => num(s.w)));
    points.push({ t: w.start, value, maxW });
  }
  return points;
}

function lineChart(points, fmt) {
  const W = 600, H = 260, P = { l: 64, r: 16, t: 16, b: 36 };
  const ys = points.map((p) => p.value);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 5; max += 5; }
  const pad = (max - min) * 0.1; min = Math.max(0, min - pad); max += pad;
  const x = (i) => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : (i / (points.length - 1)) * (W - P.l - P.r));
  const y = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const ticks = [0, 0.5, 1].map((f) => min + f * (max - min));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const first = points[0], last = points[points.length - 1];
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución">
      ${ticks.map((v) => `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 8}" y="${y(v) + 7}" text-anchor="end">${fmt(v)}</text>`).join('')}
      <path class="lineplot" d="${path}"/>
      ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="6"><title>${fmtDate(p.t)}: ${fmt(p.value)}</title></circle>`).join('')}
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
  const timed = isTimed(progressExerciseId);
  const pts = progressSeries(progressExerciseId);
  const best = Math.max(...pts.map((p) => p.value));
  const maxW = Math.max(...pts.map((p) => p.maxW));
  const delta = pts.length > 1 ? pts[pts.length - 1].value - pts[0].value : 0;
  const fmt = timed ? (v) => fmtSecs(Math.round(v)) : (v) => String(Math.round(v));
  const fmtDelta = timed ? (v) => (v < 0 ? '−' : '+') + fmtSecs(Math.abs(Math.round(v))) : (v) => (v >= 0 ? '+' : '') + fmtKg(v);
  return `
    <h2>Progreso</h2>
    <select data-action="pick-progress" aria-label="Ejercicio">
      ${used.map((e) => `<option value="${e.id}" ${e.id === progressExerciseId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
    </select>
    <div class="stats" style="margin-top:12px">
      <div class="card stat"><b>${timed ? fmtSecs(best) : fmtKg(best)}</b><span class="muted">${timed ? 'mejor tiempo' : '1RM est. (kg)'}</span></div>
      <div class="card stat"><b>${timed ? pts.length : fmtKg(maxW)}</b><span class="muted">${timed ? 'sesiones' : 'peso máx.'}</span></div>
      <div class="card stat"><b>${fmtDelta(delta)}</b><span class="muted">cambio</span></div>
    </div>
    <div class="card">
      <h3>${timed ? 'Mejor tiempo por sesión' : '1RM estimado'}</h3>
      <p class="muted" style="margin:4px 0 8px">${timed ? 'Tu serie más larga de cada entreno.' : 'Calculado con la fórmula de Epley a partir de tu mejor serie de cada sesión.'}</p>
      ${lineChart(pts, fmt)}
    </div>`;
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

const dialogButtons = (ok) => `<div class="row" style="margin-top:14px"><button class="block" value="cancel" formnovalidate>Cancelar</button><button class="block primary" value="ok">${esc(ok)}</button></div>`;

function pickExercisesDialog({ title, selected = [], confirm, nameField, onDone }) {
  const list = [...state.exercises].sort((a, b) => a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name));
  openDialog(`
    <h2>${esc(title)}</h2>
    ${nameField !== undefined ? `<input name="name" placeholder="Nombre de la rutina" value="${esc(nameField)}" required>` : ''}
    <div class="pick-list">
      ${list.map((e) => `<label><input type="checkbox" name="ex" value="${e.id}" ${selected.includes(e.id) ? 'checked' : ''}> ${esc(e.name)} <span class="muted">· ${esc(e.muscle)}</span></label>`).join('')}
    </div>
    ${dialogButtons(confirm)}`,
  (fd) => {
    // Mantener el orden original de los ya seleccionados y añadir los nuevos al final.
    const chosen = fd.getAll('ex');
    const ordered = [...selected.filter((id) => chosen.includes(id)), ...chosen.filter((id) => !selected.includes(id))];
    onDone(ordered, (fd.get('name') || '').trim());
  });
}

function exerciseDialog(ex) {
  const muscles = [...new Set(state.exercises.map((e) => e.muscle))].sort();
  openDialog(`
    <h2>${ex ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2>
    <div class="stack">
      <label class="field">Nombre<input name="name" placeholder="p. ej. Hip thrust" value="${esc(ex?.name ?? '')}" required></label>
      <label class="field">Grupo muscular<input name="muscle" list="muscles" value="${esc(ex?.muscle ?? '')}" required></label>
      <datalist id="muscles">${muscles.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      <label class="field">Se mide por
        <select name="type">
          <option value="reps" ${ex?.type !== 'time' ? 'selected' : ''}>Repeticiones</option>
          <option value="time" ${ex?.type === 'time' ? 'selected' : ''}>Tiempo (segundos)</option>
        </select>
      </label>
      <label class="field">Descanso entre series
        <select name="rest">
          <option value="">Predeterminado (${fmtSecs(state.settings.rest)})</option>
          ${restOptions(ex?.rest)}
        </select>
      </label>
    </div>
    ${dialogButtons(ex ? 'Guardar' : 'Crear')}`,
  (fd) => {
    const data = {
      name: fd.get('name').trim(),
      muscle: fd.get('muscle').trim(),
      type: fd.get('type'),
      rest: fd.get('rest') ? +fd.get('rest') : undefined,
    };
    if (ex) Object.assign(ex, data);
    else state.exercises.push({ id: uid(), ...data });
    commit();
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
      timer: null,
    };
  },
  'add-exercise'() {
    pickExercisesDialog({
      title: 'Añadir ejercicios', confirm: 'Añadir',
      onDone: (ids) => { ids.forEach((id) => state.active.entries.push(newEntry(id))); commit(); },
    });
    return false;
  },
  'remove-entry'(_, el) {
    const a = state.active, i = +el.dataset.e;
    a.entries.splice(i, 1);
    if (a.timer) {
      if (a.timer.e === i) a.timer = null;
      else if (a.timer.e > i) a.timer.e--;
    }
  },
  'add-set'(_, el) {
    const sets = state.active.entries[+el.dataset.e].sets;
    const last = sets[sets.length - 1];
    sets.push({ w: last?.w ?? '', r: last?.r ?? '', done: false });
  },
  'remove-set'(_, el) {
    const a = state.active, e = +el.dataset.e;
    a.entries[e].sets.pop();
    if (a.timer?.kind === 'set' && a.timer.e === e && a.timer.s >= a.entries[e].sets.length) a.timer = null;
  },
  'toggle-set'(_, el) {
    const a = state.active, e = +el.dataset.e, si = +el.dataset.s;
    if (a.timer?.kind === 'set' && a.timer.e === e && a.timer.s === si) return actions['finish-set']();
    const s = a.entries[e].sets[si];
    s.done = !s.done;
    if (s.done) startRest(e);
  },
  'start-set'(_, el) {
    const e = +el.dataset.e, s = +el.dataset.s;
    state.active.timer = { kind: 'set', e, s, start: Date.now(), alerted: false };
    clearNotes();
    startMedia();
  },
  'finish-set'() {
    const a = state.active, t = a?.timer;
    if (!t || t.kind !== 'set') return false;
    const entry = a.entries[t.e];
    const set = entry.sets[t.s];
    const secs = Math.round((Date.now() - t.start) / 1000);
    set.t = secs;
    if (isTimed(entry.exerciseId)) set.r = String(secs);
    set.done = true;
    startRest(t.e);
  },
  'cancel-timer'() { state.active.timer = null; },
  'rest-adjust'(_, el) {
    const t = state.active?.timer;
    if (t?.kind !== 'rest') return false;
    t.duration = Math.max(0, t.duration + +el.dataset.d * 1000);
    if (Date.now() - t.start < t.duration) t.alerted = false;
    mediaKey = '';
  },
  'rest-skip'() {
    if (state.active) state.active.timer = null;
    clearNotes();
  },
  'set-rest'(_, el) {
    const ex = exById(state.active.entries[+el.dataset.e].exerciseId);
    if (!ex) return false;
    openDialog(`
      <h2>Descanso · ${esc(ex.name)}</h2>
      <p class="muted">Tiempo de descanso después de cada serie de este ejercicio. Se recordará para los próximos entrenos.</p>
      <select name="rest">
        <option value="">Predeterminado (${fmtSecs(state.settings.rest)})</option>
        ${restOptions(ex.rest)}
      </select>
      ${dialogButtons('Guardar')}`,
    (fd) => {
      ex.rest = fd.get('rest') ? +fd.get('rest') : undefined;
      commit();
    });
    return false;
  },
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
    clearNotes();
  },
  discard() {
    if (!confirm('¿Descartar este entreno? Se perderán las series.')) return false;
    state.active = null;
    clearNotes();
  },
  settings() {
    const s = state.settings;
    const canNotify = 'Notification' in window;
    const canLock = 'mediaSession' in navigator;
    const canWake = 'wakeLock' in navigator;
    const sw = (name, title, help, supported = true) => `
      <label class="switch">
        <input type="checkbox" name="${name}" ${s[name] && supported ? 'checked' : ''} ${supported ? '' : 'disabled'}>
        <span><b>${title}</b><small>${help}${supported ? '' : ' <em>No disponible en este navegador.</em>'}</small></span>
      </label>`;
    openDialog(`
      <h2>Ajustes</h2>
      <label class="field">Descanso por defecto entre series
        <select name="rest">${restOptions(s.rest)}</select>
      </label>
      <p class="muted" style="margin:4px 0 8px">Puedes poner un descanso distinto a cada ejercicio con el botón ⏱ durante el entreno.</p>
      ${sw('lockscreen', 'Temporizador en la pantalla de bloqueo', 'Muestra el descanso y el tiempo de serie en los controles multimedia del móvil, también con el teléfono bloqueado. Ojo: si escuchas música en el mismo móvil, puede pausarla.', canLock)}
      ${sw('notify', 'Notificaciones', 'Te avisa cuando termina el descanso si la app está en segundo plano.', canNotify)}
      ${sw('sound', 'Sonido y vibración', 'Pitido y vibración al terminar el descanso o al cumplir el tiempo de una serie.')}
      ${sw('wakeLock', 'Mantener la pantalla encendida', 'Durante el entreno la pantalla no se apaga sola.', canWake)}
      ${dialogButtons('Guardar')}`,
    (fd) => {
      s.rest = +fd.get('rest');
      s.lockscreen = fd.has('lockscreen');
      s.sound = fd.has('sound');
      s.wakeLock = fd.has('wakeLock');
      const wantNotify = fd.has('notify');
      if (!s.lockscreen) stopMedia();
      if (wantNotify && Notification.permission !== 'granted') {
        // Se pide en el mismo toque del usuario, como exigen los navegadores.
        Notification.requestPermission().then((p) => {
          s.notify = p === 'granted';
          if (!s.notify) alert('No se concedió el permiso de notificaciones. Puedes activarlo en los ajustes del navegador.');
          commit();
        });
      } else {
        s.notify = wantNotify;
      }
      commit();
    });
    return false;
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
  'new-exercise'() { exerciseDialog(null); return false; },
  'edit-exercise'(id) { exerciseDialog(exById(id)); return false; },
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
        state = migrate({ ...defaultState(), ...data });
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

// El audio del móvil solo se puede activar tras un toque del usuario.
document.addEventListener('pointerdown', () => audioCtx(), { passive: true });

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

document.addEventListener('visibilitychange', () => {
  syncWakeLock();
  if (document.hidden) {
    // Al bloquear el móvil o cambiar de app, deja una notificación con la hora a la que acaba el descanso.
    const info = timerInfo();
    if (info?.kind === 'rest' && !info.over) {
      showNote('Descanso en curso', `Siguiente serie a las ${fmtClock(state.active.timer.start + info.duration)} (${fmtDuration(info.duration)}) · ${info.name}`, { silent: true });
    } else if (info?.kind === 'set') {
      showNote(`Serie ${info.setNo} en curso`, `${info.name} · empezaste a las ${fmtClock(state.active.timer.start)}`, { silent: true });
    }
  } else {
    clearNotes();
    tick();
  }
});

render();
setInterval(tick, 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
