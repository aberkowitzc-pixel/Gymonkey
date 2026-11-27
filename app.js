/* ============================================================
 * Gymonkey — registro de entrenamientos (PWA, sin dependencias)
 * Los datos se guardan en el dispositivo (localStorage) y, si
 * inicias sesión con Google, también en tu cuenta (Firestore).
 * ============================================================ */

import * as cloud from './cloud.js';
import { initPlan, viewPlan, planActions, onPlanSubmit, onPlanInput, onContextFile, onContextInput, planTick, planTrainBanner, planBusy, planResume, planWeekLabel, weekInfo, todayName, WEEKDAYS } from './plan.js';
import { suggestLoad, suggestedReps, inferRange, parseRange, knownLoads } from './progression.js';
import { initLoads, viewLoads, loadsActive, loadsBusy, loadsTick, loadsLeave, loadsActions, onLoadsInput } from './loads.js';
import { buildWeeks, shortName, isoLocal } from './calendar.js';
import { buildWeekContext, hasDeficit, moveOptions, setMove, adjustmentsFor, pruneSchedule } from './weekplan.js';
import { initWeek, viewWeek, weekActive, weekBusy, weekTick, weekLeave, weekActions, onWeekChange } from './week.js';
import { matchExercise, mergeExercises, findDuplicates } from './exercises.js';
import { initSessions, viewSessions, sessionsActive, sessionsBusy, sessionsTick, sessionsLeave, sessionsActions, onSessionsInput, onSessionsChange, onSessionsFile } from './sessions.js';

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
    profile: null,
    plan: null,
    moves: [],
    adjust: [],
    meta: { deletedWorkouts: [] },
  };
}

/** Completa datos guardados por versiones anteriores de la app. */
function migrate(s) {
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.exercises.forEach((e) => { if (!e.type) e.type = e.name === 'Plancha' ? 'time' : 'reps'; });
  if (s.active && s.active.timer === undefined) s.active.timer = null;
  s.profile ??= null;
  s.plan ??= null;
  s.moves ??= [];
  s.adjust ??= [];
  s.meta = { deletedWorkouts: [], ...(s.meta || {}) };
  pruneSchedule(s);
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
let reorder = false;
let progressExerciseId = null;

function storeLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignorar */ }
}

function save() {
  state.meta.updatedAt = Date.now();
  storeLocal();
  scheduleSync();
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
/** Descanso de un ejercicio dentro del entreno: el elegido hoy, el del plan, el del ejercicio o el general. */
const restForEntry = (entry) => entry.rest ?? entry.target?.rest ?? restFor(entry.exerciseId);

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

/** Sesiones anteriores de un ejercicio (la más reciente primero), para calcular la carga de hoy. */
function historyFor(exerciseId, max = 4) {
  const out = [];
  for (let i = state.workouts.length - 1; i >= 0 && out.length < max; i--) {
    const entry = state.workouts[i].entries.find((e) => e.exerciseId === exerciseId);
    const sets = entry?.sets.filter((s) => s.done) || [];
    // Si quedaron menos series de las previstas, la sesión de ese ejercicio fue incompleta: no se sube el peso.
    if (sets.length) out.push({ t: state.workouts[i].start, sets, incomplete: entry.planned != null && sets.length < entry.planned });
  }
  return out;
}

function newEntry(exerciseId, target, { deload = false } = {}) {
  const prev = lastSetsFor(exerciseId);
  const timed = isTimed(exerciseId);
  let tg = target ? { ...target } : null;
  if (tg && deload) { tg.sets = Math.max(1, Math.ceil(tg.sets / 2)); tg.deload = true; }
  const count = tg?.sets || prev.length || 3;

  // Carga y repeticiones de hoy por doble progresión (no aplica a ejercicios por tiempo).
  // Sin objetivo del plan, el rango se deduce de lo que hiciste la última vez.
  const history = historyFor(exerciseId);
  const exo = exById(exerciseId);
  // La carga prescrita por el plan (o la estimada y guardada en el ejercicio) es el punto de partida sin historial.
  const startLoad = tg?.startLoad > 0 ? tg.startLoad : (exo?.startLoad || 0);
  const startBasis = (tg?.startLoad > 0 ? tg.startBasis : exo?.startBasis) || tg?.startBasis || exo?.startBasis || '';
  const suggestion = timed ? null : suggestLoad({
    name: exName(exerciseId), reps: tg?.reps || inferRange(history[0]?.sets), history, startLoad, startBasis, deload,
  });
  const [tLo, tHi] = parseRange(tg?.reps);
  const sets = Array.from({ length: count }, (_, i) => {
    const p = prev[i] || prev[prev.length - 1];
    if (suggestion) {
      const rep = suggestedReps(suggestion, i);
      // Todo viene sugerido: solo hay que confirmar (o corregir lo que no se parezca a lo que hiciste).
      return { w: suggestion.weight != null ? String(suggestion.weight) : '', r: rep != null ? String(rep) : '', done: false, sug: true };
    }
    if (timed && tg) {
      const secs = prev[i] ? Math.min(tHi, num(prev[i].r) + 5) : tLo;
      return { w: p?.w ?? '', r: String(secs), done: false, sug: true };
    }
    return { w: p?.w ?? '', r: p?.r ?? '', done: false, sug: !!p };
  });
  const entry = { exerciseId, sets };
  if (tg) entry.target = tg;
  if (suggestion) entry.suggest = suggestion;
  return entry;
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

/* ---------- bloques: ejercicios que se alternan serie a serie (A1, B1, A2, B2…) ---------- */

const BLOCK_COLORS = ['#16a34a', '#2563eb', '#d97706', '#9333ea'];
const blockOrder = (entries) => [...new Set(entries.map((x) => x.group).filter(Boolean))];
const blockLetter = (entries, g) => String.fromCharCode(65 + blockOrder(entries).indexOf(g));
const blockColor = (entries, g) => BLOCK_COLORS[Math.max(0, blockOrder(entries).indexOf(g)) % BLOCK_COLORS.length];

/** Un bloque necesita al menos dos ejercicios. */
function cleanGroups(a) {
  const n = {};
  a.entries.forEach((x) => { if (x.group) n[x.group] = (n[x.group] || 0) + 1; });
  a.entries.forEach((x) => { if (x.group && n[x.group] < 2) delete x.group; });
}

/** Próxima serie por hacer del bloque: por rondas, en el orden de la lista (A1, B1, A2, B2…). */
function nextInGroup(a, g) {
  const members = a.entries.filter((x) => x.group === g);
  const rounds = Math.max(0, ...members.map((m) => m.sets.length));
  for (let r = 0; r < rounds; r++) {
    for (const m of members) if (m.sets[r] && !m.sets[r].done) return { entry: m, si: r };
  }
  return null;
}

/** ¿Falta alguna serie de esta ronda en otro ejercicio del bloque? Si falta, aún no toca descansar. */
const roundPending = (a, entry, si) => a.entries.some((m) => m !== entry && m.group === entry.group && m.sets[si] && !m.sets[si].done);

function startRest(e) {
  const a = state.active;
  const entry = a.entries[e];
  // En un bloque se descansa al terminar la ronda, el tiempo más largo de sus ejercicios.
  const members = entry.group ? a.entries.filter((x) => x.group === entry.group) : [entry];
  const secs = Math.max(...members.map(restForEntry));
  a.timer = { kind: 'rest', e, start: Date.now(), duration: secs * 1000, alerted: false };
  startMedia();
}

function afterSetDone(e, si) {
  const a = state.active;
  const entry = a.entries[e];
  if (entry.group && roundPending(a, entry, si)) { if (a.timer?.kind === 'set') a.timer = null; return; }
  startRest(e);
}

function moveEntry(from, to) {
  const a = state.active;
  if (!a || from === to || from < 0 || to < 0 || from >= a.entries.length || to >= a.entries.length) return;
  const timed = a.timer ? a.entries[a.timer.e] : null;
  const [x] = a.entries.splice(from, 1);
  a.entries.splice(to, 0, x);
  if (timed) a.timer.e = a.entries.indexOf(timed);
  commit();
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
  const want = state.settings.wakeLock && (!!state.active || planBusy() || sessionsBusy() || weekBusy() || loadsBusy()) && !document.hidden && 'wakeLock' in navigator;
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
  planTick();
  sessionsTick();
  weekTick();
  loadsTick();
}

/* ---------- vistas ---------- */

function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const views = { train: viewTrain, plan: viewPlan, routines: viewRoutines, history: viewHistory, progress: viewProgress };
  renderAccount();
  try {
    $view.innerHTML = loadsActive() ? viewLoads() : weekActive() ? viewWeek() : sessionsActive() ? viewSessions() : views[tab]();
  } catch (e) {
    console.error('Error al pintar la pantalla', e);
    $view.innerHTML = '<div class="card error"><p>No se pudo mostrar esta pantalla.</p><button class="primary" data-action="reload">Recargar la app</button></div>';
  }
  bannerKind = null;
  document.getElementById('banner')?.remove();
  tick();
  syncWakeLock();
}

const KIND = { up: '↑ sube', hold: '= mantén', down: '↓ baja', deload: '↓ descarga', break: '↺ vuelta', start: '≈ estimada', calibrate: '', bodyweight: '' };

/** Objetivo del plan en una línea; las notas de técnica solo aparecen al tocar. */
function targetHTML(tg, timed) {
  if (!tg) return '';
  const line = `🎯 ${tg.sets}×${esc(tg.reps)}${timed ? ' s' : ''} · RIR ${esc(tg.rir)}${tg.deload ? ' · descarga' : ''}`;
  return tg.notes
    ? `<details class="target tip"><summary>${line}</summary><small>${esc(tg.notes)}</small></details>`
    : `<div class="target">${line}</div>`;
}

/** Carga sugerida en una línea; el motivo y lo de la última vez, solo al tocar. */
function suggestHTML(sg, exerciseId) {
  if (!sg) return '';
  // Sin historial: ¿existe el mismo ejercicio con otro nombre? Se ofrece unirlos.
  let hint = '';
  if (sg.kind === 'calibrate' || sg.kind === 'start') {
    const me = exById(exerciseId);
    const cand = me && matchExercise(me.name, state.exercises.filter((x) => x.id !== exerciseId && historyFor(x.id, 1).length))?.exercise;
    if (cand) hint = `<div class="link-hint">¿Es <b>${esc(cand.name)}</b>? <button class="small" data-action="merge-into" data-from="${cand.id}" data-to="${exerciseId}">Sí, unir</button></div>`;
  }
  const main = sg.weight != null ? `${fmtKg(sg.weight)} kg × ${suggestedReps(sg, 0)}`
    : sg.kind === 'calibrate' ? 'Calibra el peso' : sg.kind === 'bodyweight' ? `Peso corporal × ${suggestedReps(sg, 0)}` : `Apunta a ${suggestedReps(sg, 0)} reps`;
  const tag = sg.kind === 'start' && sg.basis === 'marca' ? 'tus marcas' : KIND[sg.kind];
  return `<details class="suggest ${sg.kind}"><summary><b>💡 ${main}</b>${tag ? `<span class="kind">${tag}</span>` : ''}</summary>${sg.lastText ? `<small>Última vez: ${esc(sg.lastText)}</small>` : ''}<small>${esc(sg.note)}</small></details>${hint}`;
}

/** Hoy + esta semana y la próxima: qué toca, qué hiciste y qué falta. */
const calWeeks = () => buildWeeks({ now: Date.now(), routines: state.routines, workouts: state.workouts, moves: state.moves });
const calCell = (iso) => calWeeks().flatMap((w) => w.days).find((d) => d.iso === iso);
const dayLabel = (d) => `${d.weekday.slice(0, 3).toLowerCase()} ${d.date.getDate()}`;

/** Datos de la semana para que la IA decida si hay que compensar. */
function weekCtx() {
  const weeks = calWeeks();
  return buildWeekContext({ now: Date.now(), weeks, workouts: state.workouts, exercises: state.exercises, planWeek: planWeekLabel(Date.now()) });
}

/** Lo que quedó pendiente esta semana: sesiones sin hacer, ejercicios sin hacer y, si procede, la revisión con IA. */
function pendingCard(weeks) {
  const days = weeks[0].days;
  const missed = days.filter((d) => d.status === 'missed');
  const partial = days.filter((d) => d.status === 'partial' && d.workout?.skipped?.length);
  const review = state.plan && hasDeficit(weekCtx());
  if (!missed.length && !partial.length && !review) return '';
  return `<div class="card pending stack">
    <b>Pendiente esta semana</b>
    ${missed.map((d) => `<div class="row between pend"><span>${esc(d.routine.name)} <span class="muted">· ${dayLabel(d)}</span></span><span class="row"><button class="small" data-action="cal-move" data-iso="${d.iso}">Reprogramar</button><button class="small ghost" data-action="cal-skip" data-iso="${d.iso}">Saltar</button></span></div>`).join('')}
    ${partial.map((d) => `<div class="row between pend"><span>${esc(d.routine.name)} <span class="muted">· faltó ${d.workout.skipped.length}</span></span><button class="small" data-action="start-rest" data-id="${d.workout.id}">Hacer lo que falta</button></div>`).join('')}
    ${review ? '<button class="small block" data-action="week-review">💬 Revisar la semana con IA</button>' : ''}
  </div>`;
}

/** Aplica a una sesión recién empezada los ajustes de compensación de esta semana. */
function applyAdjustments(r) {
  const a = state.active;
  const adjIds = [];
  for (const x of adjustmentsFor(state, r.name)) {
    if (x.kind === 'add_sets') {
      const entry = a.entries.find((e) => matchExercise(x.exercise, [exById(e.exerciseId)].filter(Boolean)));
      if (!entry) continue;
      const last = entry.sets.at(-1);
      for (let i = 0; i < x.sets; i++) entry.sets.push({ w: last?.w ?? '', r: last?.r ?? '', done: false, sug: true });
      if (entry.target) entry.target.sets += x.sets;
      entry.adj = `+${(entry.adjSets = (entry.adjSets || 0) + x.sets)} serie${entry.adjSets > 1 ? 's' : ''}`;
    } else {
      let ex = matchExercise(x.exercise, state.exercises)?.exercise;
      if (!ex) { ex = { id: uid(), name: x.exercise.trim(), muscle: x.muscle_group || 'Otros', type: x.exercise_type === 'time' ? 'time' : 'reps' }; state.exercises.push(ex); }
      const entry = newEntry(ex.id, { sets: x.sets, reps: x.reps, rir: x.rir, rest: x.rest_seconds, notes: x.reason, startLoad: x.start_load_kg || 0, startBasis: 'estimado' });
      entry.adj = 'Añadido';
      a.entries.push(entry);
    }
    adjIds.push(x.id);
  }
  if (adjIds.length) a.adjIds = adjIds;
}

function moveDialog(cell) {
  const weeks = calWeeks();
  const today = isoLocal(Date.now());
  const opts = moveOptions(weeks, cell, today);
  const endWeek = weeks[0].days[6].iso;
  const row = (o) => `<label><input type="radio" name="to" value="${o.iso}" required><span>${o.weekday} ${o.date.getDate()}${o.iso === today ? ' · hoy' : ''} <span class="muted">· ${o.swapWith ? `intercambiar con ${esc(o.swapWith.name)}` : 'libre'}</span></span></label>`;
  const a = opts.filter((o) => o.iso <= endWeek), b = opts.filter((o) => o.iso > endWeek);
  openDialog(`
    <h2>Mover ${esc(cell.routine.name)}</h2>
    <div class="pick-list">
      ${a.length ? `<small class="muted">Esta semana</small>${a.map(row).join('')}` : ''}
      ${b.length ? `<small class="muted">Próxima semana</small>${b.map(row).join('')}` : ''}
    </div>
    ${dialogButtons('Mover')}`,
  (fd) => {
    const to = fd.get('to');
    if (!to) return false;
    setMove(state, cell, to, calCell);
    commit();
    const dest = calCell(to);
    toast(`Movida al ${dest ? dayLabel(dest) : to}`);
  });
}

function skipSession(cell) {
  ask(`¿Saltar «${cell.routine.name}» (${dayLabel(cell)})? Seguirás con el plan sin recuperarla.`, 'Saltar', () => { setMove(state, cell, null, calCell); commit(); });
}

function viewCalendar() {
  const weeks = calWeeks();
  if (!weeks.some((w) => w.days.some((d) => d.routine))) return '';
  const today = weeks[0].days.find((d) => d.isToday);
  const n = (r) => r.exerciseIds.filter(exById).length;
  let hoy;
  if (today.routine && (today.status === 'planned')) {
    hoy = `<div class="card accent today-card"><div class="row between"><div><small class="muted">Hoy · ${today.weekday}</small><h3>${esc(today.routine.name)}</h3><span class="muted">${n(today.routine)} ejercicios</span></div><button class="primary" data-action="start" data-id="${today.routine.id}">Empezar</button></div></div>`;
  } else if (today.status === 'done' || today.status === 'partial') {
    hoy = `<div class="card today-card"><div class="row between"><div><small class="muted">Hoy</small><h3>${today.status === 'partial' ? '◐' : '✓'} ${esc(today.routine.name)}</h3></div><button class="small" data-action="cal-day" data-iso="${today.iso}">Ver</button></div></div>`;
  } else if (today.status === 'extra') {
    hoy = `<div class="card today-card"><small class="muted">Hoy</small><h3>✓ ${esc(today.extra.name)}</h3></div>`;
  } else {
    hoy = `<div class="card today-card"><b>Hoy no toca entrenar</b></div>`;
  }
  const sym = { done: '✓', partial: '◐', missed: '–', planned: '', extra: '•', rest: '', moved: '↪', skipped: '⏭' };
  const cell = (d) => {
    const label = d.routine ? shortName(d.routine.name) : d.status === 'extra' ? shortName(d.extra.name) : d.status === 'moved' ? `→ ${Number(d.movedTo.slice(8))}` : d.status === 'skipped' ? 'saltada' : '';
    const click = d.routine || d.extra || d.status === 'moved' || d.status === 'skipped';
    return `<button class="cal-day ${d.status} ${d.isToday ? 'today' : ''}" ${click ? `data-action="cal-day" data-iso="${d.iso}"` : 'disabled'} aria-label="${d.weekday} ${d.date.getDate()}${label ? `, ${esc(label)}` : ''}">
      <small>${'LMXJVSD'[d.idx]}</small><b>${d.date.getDate()}</b><i>${d.movedFrom && d.status === 'planned' ? '↪' : sym[d.status]}</i><em>${esc(label)}</em></button>`;
  };
  const grid = weeks.map((w, i) => {
    const lab = planWeekLabel(w.days[0].date.getTime());
    return `<div class="cal-head"><b>${i === 0 ? 'Esta semana' : 'Próxima'}</b><span class="muted">${lab ? esc(lab.text) : ''}</span>${lab?.deload ? '<span class="pill">Descarga</span>' : ''}</div>
      <div class="cal-grid">${w.days.map(cell).join('')}</div>`;
  }).join('');
  return `${hoy}${pendingCard(weeks)}<div class="cal">${grid}</div>`;
}

function viewTrain() {
  const a = state.active;
  if (!a) {
    const cal = viewCalendar();
    const today = todayName();
    const order = (r) => (r.fromPlan ? WEEKDAYS.indexOf(r.weekday) : 99);
    const routines = [...state.routines].sort((x, y) => order(x) - order(y)).map((r) => `
      <button class="card block ${r.fromPlan && r.weekday === today ? 'today' : ''}" style="text-align:left" data-action="start" data-id="${r.id}">
        <div class="row between"><h3>${esc(r.name)}</h3><span class="pill">${r.fromPlan ? (r.weekday === today ? 'Hoy · ' : '') + esc(r.weekday) : `${r.exerciseIds.length} ejercicios`}</span></div>
        <div class="rlist">${r.exerciseIds.map((id) => esc(exName(id))).join(' · ') || 'Sin ejercicios'}</div>
      </button>`).join('');
    const weekAgo = Date.now() - 7 * 864e5;
    const thisWeek = state.workouts.filter((w) => w.start >= weekAgo).length;
    const missing = missingLoads().length;
    return `
      ${planTrainBanner()}
      ${missing ? loadsBanner(missing) : ''}
      ${cal}
      <div class="actions2">
        <button class="primary" data-action="start">+ Entreno vacío</button>
        <button data-action="voice-open">🎙️ Dictar</button>
      </div>
      ${cal ? (routines ? `<details class="how"><summary>Todas las rutinas</summary>${routines}</details>` : '') : (routines || '<p class="muted">Sin rutinas. Crea un plan en la pestaña Plan.</p>')}
      ${state.workouts.length ? `<p class="statline"><b>${thisWeek}</b> esta semana · <b>${state.workouts.length}</b> entrenos · <b>${fmtKg(state.workouts.reduce((t, w) => t + workoutVolume(w), 0) / 1000)}</b> t</p>` : ''}`;
  }

  if (reorder) return viewReorder(a);

  const t = a.timer;
  const entries = a.entries.map((e, ei) => {
    const g = e.group ? { next: nextInGroup(a, e.group), others: a.entries.filter((x) => x.group === e.group && x !== e) } : null;
    const prev = lastSetsFor(e.exerciseId);
    const timed = isTimed(e.exerciseId);
    const rows = e.sets.map((s, si) => {
      const running = t?.kind === 'set' && t.e === ei && t.s === si;
      const isNext = g?.next && g.next.entry === e && g.next.si === si;
      return `
      <tr class="${s.done ? 'done' : ''} ${running ? 'running' : ''} ${isNext ? 'next' : ''}">
        <td>${si + 1}</td>
        <td class="prev">${prev[si] ? fmtSet(e.exerciseId, prev[si]) : '—'}</td>
        <td><input class="${s.sug && !s.done ? 'sug' : ''}" inputmode="decimal" placeholder="kg" value="${esc(s.w)}" data-field="w" data-e="${ei}" data-s="${si}" aria-label="Peso serie ${si + 1}"></td>
        <td><input class="${s.sug && !s.done ? 'sug' : ''}" inputmode="numeric" placeholder="${e.target ? esc(e.target.reps) : timed ? 'seg' : 'reps'}" value="${esc(s.r)}" data-field="r" data-e="${ei}" data-s="${si}" aria-label="${timed ? 'Segundos' : 'Repeticiones'} serie ${si + 1}"></td>
        <td class="btns">
          <button class="icon play" data-action="${running ? 'finish-set' : 'start-set'}" data-e="${ei}" data-s="${si}" aria-label="${running ? 'Terminar' : 'Cronometrar'} serie ${si + 1}">${running ? '■' : '▶'}</button>
          <button class="icon check" data-action="toggle-set" data-e="${ei}" data-s="${si}" aria-label="Completar serie ${si + 1}">✓</button>
        </td>
      </tr>`;
    }).join('');
    const tg = e.target;
    return `
      <div class="card ${g ? 'grouped' : ''}" ${g ? `style="--block:${blockColor(a.entries, e.group)}"` : ''}>
        <div class="row between">
          <h3>${esc(exName(e.exerciseId))}${e.adj ? ` <span class="pill">${esc(e.adj)}</span>` : ''}</h3>
          <div class="row">
            <button class="ghost small" data-action="set-rest" data-e="${ei}" aria-label="Cambiar descanso">⏱ ${fmtSecs(restForEntry(e))}</button>
            <button class="ghost danger" data-action="remove-entry" data-e="${ei}" aria-label="Quitar ejercicio">✕</button>
          </div>
        </div>
        ${g ? `<div class="blockinfo">🔗 <b>${blockLetter(a.entries, e.group)}</b> · ${g.next ? `toca <b>${esc(exName(g.next.entry.exerciseId))}</b> · serie ${g.next.si + 1}` : 'bloque completo ✓'}</div>` : ''}
        ${targetHTML(tg, timed)}
        ${suggestHTML(e.suggest, e.exerciseId)}
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
        <span class="muted timer" id="elapsed">${fmtDuration(Date.now() - a.start)}</span>
      </div>
      <div class="row">
        ${a.entries.length > 1 ? '<button class="icon" data-action="reorder-start" aria-label="Orden y bloques">↕️</button>' : ''}
        <button class="primary" data-action="finish">Terminar</button>
      </div>
    </div>
    ${a.entries.some((e) => e.suggest?.kind === 'calibrate') ? loadsBanner(a.entries.filter((e) => e.suggest?.kind === 'calibrate').length) : ''}
    ${entries || '<div class="empty"><div class="big">💪</div>Añade tu primer ejercicio</div>'}
    <div class="actions2">
      <button data-action="add-exercise">+ Ejercicio</button>
      <button data-action="voice-open-active">🎙️ Dictar</button>
    </div>
    <button class="ghost danger small center" data-action="discard">Descartar entreno</button>`;
}

function viewReorder(a) {
  const rows = a.entries.map((e, i) => {
    const lab = e.group ? blockLetter(a.entries, e.group) : '';
    const done = e.sets.filter((s) => s.done).length;
    return `
      <div class="rrow ${e.group ? 'grouped' : ''}" ${e.group ? `style="--block:${blockColor(a.entries, e.group)}"` : ''}>
        <button class="handle" data-handle aria-label="Arrastrar para cambiar el orden">⠿</button>
        <div class="rname"><b>${esc(exName(e.exerciseId))}</b><small>${e.group ? `🔗 Bloque ${lab} · ` : ''}${e.sets.length} series${done ? ` · ${done} hechas` : ''}</small></div>
        <button class="icon" data-action="move-up" data-e="${i}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="icon" data-action="move-down" data-e="${i}" aria-label="Bajar" ${i === a.entries.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="icon" data-action="block-dialog" data-e="${i}" aria-label="Alternar series con otros ejercicios">🔗</button>
      </div>`;
  }).join('');
  return `
    <div class="card row between">
      <h3>Orden y bloques</h3>
      <button class="primary" data-action="reorder-done">Listo</button>
    </div>
    <p class="muted hint">⠿ arrastra para ordenar · 🔗 alterna series entre ejercicios</p>
    ${rows}`;
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
      <div class="rlist">${r.exerciseIds.map((id) => esc(exName(id))).join(' · ') || 'Sin ejercicios'}</div>
    </div>`).join('');

  const groups = {};
  state.exercises.forEach((e) => (groups[e.muscle] ||= []).push(e));
  const exercises = Object.keys(groups).sort().map((m) => `
    <div class="card">
      <span class="pill">${esc(m)}</span>
      ${groups[m].sort((a, b) => a.name.localeCompare(b.name)).map((e) => `
        <div class="row between" style="margin-top:6px">
          <button class="ghost link" data-action="edit-exercise" data-id="${e.id}">
            ${esc(e.name)}${e.type === 'time' ? ' <span class="muted">· tiempo</span>' : ''}${e.rest == null ? '' : ` <span class="muted">· ⏱ ${fmtSecs(e.rest)}</span>`}
          </button>
          <button class="ghost danger" data-action="delete-exercise" data-id="${e.id}" aria-label="Borrar ${esc(e.name)}">✕</button>
        </div>`).join('')}
    </div>`).join('');

  const dups = findDuplicates(state.exercises).slice(0, 3);
  const dupHTML = dups.length ? `
    <div class="card accent stack"><b>¿Son el mismo ejercicio?</b>
      ${dups.map(([x, y]) => `<div class="row between"><span>${esc(x.name)} ≈ ${esc(y.name)}</span><button class="small" data-action="merge-pair" data-a="${x.id}" data-b="${y.id}">Unir</button></div>`).join('')}
    </div>` : '';
  return `
    ${dupHTML}
    <div class="row between"><h2>Mis rutinas</h2><button class="primary" data-action="new-routine">+ Nueva</button></div>
    ${routines || '<p class="muted">Sin rutinas.</p>'}
    <div class="row between" style="margin-top:20px"><h2>Ejercicios</h2><button data-action="new-exercise">+ Nuevo</button></div>
    ${exercises}
    <h2 style="margin-top:20px">Datos</h2>
    <div class="card row">
      <button class="block" data-action="export">Exportar copia</button>
      <button class="block" data-action="import">Importar</button>
    </div>`;
}

function viewHistory() {
  const tools = `<div class="row wrap" style="margin-bottom:12px">
    <button class="small" data-action="voice-open">🎙️ Registrar</button>
    <button class="small" data-action="import-open">📥 Importar</button>
  </div>`;
  if (!state.workouts.length) {
    return `${tools}<div class="empty"><div class="big">🗓️</div>Sin entrenos todavía.</div>`;
  }
  return `<h2>Historial</h2>${tools}` + [...state.workouts].reverse().map((w) => `
    <div class="card">
      <div class="row between">
        <div><h3>${esc(w.name)}${w.partial ? ' <span class="pill warn">parcial</span>' : ''}</h3><span class="muted">${fmtDate(w.start)} · ${fmtDuration(w.end - w.start)} · ${fmtKg(workoutVolume(w))} kg</span></div>
        <div class="row">
          <button class="ghost" data-action="workout-edit" data-id="${w.id}" aria-label="Editar entreno">✏️</button>
          <button class="ghost danger" data-action="delete-workout" data-id="${w.id}" aria-label="Borrar entreno">✕</button>
        </div>
      </div>
      <div class="stack" style="margin-top:8px">
        ${w.entries.map((e) => {
          const done = e.sets.filter((s) => s.done);
          const badge = e.group ? ` <span class="pill">🔗${blockLetter(w.entries, e.group)}</span>` : '';
          return `<div class="row between"><span>${esc(exName(e.exerciseId))}${badge}</span><span class="muted">${done.map((s) => fmtSet(e.exerciseId, s)).join(', ') || '—'}</span></div>`;
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
      <h3 style="margin-bottom:8px">${timed ? 'Mejor tiempo por sesión' : '1RM estimado'}</h3>
      ${lineChart(pts, fmt)}
    </div>`;
}

/* ---------- diálogos ---------- */

function openDialog(html, onSubmit) {
  if ($dialog.open) $dialog.close();
  $dialog.innerHTML = `<form method="dialog">${html}</form>`;
  const form = $dialog.querySelector('form');
  form.addEventListener('submit', (ev) => {
    if (ev.submitter?.value === 'cancel') return;
    // Si el manejador devuelve false, el diálogo se queda abierto (por ejemplo, cuando falta algo por elegir).
    if (onSubmit(new FormData(form), form, ev.submitter?.value) === false) ev.preventDefault();
  });
  $dialog.showModal();
}

/** Confirmación dentro de la app (sustituye a confirm(), que no funciona en todos los entornos). */
function ask(message, okLabel, onOk) {
  openDialog(`<p class="ask">${esc(message)}</p>${dialogButtons(okLabel)}`, () => onOk());
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
    ${dialogButtons(ex ? 'Guardar' : 'Crear')}
    ${ex ? '<button class="block ghost" value="merge" formnovalidate style="margin-top:8px">⇄ Unir con otro ejercicio…</button>' : ''}`,
  (fd, _f, value) => {
    if (value === 'merge') { mergeDialog(ex); return; }
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

/** Series del entreno en curso: hechas (✓), con datos sin marcar y sugeridas sin tocar. */
function summarizeActive(a) {
  let done = 0, typed = 0, sugs = 0;
  const skipped = [];
  a.entries.forEach((e) => {
    let got = 0;
    e.sets.forEach((s) => {
      if (s.done) { done++; got++; }
      else if (num(s.r) > 0 && !s.sug) { typed++; got++; }
      else if (num(s.r) > 0 && s.sug) sugs++;
    });
    if (!got) skipped.push(e.exerciseId);
  });
  return { done, typed, sugs, skipped };
}

/** Entreno a guardar: lo hecho, y opcionalmente lo escrito sin marcar o lo sugerido sin tocar. Lo que no se hizo queda anotado. */
function workoutFromActive(a, { typed, sugs }) {
  const include = (s) => s.done || (typed && num(s.r) > 0 && !s.sug) || (sugs && num(s.r) > 0 && s.sug);
  const entries = [], skipped = [];
  let planned = 0, got = 0;
  a.entries.forEach(({ suggest, ...e }) => {
    planned += e.sets.length;
    const sets = e.sets.filter(include).map(({ sug, ...s }) => ({ ...s, done: true }));
    if (sets.length) { entries.push({ ...e, sets, planned: e.sets.length }); got += sets.length; } else skipped.push(e.exerciseId);
  });
  return { id: uid(), name: a.name, start: a.start, end: Date.now(), entries, routineId: a.routineId, skipped, partial: skipped.length > 0 || got < planned, ...(a.remainderOf ? { remainderOf: a.remainderOf } : {}) };
}

/** Ejercicios de las rutinas de tu plan (y del entreno en curso) que no tienen carga de partida ni historial. */
function missingLoads() {
  const out = new Map();
  const consider = (id, tg, routine) => {
    const ex = exById(id);
    if (!ex || ex.type === 'time' || out.has(id)) return;
    if (tg?.startLoad > 0 || ex.startLoad > 0) return;
    if ((tg?.startBasis || ex.startBasis) === 'peso_corporal') return;
    if (historyFor(id, 1).length) return;
    out.set(id, { exerciseId: id, name: ex.name, muscle: ex.muscle, type: ex.type, sets: tg?.sets || 3, reps: tg?.reps || '8-12', rir: tg?.rir || '2', routine });
  };
  state.routines.filter((r) => r.fromPlan).forEach((r) => r.exerciseIds.forEach((id) => consider(id, r.targets?.[id], r.name)));
  state.active?.entries.forEach((e) => consider(e.exerciseId, e.target, state.active.name));
  return [...out.values()];
}

/** Guarda la carga de partida de un ejercicio: en el ejercicio, en las rutinas, en el plan y en el entreno en curso. */
function applyLoad(exId, kg, basis) {
  const ex = exById(exId);
  if (!ex) return;
  ex.startLoad = kg;
  ex.startBasis = basis;
  state.routines.forEach((r) => {
    const t = r.targets?.[exId];
    if (t && !(t.startLoad > 0)) { t.startLoad = kg; t.startBasis = basis; }
  });
  state.plan?.mesocycles.forEach((m) => m.days.forEach((d) => d.exercises.forEach((x) => {
    if (!(x.start_load_kg > 0) && matchExercise(x.name, [ex])) { x.start_load_kg = kg; x.load_basis = basis; }
  })));
  if (state.active) {
    state.active.entries = state.active.entries.map((e) => {
      if (e.exerciseId !== exId || e.sets.some((s) => s.done)) return e;
      const fresh = newEntry(exId, e.target);
      ['group', 'adj', 'adjSets', 'rest'].forEach((k) => { if (e[k] != null) fresh[k] = e[k]; });
      return fresh;
    });
  }
}

const loadsBanner = (n) => `<div class="card loadsb"><div class="row between"><span><b>Faltan cargas de partida</b> <span class="muted">· ${n} ejercicio${n > 1 ? 's' : ''}</span></span><button class="small primary" data-action="loads-estimate">Estimar con IA</button></div></div>`;

function confirmMerge(fromId, toId) {
  const f = exById(fromId), t = exById(toId);
  if (!f || !t) return;
  ask(`¿Unir «${f.name}» con «${t.name}»? Todo el historial de «${f.name}» pasará a «${t.name}».`, 'Unir', () => {
    mergeExercises(state, fromId, toId, { newEntry: (id, tg) => newEntry(id, tg) });
    toast('Ejercicios unidos');
    commit();
  });
}

function mergeDialog(ex) {
  const others = state.exercises.filter((e) => e.id !== ex.id).sort((a, b) => a.name.localeCompare(b.name));
  openDialog(`
    <h2>Unir «${esc(ex.name)}» con…</h2>
    <div class="pick-list">${others.map((o) => `<label><input type="radio" name="into" value="${o.id}" required> ${esc(o.name)} <span class="muted">· ${esc(o.muscle)}</span></label>`).join('')}</div>
    ${dialogButtons('Unir')}`,
  (fd) => { if (fd.get('into')) confirmMerge(ex.id, fd.get('into')); });
}

const actions = {
  start(id) {
    const r = state.routines.find((x) => x.id === id);
    state.active = {
      name: r ? r.name : 'Entreno libre',
      routineId: r?.id,
      start: Date.now(),
      entries: r ? r.exerciseIds.filter(exById).map((exId) => newEntry(exId, r.targets?.[exId], { deload: !!(r.fromPlan && weekInfo(state.plan)?.wp?.deload) })) : [],
      timer: null,
    };
    if (r) applyAdjustments(r);
  },
  // Empezar solo lo que quedó sin hacer en una sesión parcial.
  'start-rest'(id) {
    const w = state.workouts.find((x) => x.id === id);
    if (!w?.skipped?.length) return false;
    const r = state.routines.find((x) => x.id === w.routineId);
    state.active = {
      name: `${w.name} · lo que faltó`,
      routineId: w.routineId,
      remainderOf: w.id,
      start: Date.now(),
      entries: w.skipped.filter(exById).map((exId) => newEntry(exId, r?.targets?.[exId], { deload: !!(r?.fromPlan && weekInfo(state.plan)?.wp?.deload) })),
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
    cleanGroups(a);
  },
  'reorder-start'() { reorder = true; },
  'reorder-done'() { reorder = false; },
  'move-up'(_, el) { moveEntry(+el.dataset.e, +el.dataset.e - 1); return false; },
  'move-down'(_, el) { moveEntry(+el.dataset.e, +el.dataset.e + 1); return false; },
  'block-dialog'(_, el) {
    const a = state.active, i = +el.dataset.e, me = a.entries[i];
    const others = a.entries.map((e, k) => ({ e, k })).filter(({ k }) => k !== i);
    if (!others.length) { toast('Añade otro ejercicio para poder alternar'); return false; }
    openDialog(`
      <h2>Alternar ${esc(exName(me.exerciseId))} con…</h2>
      <div class="pick-list">${others.map(({ e, k }) => `<label><input type="checkbox" name="with" value="${k}" ${me.group && e.group === me.group ? 'checked' : ''}> ${esc(exName(e.exerciseId))}</label>`).join('')}</div>
      ${dialogButtons('Guardar')}`,
    (fd) => {
      const chosen = fd.getAll('with').map((k) => a.entries[+k]);
      const old = me.group;
      if (old) a.entries.forEach((x) => { if (x.group === old && x !== me && !chosen.includes(x)) delete x.group; });
      if (!chosen.length) delete me.group;
      else {
        const id = me.group || chosen.find((c) => c.group)?.group || uid();
        me.group = id;
        chosen.forEach((c) => { c.group = id; });
      }
      cleanGroups(a);
      commit();
    });
    return false;
  },
  'add-set'(_, el) {
    const sets = state.active.entries[+el.dataset.e].sets;
    const last = sets[sets.length - 1];
    sets.push({ w: last?.w ?? '', r: last?.r ?? '', done: false, sug: !!last?.sug });
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
    if (s.done) { s.sug = false; afterSetDone(e, si); }
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
    set.sug = false;
    a.timer = null;
    afterSetDone(t.e, t.s);
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
    const entry = state.active.entries[+el.dataset.e];
    const ex = exById(entry.exerciseId);
    if (!ex) return false;
    openDialog(`
      <h2>Descanso · ${esc(ex.name)}</h2>
      <select name="rest">
        <option value="">Predeterminado (${fmtSecs(state.settings.rest)})</option>
        ${restOptions(ex.rest)}
      </select>
      ${dialogButtons('Guardar')}`,
    (fd) => {
      ex.rest = fd.get('rest') ? +fd.get('rest') : undefined;
      entry.rest = ex.rest;
      commit();
    });
    return false;
  },
  finish() {
    const a = state.active;
    const sm = summarizeActive(a);
    const logged = sm.done + sm.typed;
    const exDone = a.entries.length - sm.skipped.length;
    openDialog(`
      <h2>Terminar entreno</h2>
      ${logged ? `<p class="finish-sum"><b>${logged}</b> series hechas · <b>${exDone}</b> de <b>${a.entries.length}</b> ejercicios</p>` : '<p class="muted">Aún no hay series registradas.</p>'}
      ${sm.typed ? `<label class="switch"><input type="checkbox" name="typed" checked><span><b>${sm.typed} con datos sin marcar ✓</b><small>Guardarlas como hechas</small></span></label>` : ''}
      ${sm.sugs ? `<label class="switch"><input type="checkbox" name="sugs"><span><b>${sm.sugs} sugeridas sin confirmar</b><small>Marca si las hiciste tal como estaban</small></span></label>` : ''}
      ${sm.skipped.length && logged ? `<p class="muted">Sin hacer: ${esc(sm.skipped.map(exName).join(', '))}</p>` : ''}
      <div class="stack" style="margin-top:14px">
        ${sm.done + sm.typed + sm.sugs ? '<button class="block primary" value="save">Guardar entreno</button>' : ''}
        <button class="block" value="cancel" formnovalidate>Seguir entrenando</button>
        <button class="block ghost danger" value="discard">Descartar</button>
      </div>`,
    (fd, _f, value) => {
      if (value === 'discard') {
        ask('¿Descartar este entreno? Se perderán las series.', 'Descartar', () => { state.active = null; clearNotes(); commit(); });
        return;
      }
      const w = workoutFromActive(a, { typed: fd.has('typed'), sugs: fd.has('sugs') });
      if (!w.entries.length) { toast(sm.sugs ? 'Marca las series que hiciste para guardarlas' : 'No hay series que guardar'); return false; }
      state.workouts.push(w);
      state.workouts.sort((x, y) => x.start - y.start);
      // Los ajustes de la semana que se aplicaron a este entreno ya están hechos.
      (state.adjust || []).forEach((x) => { if (a.adjIds?.includes(x.id)) x.consumed = true; });
      // Si era "lo que faltó", la sesión original deja de estar pendiente en lo que ya se hizo.
      if (a.remainderOf) {
        const orig = state.workouts.find((x) => x.id === a.remainderOf);
        if (orig) {
          const did = new Set(w.entries.map((e) => e.exerciseId));
          orig.skipped = (orig.skipped || []).filter((id) => !did.has(id));
          if (!orig.skipped.length) orig.partial = false;
        }
      }
      state.active = null;
      clearNotes();
      tab = 'train';
      commit();
      toast(w.partial ? 'Guardado como sesión parcial: lo tendré en cuenta para tus próximas cargas' : 'Entreno guardado');
    });
    return false;
  },
  // ---- calendario de la pestaña Entrenar
  'cal-day'(_, el) {
    const day = calCell(el.dataset.iso);
    if (!day) return false;
    const title = `${day.weekday} ${day.date.getDate()}`;
    const r = day.routine;
    if (r) {
      const items = r.exerciseIds.filter(exById).map((id) => {
        const t = r.targets?.[id];
        return `<li>${esc(exName(id))}${t ? ` <span class="muted">${t.sets}×${esc(t.reps)}</span>` : ''}</li>`;
      }).join('');
      const adj = adjustmentsFor(state, r.name, day.date.getTime()).map((x) => `<li class="muted">＋ ${x.kind === 'add_sets' ? `${x.sets} serie${x.sets > 1 ? 's' : ''} de ${esc(x.exercise)}` : `${esc(x.exercise)} ${x.sets}×${esc(x.reps)}`}</li>`).join('');
      const note = day.workout
        ? `<p class="muted">${day.status === 'partial' ? '◐ Sesión parcial' : '✓ Hecho'}${day.doneOn ? ` · el ${fmtDate(day.workout.start)}` : ''}</p>`
        : day.movedFrom ? `<p class="muted">↪ Movida desde el ${dayLabel(calCell(day.movedFrom) || { weekday: day.movedFrom, date: new Date() })}</p>` : '';
      const canMove = !day.workout;
      openDialog(`
        <h2>${title} · ${esc(r.name)}</h2>
        ${note}
        <ul class="exlist">${items}${adj}</ul>
        <div class="stack" style="margin-top:12px">
          <button class="block primary" value="start">${day.workout ? 'Hacerlo otra vez' : day.status === 'missed' ? 'Hacerlo ahora' : 'Empezar'}</button>
          ${day.status === 'partial' && day.workout?.skipped?.length ? '<button class="block" value="rest">Hacer lo que faltó</button>' : ''}
          ${canMove ? '<button class="block" value="move">📅 Mover a otro día</button><button class="block" value="skip">Saltar esta sesión</button>' : ''}
          ${day.movedFrom && !day.workout ? '<button class="block ghost" value="back">Volver a su día</button>' : ''}
          ${day.workout ? '<button class="block" value="history">Ver en historial</button>' : ''}
          <button class="block ghost" value="cancel" formnovalidate>Cerrar</button>
        </div>`,
      (fd, _f, value) => {
        if (value === 'start') { actions.start(r.id); commit(); }
        else if (value === 'rest') { actions['start-rest'](day.workout.id); commit(); }
        else if (value === 'move') moveDialog(day);
        else if (value === 'skip') skipSession(day);
        else if (value === 'back') { setMove(state, day, day.movedFrom, calCell); commit(); }
        else if (value === 'history') { tab = 'history'; render(); window.scrollTo(0, 0); }
      });
    } else if (day.status === 'moved' || day.status === 'skipped') {
      const mv = (state.moves || []).find((m) => m.from === day.iso);
      const dest = day.movedTo ? calCell(day.movedTo) : null;
      openDialog(`
        <h2>${title} · ${esc(mv?.name || 'Sesión')}</h2>
        <p class="muted">${day.status === 'skipped' ? '⏭ Sesión saltada' : `↪ Movida al ${dest ? dayLabel(dest) : day.movedTo}`}</p>
        <div class="stack" style="margin-top:12px">
          <button class="block primary" value="restore">${day.status === 'skipped' ? 'Recuperar la sesión' : 'Volver a este día'}</button>
          <button class="block ghost" value="cancel" formnovalidate>Cerrar</button>
        </div>`,
      () => { state.moves = state.moves.filter((m) => m !== mv); commit(); });
    } else if (day.extra) {
      openDialog(`
        <h2>${title} · ${esc(day.extra.name)}</h2>
        <p class="muted">Entreno fuera del plan</p>
        <div class="stack" style="margin-top:12px">
          <button class="block" value="history">Ver en historial</button>
          <button class="block ghost" value="cancel" formnovalidate>Cerrar</button>
        </div>`,
      () => { tab = 'history'; render(); window.scrollTo(0, 0); });
    }
    return false;
  },
  'cal-move'(_, el) { const c = calCell(el.dataset.iso); if (c?.routine) moveDialog(c); return false; },
  'cal-skip'(_, el) { const c = calCell(el.dataset.iso); if (c?.routine) skipSession(c); return false; },
  // ---- unir ejercicios duplicados
  'merge-pair'(_, el) {
    const [a, b] = [el.dataset.a, el.dataset.b];
    const count = (id) => state.workouts.filter((w) => w.entries.some((e) => e.exerciseId === id)).length;
    // Se conserva el que tiene más historial; a igualdad, el primero.
    const [from, to] = count(a) >= count(b) ? [b, a] : [a, b];
    confirmMerge(from, to);
    return false;
  },
  'merge-into'(_, el) { confirmMerge(el.dataset.from, el.dataset.to); return false; },
  discard() {
    ask('¿Descartar este entreno? Se perderán las series.', 'Descartar', () => { state.active = null; clearNotes(); commit(); });
    return false;
  },
  settings() {
    const s = state.settings;
    const canNotify = 'Notification' in window;
    const canLock = 'mediaSession' in navigator;
    const canWake = 'wakeLock' in navigator;
    const sw = (name, title, help, supported = true) => `
      <label class="switch">
        <input type="checkbox" name="${name}" ${s[name] && supported ? 'checked' : ''} ${supported ? '' : 'disabled'}>
        <span><b>${title}</b>${help || !supported ? `<small>${help}${supported ? '' : ' No disponible en este navegador'}</small>` : ''}</span>
      </label>`;
    openDialog(`
      <h2>Ajustes</h2>
      <label class="field">Descanso entre series
        <select name="rest">${restOptions(s.rest)}</select>
      </label>
      ${sw('lockscreen', 'Temporizador con el móvil bloqueado', 'Puede pausar tu música', canLock)}
      ${sw('notify', 'Notificaciones', 'Aviso al terminar el descanso', canNotify)}
      ${sw('sound', 'Sonido y vibración', '')}
      ${sw('wakeLock', 'Pantalla siempre encendida', 'Durante el entreno', canWake)}
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
          if (!s.notify) toast('Permiso de notificaciones denegado: actívalo en los ajustes del navegador');
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
    ask('¿Borrar esta rutina?', 'Borrar', () => { state.routines = state.routines.filter((r) => r.id !== id); commit(); });
    return false;
  },
  'new-exercise'() { exerciseDialog(null); return false; },
  'edit-exercise'(id) { exerciseDialog(exById(id)); return false; },
  'delete-exercise'(id) {
    const usedInHistory = state.workouts.some((w) => w.entries.some((e) => e.exerciseId === id));
    const msg = usedInHistory
      ? 'Este ejercicio aparece en tu historial. ¿Borrarlo de todos modos? El historial lo mostrará como "Ejercicio eliminado".'
      : '¿Borrar este ejercicio?';
    ask(msg, 'Borrar', () => {
      state.exercises = state.exercises.filter((e) => e.id !== id);
      state.routines.forEach((r) => { r.exerciseIds = r.exerciseIds.filter((x) => x !== id); });
      commit();
    });
    return false;
  },
  'delete-workout'(id) {
    ask('¿Borrar este entreno del historial?', 'Borrar', () => {
      state.workouts = state.workouts.filter((w) => w.id !== id);
      state.meta.deletedWorkouts = [...state.meta.deletedWorkouts, id].slice(-500);
      commit();
    });
    return false;
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
        ask('Esto reemplazará todos tus datos actuales. ¿Continuar?', 'Reemplazar', () => {
          state = migrate({ ...defaultState(), ...data });
          commit();
        });
      } catch (_) {
        toast('El archivo no es una copia válida de Gymonkey');
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
  if (tabBtn) {
    const go = () => { tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); };
    if (loadsActive()) loadsLeave(go); else if (weekActive()) weekLeave(go); else if (sessionsActive()) sessionsLeave(go); else go();
    return;
  }
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT') return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (fn(el.dataset.id, el) !== false) commit();
});

// Arrastrar y soltar con el dedo (o el ratón) desde el asa ⠿ en "Orden y bloques".
let drag = null;
document.addEventListener('pointerdown', (ev) => {
  const handle = ev.target.closest?.('[data-handle]');
  const row = handle?.closest('.rrow');
  if (!row) return;
  ev.preventDefault();
  const rows = [...document.querySelectorAll('.rrow')];
  drag = {
    row, rows, from: rows.indexOf(row), to: rows.indexOf(row), startY: ev.clientY,
    mids: rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 + window.scrollY; }),
  };
  row.classList.add('dragging');
  handle.setPointerCapture?.(ev.pointerId);
}, { passive: false });
document.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  drag.row.style.transform = `translateY(${ev.clientY - drag.startY}px)`;
  const y = ev.clientY + window.scrollY;
  // Posición final = filas (distintas de la arrastrada) cuyo centro queda por encima del puntero.
  drag.to = drag.mids.filter((m, i) => i !== drag.from && m < y).length;
  const others = drag.rows.filter((_, i) => i !== drag.from);
  drag.rows.forEach((r) => r.classList.remove('drop-above', 'drop-below'));
  if (others[drag.to]) others[drag.to].classList.add('drop-above'); else others.at(-1)?.classList.add('drop-below');
});
const endDrag = () => {
  if (!drag) return;
  const { row, from, to } = drag;
  drag = null;
  row.style.transform = '';
  if (from !== to) moveEntry(from, to); else render();
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

// El audio del móvil solo se puede activar tras un toque del usuario.
document.addEventListener('pointerdown', () => audioCtx(), { passive: true });

document.addEventListener('submit', (ev) => {
  const form = ev.target;
  if (!form.dataset.form) return;
  ev.preventDefault();
  onPlanSubmit(form);
});

// Escribir en los campos de peso/reps sin volver a pintar toda la vista (mantiene el foco).
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.edit) { onPlanInput(el); return; }
  if (el.dataset.ld !== undefined) { onLoadsInput(el); return; }
  if (el.dataset.ctxdoc !== undefined) { onContextInput(el); return; }
  if (el.dataset.svtext !== undefined || el.dataset.sv !== undefined) { onSessionsInput(el); return; }
  if (!el.dataset.field || !state.active) return;
  const set = state.active.entries[+el.dataset.e].sets[+el.dataset.s];
  set[el.dataset.field] = el.value;
  if (set.sug) {
    // Al corregir una serie sugerida deja de verse como sugerencia.
    set.sug = false;
    el.closest('tr')?.querySelectorAll('input.sug').forEach((i) => i.classList.remove('sug'));
  }
  save();
});

document.addEventListener('change', (ev) => {
  if (ev.target.matches?.('input[data-ctx-file]')) { onContextFile(ev.target); return; }
  if (ev.target.matches?.('input[data-sv-file]')) { onSessionsFile(ev.target); return; }
  if (ev.target.dataset?.svInc !== undefined) { onSessionsChange(ev.target); return; }
  if (ev.target.dataset?.wkAct !== undefined) { onWeekChange(ev.target); return; }
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
    planResume();
    if (cloud.currentUser() && Date.now() - lastPull > 60_000) syncPull();
  }
});

/* ============================================================
 * Cuenta de Google y sincronización
 * ============================================================ */

let syncTimer = null;
let syncStatus = 'idle'; // idle | saving | ok | error
let lastPull = 0;

function setSyncStatus(s) { syncStatus = s; renderAccount(); }

function scheduleSync() {
  if (!cloud.currentUser()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPush, 1500);
}

async function syncPush() {
  if (!cloud.currentUser()) return;
  setSyncStatus('saving');
  try { await cloud.pushState(state); setSyncStatus('ok'); } catch (e) { console.error(e); setSyncStatus('error'); }
}

const byId = (...lists) => {
  const m = new Map();
  lists.forEach((l) => (l || []).forEach((x) => m.set(x.id, x)));
  return [...m.values()];
};

/** Une los datos del dispositivo con los de la cuenta. */
function mergeStates(local, remote, uid) {
  const main = remote.main;
  const tomb = new Set([...(local.meta.deletedWorkouts || []), ...(main.meta?.deletedWorkouts || [])]);
  const workouts = byId(local.workouts, remote.workouts).filter((w) => !tomb.has(w.id)).sort((a, b) => a.start - b.start);
  let base;
  if (local.meta.uid === uid) {
    // Mismo usuario en este dispositivo: gana la versión modificada más recientemente.
    base = (local.meta.updatedAt || 0) > (main.meta?.updatedAt || 0) ? local : main;
  } else {
    // Primera vez en este dispositivo: se suma lo local a lo de la cuenta sin perder nada.
    base = {
      ...main,
      exercises: byId(local.exercises, main.exercises),
      routines: byId(local.routines, main.routines),
      plan: main.plan || local.plan,
      profile: main.profile || local.profile,
      active: main.active || local.active,
    };
  }
  return migrate({
    ...defaultState(), ...base, workouts,
    meta: { ...(base.meta || {}), uid, deletedWorkouts: [...tomb].slice(-500), updatedAt: Math.max(local.meta.updatedAt || 0, main.meta?.updatedAt || 0) },
  });
}

async function syncPull() {
  const u = cloud.currentUser();
  if (!u) return;
  lastPull = Date.now();
  setSyncStatus('saving');
  try {
    const remote = await cloud.pullRemote();
    if (!remote.main) {
      state.meta.uid = u.uid;
      storeLocal();
      await cloud.pushState(state);
    } else {
      const before = JSON.stringify(state);
      state = mergeStates(state, remote, u.uid);
      storeLocal();
      if (JSON.stringify(state) !== before && !document.querySelector('dialog[open]')) render();
      await cloud.pushState(state);
    }
    setSyncStatus('ok');
  } catch (e) {
    console.error(e);
    setSyncStatus('error');
  }
}

function renderAccount() {
  const el = document.getElementById('account');
  if (!el) return;
  if (!cloud.cloudConfigured) { el.innerHTML = ''; return; }
  const u = cloud.currentUser();
  if (!u) { el.innerHTML = '<button class="small" data-action="sign-in">Entrar</button>'; return; }
  const dot = { saving: 'saving', ok: 'ok', error: 'error' }[syncStatus] || '';
  const initial = esc((u.displayName || u.email || '?').trim()[0].toUpperCase());
  el.innerHTML = `<button class="avatar ${dot}" data-action="account" aria-label="Tu cuenta">
    ${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : initial}</button>`;
}

Object.assign(actions, planActions, sessionsActions, weekActions, loadsActions, {
  reload() { location.reload(); return false; },
  'sign-in'() {
    cloud.signIn().catch((e) => toast(`No se pudo iniciar sesión: ${e.message}`));
    return false;
  },
  account() {
    const u = cloud.currentUser();
    const statusText = { saving: 'Sincronizando…', ok: 'Todo guardado en tu cuenta ✓', error: 'No se pudo sincronizar (se reintentará)', idle: '' }[syncStatus];
    openDialog(`
      <h2>Tu cuenta</h2>
      <p><b>${esc(u.displayName || '')}</b><br><span class="muted">${esc(u.email || '')}</span></p>
      <p class="muted">${statusText}</p>
      <div class="row" style="margin-top:14px">
        <button class="block" value="sync">Sincronizar ahora</button>
        <button class="block danger" value="logout">Cerrar sesión</button>
      </div>
      <button class="block ghost" value="cancel" style="margin-top:8px">Cerrar</button>`,
    async (_, __, value) => {
      if (value === 'sync') { await syncPush(); await syncPull(); }
    });
    // Los botones devuelven su value en el submit; se gestiona el cierre de sesión aparte.
    $dialog.querySelector('[value="logout"]').addEventListener('click', async (ev) => {
      ev.preventDefault();
      ask('¿Cerrar sesión? Los datos se borrarán de este dispositivo, pero siguen guardados en tu cuenta.', 'Cerrar sesión', async () => {
        clearTimeout(syncTimer);
        await syncPush();
        await cloud.signOutCloud();
        state = defaultState();
        storeLocal();
        render();
      });
    });
    return false;
  },
});

/* ---------- avisos breves ---------- */

let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

initLoads({
  state: () => state,
  esc, ask, toast, fmtSecs, render, commit,
  missing: missingLoads,
  knownLoads: () => knownLoads(state.workouts, state.exercises),
  applyLoad,
});

initWeek({
  state: () => state,
  uid, esc, ask, toast, fmtSecs, render, commit,
  weekContext: weekCtx,
  knownLoads: () => knownLoads(state.workouts, state.exercises),
});

initSessions({
  state: () => state,
  uid, esc, ask, toast, fmtSecs, render, commit, openDialog, dialogButtons,
  newEntry: (id) => newEntry(id),
  setTab: (t) => { tab = t; },
});

initPlan({
  state: () => state,
  commit, save, render, openDialog, dialogButtons, ask, esc, uid, fmtSecs, exName, fmtSet, toast,
  auth: { configured: cloud.cloudConfigured, user: cloud.currentUser, idToken: cloud.idToken },
});

cloud.initCloud((u) => {
  renderAccount();
  if (u) syncPull();
  if (tab === 'plan') render();
}).catch((e) => console.error('No se pudo iniciar Firebase', e));

render();
setInterval(tick, 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
