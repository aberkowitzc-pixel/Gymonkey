/* ============================================================
 * Gymonkey — registro de entrenamientos (PWA, sin dependencias)
 * Los datos se guardan en el dispositivo (localStorage) y, si
 * inicias sesión con Google, también en tu cuenta (Firestore).
 * ============================================================ */

import * as cloud from './cloud.js';
import { initPlan, viewPlan, planActions, onPlanSubmit, onPlanInput, onContextFile, onContextInput, onChatInput, planTick, planTrainBanner, planBusy, planResume, planWeekLabel, weekInfo, todayName, WEEKDAYS } from './plan.js';
import { suggestLoad, suggestedReps, inferRange, parseRange, knownLoads } from './progression.js';
import { initLoads, viewLoads, loadsActive, loadsBusy, loadsTick, loadsLeave, loadsActions, onLoadsInput } from './loads.js';
import { buildWeeks, shortName, isoLocal, mondayOf } from './calendar.js';
import { buildWeekContext, hasDeficit, moveOptions, setMove, adjustmentsFor, pruneSchedule } from './weekplan.js';
import { initWeek, viewWeek, weekActive, weekBusy, weekTick, weekLeave, weekActions, onWeekChange } from './week.js';
import { matchExercise, mergeExercises, findDuplicates, dedupeLibrary } from './exercises.js';
import { t, tn, T, E, tData, getLang, setLang, LANGS, detectLang, fmtNum, fwd, dayShort, dayLetter, exLabel, canonicalExercise, fmtDateShort, fmtTime, isRTL, locale } from './i18n.js';
import { ic } from './icons.js';
import { buildEvent, upsertEvent, deleteEvent, eventIdFor } from './gcal.js';
import { suggestSession, freeDays } from './suggest.js';
import { initSessions, viewSessions, sessionsActive, sessionsBusy, sessionsTick, sessionsLeave, sessionsActions, onSessionsInput, onSessionsChange, onSessionsFile } from './sessions.js';

const STORAGE_KEY = 'gymonkey:v1';
const REST_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300];
const DEFAULT_SETTINGS = { rest: 90, lockscreen: true, notify: false, sound: true, wakeLock: true, theme: 'system' };
const NOTE_TAG = 'gymonkey-timer';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function defaultExercises() {
  return [
    [E('Press de banca'), 'Pecho'],
    [E('Press inclinado con mancuernas'), 'Pecho'],
    [E('Aperturas'), 'Pecho'],
    [E('Sentadilla'), 'Piernas'],
    [E('Peso muerto'), 'Espalda'],
    [E('Prensa de piernas'), 'Piernas'],
    [E('Zancadas'), 'Piernas'],
    [E('Dominadas'), 'Espalda'],
    [E('Remo con barra'), 'Espalda'],
    [E('Jalón al pecho'), 'Espalda'],
    [E('Press militar'), 'Hombros'],
    [E('Elevaciones laterales'), 'Hombros'],
    [E('Curl de bíceps'), 'Brazos'],
    [E('Extensión de tríceps'), 'Brazos'],
    [E('Fondos'), 'Brazos'],
    [E('Plancha'), 'Core', 'time'],
  ].map(([name, muscle, type = 'reps']) => ({ id: `ex-${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}`, name, muscle, type }));
}

function defaultState() {
  const exercises = defaultExercises();
  const ex = (n) => exercises.find((e) => e.name === n).id;
  return {
    settings: { ...DEFAULT_SETTINGS },
    exercises,
    routines: [
      { id: 'rt-push', name: T('Empuje (Push)'), exerciseIds: [ex(E('Press de banca')), ex(E('Press militar')), ex(E('Elevaciones laterales')), ex(E('Extensión de tríceps'))] },
      { id: 'rt-pull', name: T('Tirón (Pull)'), exerciseIds: [ex(E('Dominadas')), ex(E('Remo con barra')), ex(E('Jalón al pecho')), ex(E('Curl de bíceps'))] },
      { id: 'rt-legs', name: T('Pierna (Legs)'), exerciseIds: [ex(E('Sentadilla')), ex(E('Peso muerto')), ex(E('Prensa de piernas')), ex(E('Zancadas'))] },
    ],
    workouts: [],
    active: null,
    profile: null,
    plan: null,
    chat: [],
    moves: [],
    adjust: [],
    schedule: [],
    extras: [],
    weekTimes: null,
    gcalQueue: [],
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
  s.chat ??= [];
  s.moves ??= [];
  s.adjust ??= [];
  s.schedule ??= [];
  s.weekTimes ??= null;
  // Las sesiones extra de hace más de dos meses ya no hacen falta (los entrenos hechos quedan en el historial).
  s.extras = (s.extras || []).filter((x) => x.iso >= isoLocal(Date.now() - 60 * 864e5));
  s.schedule.forEach((x) => { if (x.gcal === undefined) x.gcal = !!x.eventId; });
  s.gcalQueue ??= [];
  s.meta = { deletedWorkouts: [], ...(s.meta || {}) };
  dedupeLibrary(s);
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
const exName = (id) => exById(id)?.name ?? t('Ejercicio eliminado');
/** Nombre del ejercicio para mostrarlo (en el idioma elegido); exName es el guardado, para datos y para la IA. */
const exDisp = (id) => exLabel(exName(id));
/** Nombre de rutina o entreno para mostrarlo: las de ejemplo se traducen, las de la persona se dejan tal cual. */
const rName = (n) => tData(n);
const mLabel = (m) => tData(m);
const MUSCLES = ['Pecho', 'Espalda', 'Piernas', 'Glúteos', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros'];
/** Grupo muscular guardado (en español) a partir de lo que se escribió o eligió en el idioma actual. */
const muscleKey = (label) => MUSCLES.find((m) => mLabel(m) === label) || label;
/** Etiqueta del ajuste de compensación de un ejercicio (se guarda el tipo y el número, no el texto). */
const adjLabel = (e) => (e.adj === 'sets' ? tn(e.adjSets || 1, '+{n} serie', '+{n} series') : e.adj === 'new' ? t('Añadido') : e.adj);
const isTimed = (id) => exById(id)?.type === 'time';
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmtKg = (n) => fmtNum(Math.round(n * 10) / 10);
const fmtDate = fmtDateShort;
const fmtClock = fmtTime;
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
  if (isTimed(exerciseId)) return (num(s.w) ? `${fmtKg(num(s.w))} ${t('kg')} · ` : '') + fmtSecs(num(s.r));
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
  const name = exDisp(entry.exerciseId);
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
      ? t('¡A por la siguiente serie! (+{time})', { time: fmtDuration(info.elapsed - info.duration) })
      : t('Descanso · quedan {time}', { time: fmtDuration(info.remaining) });
    artist = `${t('Llevas {time} de descanso', { time: fmtDuration(info.elapsed) })} · ${info.name}`;
  } else {
    title = `${t('Serie {n}', { n: info.setNo })} · ${fmtDuration(info.elapsed)}`;
    artist = info.name + (info.target ? ` · ${t('objetivo {time}', { time: fmtDuration(info.target) })}` : '');
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
      <div class="banner-main"><div><small>${t('Tiempo de serie')}</small><b class="timer" data-slot="elapsed"></b></div></div>
      <div class="banner-actions">
        <button data-action="cancel-timer">${t('Cancelar')}</button>
        <button class="solid" data-action="finish-set">✓ ${t('Serie hecha')}</button>
      </div>`;
  }
  const over = kind === 'rest-over';
  return `
    <div class="banner-head"><span>${over ? t('¡Descanso terminado!') : t('Descanso')} · <span data-slot="name"></span></span><span>${t('de {total}', { total: '<span data-slot="total" dir="ltr"></span>' })}</span></div>
    <div class="banner-main">
      <div><small>${t('Llevas')}</small><b class="timer" data-slot="elapsed"></b></div>
      <div class="right"><small>${over ? t('De más') : t('Quedan')}</small><b class="timer" data-slot="remaining"></b></div>
    </div>
    <div class="bar"><i></i></div>
    <div class="banner-actions">
      <button data-action="rest-adjust" data-d="-15">−15 ${t('s')}</button>
      <button data-action="rest-adjust" data-d="15">+15 ${t('s')}</button>
      <button class="solid" data-action="rest-skip">${over ? t('Cerrar') : t('Saltar')}</button>
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
    slot('setno', t('Serie {n}', { n: info.setNo }));
    slot('target', info.target ? t('objetivo {time}', { time: fmtDuration(info.target) }) : '');
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
      alarm(t('¡Descanso terminado!'), t('A por la siguiente serie de {name}', { name: info.name }));
    } else if (info.kind === 'set' && info.target && info.elapsed >= info.target) {
      a.timer.alerted = true; save();
      alarm(t('¡Tiempo!'), t('Serie {n} de {name}: objetivo cumplido', { n: info.setNo, name: info.name }));
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
    $view.innerHTML = `<div class="card error"><p>${t('No se pudo mostrar esta pantalla.')}</p><button class="primary" data-action="reload">${t('Recargar la app')}</button></div>`;
  }
  bannerKind = null;
  document.getElementById('banner')?.remove();
  if (tab === 'plan') document.getElementById('chat-end')?.scrollIntoView({ block: 'end' });
  tick();
  syncWakeLock();
}

const kindLabel = (k) => ({ up: t('↑ sube'), hold: t('= mantén'), down: t('↓ baja'), deload: t('↓ descarga'), break: t('↺ vuelta'), start: t('≈ estimada') }[k] || '');

/** Objetivo del plan en una línea; las notas de técnica solo aparecen al tocar. */
function targetHTML(tg, timed) {
  if (!tg) return '';
  const line = `${ic('target')} <span dir="ltr">${tg.sets}×${esc(tg.reps)}${timed ? ' s' : ''}</span> · RIR ${esc(tg.rir)}${tg.deload ? ` · ${t('descarga')}` : ''}`;
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
    if (cand) hint = `<div class="link-hint">${t('¿Es {name}?', { name: `<b>${esc(exLabel(cand.name))}</b>` })} <button class="small" data-action="merge-into" data-from="${cand.id}" data-to="${exerciseId}">${t('Sí, unir')}</button></div>`;
  }
  const main = sg.weight != null ? `${fmtKg(sg.weight)} ${t('kg')} × ${suggestedReps(sg, 0)}`
    : sg.kind === 'calibrate' ? t('Calibra el peso') : sg.kind === 'bodyweight' ? `${t('Peso corporal')} × ${suggestedReps(sg, 0)}` : t('Apunta a {n} reps', { n: suggestedReps(sg, 0) });
  const tag = sg.kind === 'start' && sg.basis === 'marca' ? t('tus marcas') : kindLabel(sg.kind);
  return `<details class="suggest ${sg.kind}"><summary><b>${ic('bulb')} ${main}</b>${tag ? `<span class="kind">${tag}</span>` : ''}</summary>${sg.lastText ? `<small>${t('Última vez:')} ${esc(sg.lastText)}</small>` : ''}<small>${esc(sg.note)}</small></details>${hint}`;
}

/** Estado vacío: icono, qué pasa, qué hacer y un botón de acción. */
const emptyState = (icon, title, text, actions = '') => `<div class="empty">${ic(icon)}<h3>${title}</h3>${text ? `<p>${text}</p>` : ''}${actions ? `<div class="row">${actions}</div>` : ''}</div>`;

/** Hoy + esta semana y la próxima: qué toca, qué hiciste y qué falta. */
const calWeeks = (weeks = 2) => buildWeeks({ now: Date.now(), routines: state.routines, workouts: state.workouts, moves: state.moves, extras: state.extras || [], weeks });
/** Semanas que muestra el calendario: de esta hasta el final del mesociclo en curso (mínimo dos). */
function calSpan() {
  const wi = state.plan?.startDate ? weekInfo(state.plan) : null;
  const meso = wi && state.plan.mesocycles[wi.meso];
  return meso ? Math.max(2, Math.min(16, meso.weeks - wi.weekInMeso + 1)) : 2;
}
const calCell = (iso) => calWeeks(calSpan()).flatMap((w) => w.days).find((d) => d.iso === iso);
const dayLabel = (d) => `${dayShort(d.weekday)} ${d.date.getDate()}`;

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
    <b>${t('Pendiente esta semana')}</b>
    ${missed.map((d) => `<div class="row between pend"><span>${esc(rName(d.routine.name))} <span class="muted">· ${dayLabel(d)}</span></span><span class="row"><button class="small" data-action="cal-move" data-iso="${d.iso}">${t('Reprogramar')}</button><button class="small ghost" data-action="cal-skip" data-iso="${d.iso}">${t('Saltar')}</button></span></div>`).join('')}
    ${partial.map((d) => `<div class="row between pend"><span>${esc(rName(d.routine.name))} <span class="muted">· ${t('faltó {n}', { n: d.workout.skipped.length })}</span></span><button class="small" data-action="start-rest" data-id="${d.workout.id}">${t('Hacer lo que falta')}</button></div>`).join('')}
    ${review ? `<button class="small block" data-action="week-review">${ic('coach')} ${t('Revisar la semana con IA')}</button>` : ''}
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
      entry.adjSets = (entry.adjSets || 0) + x.sets;
      entry.adj = 'sets';
    } else {
      let ex = matchExercise(canonicalExercise(x.exercise), state.exercises)?.exercise;
      if (!ex) { ex = { id: uid(), name: canonicalExercise(x.exercise).trim(), muscle: x.muscle_group || 'Otros', type: x.exercise_type === 'time' ? 'time' : 'reps' }; state.exercises.push(ex); }
      const entry = newEntry(ex.id, { sets: x.sets, reps: x.reps, rir: x.rir, rest: x.rest_seconds, notes: x.reason, startLoad: x.start_load_kg || 0, startBasis: 'estimado' });
      entry.adj = 'new';
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
  const row = (o) => `<label><input type="radio" name="to" value="${o.iso}" required><span>${t(o.weekday)} ${o.date.getDate()}${o.iso === today ? ` · ${t('hoy')}` : ''} <span class="muted">· ${o.swapWith ? t('intercambiar con {name}', { name: esc(rName(o.swapWith.name)) }) : t('libre')}</span></span></label>`;
  const a = opts.filter((o) => o.iso <= endWeek), b = opts.filter((o) => o.iso > endWeek);
  openDialog(`
    <h2>${t('Mover {name}', { name: esc(rName(cell.routine.name)) })}</h2>
    <div class="pick-list">
      ${a.length ? `<small class="muted">${t('Esta semana')}</small>${a.map(row).join('')}` : ''}
      ${b.length ? `<small class="muted">${t('Próxima semana')}</small>${b.map(row).join('')}` : ''}
    </div>
    ${dialogButtons(t('Mover'))}`,
  (fd) => {
    const to = fd.get('to');
    if (!to) return false;
    setMove(state, cell, to, calCell);
    commit();
    const dest = calCell(to);
    toast(t('Movida al {day}', { day: dest ? dayLabel(dest) : to }));
  });
}

/* ---------- hora de las sesiones y Google Calendar ---------- */
// state.weekTimes: horario fijo por día de la semana → { days: { Martes: '07:30', … }, minutes, gcal }.
// state.schedule: [{ iso, name, time, minutes, gcal, eventId, auto, off }] — la hora de cada sesión concreta.
//   auto: viene del horario semanal (cambia si cambias el horario); sin auto, la elegiste para ese día.
//   off: ese día no lleva hora aunque el horario semanal diga otra cosa.
// state.gcalQueue: cambios pendientes de llevar a Google Calendar ({ op: 'upsert', iso } | { op: 'delete', eventId }).

const scheduleAt = (iso) => (state.schedule || []).find((x) => x.iso === iso) || null;
/** Hora visible de un día (sin las marcadas como "sin hora"). */
const timeAt = (iso) => { const x = scheduleAt(iso); return x && !x.off ? x : null; };
const pad2 = (n) => String(n).padStart(2, '0');
const fmtMinutes = (m) => (m < 60 ? t('{n} min', { n: m }) : m % 60 ? t('{h} h {n} min', { h: Math.floor(m / 60), n: m % 60 }) : t('{h} h', { h: m / 60 }));
const DURS = [30, 45, 60, 75, 90, 120];
const MINS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
/** Semanas hacia delante que se rellenan con el horario semanal: las del calendario, y al menos cuatro. */
const scheduleSpan = () => Math.max(4, calSpan());

/** Resumen de la sesión para las notas del evento: un ejercicio por línea con series, reps, RIR y carga. */
function sessionLines(cell) {
  const r = cell.routine;
  const deload = !!(r.fromPlan && planWeekLabel(cell.date.getTime())?.deload);
  const lines = r.exerciseIds.filter(exById).map((id) => {
    const tg = r.targets?.[id];
    const timed = isTimed(id);
    let kg = 0;
    try { kg = num(newEntry(id, tg, { deload }).sets[0]?.w); } catch (_) { /* sin sugerencia */ }
    const sets = tg ? (deload ? Math.max(1, Math.ceil(tg.sets / 2)) : tg.sets) : 0;
    const parts = [tg ? `${sets}×${tg.reps}${timed ? ' s' : ''}` : '', tg?.rir !== undefined && tg?.rir !== '' ? `RIR ${tg.rir}` : '', kg ? `${fmtKg(kg)} ${t('kg')}` : ''].filter(Boolean);
    return `${exDisp(id)}${parts.length ? ` — ${parts.join(' · ')}` : ''}`;
  });
  adjustmentsFor(state, r.name, cell.date.getTime()).forEach((x) => lines.push(`+ ${x.kind === 'add_sets' ? tn(x.sets, '{n} serie de {name}', '{n} series de {name}', { name: exLabel(x.exercise) }) : `${exLabel(x.exercise)} ${x.sets}×${x.reps}`}`));
  return { lines, deload };
}

function eventFor(entry, days) {
  const cell = days.find((d) => d.iso === entry.iso);
  if (!cell?.routine) return null;
  const { lines, deload } = sessionLines(cell);
  const wl = planWeekLabel(cell.date.getTime());
  const note = [wl?.text, deload ? t('Semana de descarga') : ''].filter(Boolean).join(' · ');
  return buildEvent({
    iso: entry.iso, time: entry.time, minutes: entry.minutes, title: `🏋️ ${rName(cell.routine.name)}`, lines, note,
    appUrl: location.origin + location.pathname, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function queueCal(op) {
  if (op.op === 'delete') {
    if (!op.eventId) return;
    state.gcalQueue = state.gcalQueue.filter((x) => !(x.op === 'delete' && x.eventId === op.eventId));
  } else if (state.gcalQueue.some((x) => x.op === 'upsert' && x.iso === op.iso)) return;
  state.gcalQueue.push(op);
}

/** El evento de una sesión deja de existir (se quita la hora, se desmarca el calendario o la sesión desaparece). */
function dropEvent(x) {
  state.gcalQueue = state.gcalQueue.filter((q) => !(q.op === 'upsert' && q.iso === x.iso));
  queueCal({ op: 'delete', eventId: x.eventId });
  delete x.eventId;
}
/** La sesión tiene hora nueva o ha cambiado: crear o actualizar su evento (o quitarlo si no va al calendario). */
const syncEvent = (x) => (x.gcal && !x.off ? queueCal({ op: 'upsert', iso: x.iso }) : dropEvent(x));

/**
 * Mantiene las horas al día:
 * - una sesión con hora que cambió de día (movida, intercambiada o de vuelta a su día) se lleva su hora y su evento;
 *   si ya no está en el calendario, el evento se borra;
 * - las sesiones futuras sin hora toman la de su día en el horario semanal.
 */
function reconcileSchedule() {
  const wt = state.weekTimes;
  const hasWeek = wt && Object.keys(wt.days || {}).length;
  if (!state.schedule?.length && !hasWeek) return;
  const today = isoLocal(Date.now());
  // Las horas de hace más de un mes ya no hacen falta (los eventos se quedan en el calendario).
  const old = isoLocal(Date.now() - 30 * 864e5);
  if (state.schedule.some((x) => x.iso < old)) state.schedule = state.schedule.filter((x) => x.iso >= old);
  const days = calWeeks(scheduleSpan()).flatMap((w) => w.days);
  const last = days[days.length - 1].iso;

  const stale = state.schedule.filter((x) => x.iso >= today && x.iso <= last && days.find((d) => d.iso === x.iso)?.routine?.name !== x.name);
  if (stale.length) {
    const taken = new Set(state.schedule.filter((x) => !stale.includes(x)).map((x) => x.iso));
    const week = (iso) => isoLocal(mondayOf(new Date(`${iso}T12:00:00`)));
    for (const x of stale) {
      if (x.off) { state.schedule = state.schedule.filter((y) => y !== x); continue; }
      const free = days.filter((d) => d.routine?.name === x.name && !d.workout && d.iso >= today && !taken.has(d.iso));
      const dest = free.find((d) => d.movedFrom === x.iso) || free.find((d) => week(d.iso) === week(x.iso));
      if (dest) { x.iso = dest.iso; x.auto = false; taken.add(dest.iso); if (x.eventId || x.gcal) syncEvent(x); }
      else { dropEvent(x); state.schedule = state.schedule.filter((y) => y !== x); }
    }
  }

  if (!hasWeek) return;
  for (const d of days) {
    const time = wt.days[d.weekday];
    if (!time || !d.routine || d.workout || d.iso < today || scheduleAt(d.iso)) continue;
    const x = { iso: d.iso, name: d.routine.name, time, minutes: wt.minutes || 60, gcal: !!wt.gcal, auto: true };
    state.schedule.push(x);
    if (x.gcal) queueCal({ op: 'upsert', iso: x.iso });
  }
}

let calFlushing = false;
/** Lleva a Google Calendar los cambios pendientes. Sin `interactive`, solo si ya hay un permiso vigente. */
async function flushCalendar(interactive = false) {
  if (calFlushing || !state.gcalQueue?.length || !cloud.currentUser()) return;
  calFlushing = true;
  let done = 0;
  try {
    const token = await cloud.calendarToken({ interactive });
    if (!token) return;
    const days = calWeeks(scheduleSpan()).flatMap((w) => w.days);
    while (state.gcalQueue.length) {
      const op = state.gcalQueue[0];
      if (op.op === 'delete') await deleteEvent(token, op.eventId);
      else {
        const entry = timeAt(op.iso);
        const ev = entry?.gcal && eventFor(entry, days);
        if (ev) {
          const id = eventIdFor(entry.iso);
          // Si la sesión cambió de día, su evento anterior se borra.
          if (entry.eventId && entry.eventId !== id) await deleteEvent(token, entry.eventId);
          entry.eventId = (await upsertEvent(token, id, ev)).id;
        }
      }
      state.gcalQueue.shift();
      done++;
      if (done % 10 === 0) storeLocal();
    }
    save();
    if (interactive) toast(t('Calendario de Google actualizado'));
  } catch (e) {
    console.error(e);
    if (done) save();
    if (e.status === 401 || e.status === 403) cloud.dropCalendarToken();
    if (interactive) toast(calError(e));
  } finally {
    calFlushing = false;
    render();
  }
}

function calError(e) {
  if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return t('No se dio permiso para el calendario');
  if (e.code === 'auth/popup-blocked') return t('El navegador bloqueó la ventana de Google: permite las ventanas emergentes e inténtalo de nuevo');
  if (e.code === 'auth/user-mismatch') return t('Elige la misma cuenta de Google con la que entraste en Gymonkey');
  if (e.status === 403) return t('Google no dio acceso al calendario: revisa que la API de Calendar esté activada (SETUP.md)');
  return t('No se pudo actualizar el calendario: {msg}', { msg: e.message });
}

/** Selectores de hora (HH y MM, de 5 en 5). `empty`: añade la opción "sin hora". */
function timeSelects(prefix, time, { empty = false, label = '' } = {}) {
  const hh = time ? time.slice(0, 2) : '';
  const mm = time && MINS.includes(time.slice(3)) ? time.slice(3) : '00';
  return `<span class="time-sel">
    <select name="${prefix}hh" aria-label="${esc(label ? `${label} · ${t('Hora')}` : t('Hora'))}">${empty ? `<option value="" ${hh ? '' : 'selected'}>—</option>` : ''}${Array.from({ length: 24 }, (_, h) => `<option value="${pad2(h)}" ${pad2(h) === hh ? 'selected' : ''}>${pad2(h)}</option>`).join('')}</select>
    <b>:</b>
    <select name="${prefix}mm" aria-label="${esc(label ? `${label} · ${t('Minutos')}` : t('Minutos'))}">${MINS.map((m) => `<option value="${m}" ${m === mm ? 'selected' : ''}>${m}</option>`).join('')}</select>
  </span>`;
}
const readTime = (fd, prefix) => (fd.get(`${prefix}hh`) ? `${fd.get(`${prefix}hh`)}:${fd.get(`${prefix}mm`) || '00'}` : '');
const durSelect = (minutes) => `<select name="minutes">${DURS.map((m) => `<option value="${m}" ${m === minutes ? 'selected' : ''}>${fmtMinutes(m)}</option>`).join('')}</select>`;
const gcalOption = (checked) => {
  const signed = !!cloud.currentUser();
  return `<label class="gcal-opt${signed ? '' : ' off'}">
      <input type="checkbox" name="gcal" ${checked && signed ? 'checked' : ''} ${signed ? '' : 'disabled'}>
      <span><b>${ic('calendar')} ${t('Añadir a mi Google Calendar')}</b>
      <small>${signed ? t('El evento lleva en las notas los ejercicios, series, repeticiones, RIR y carga de la sesión.') : t('Inicia sesión con Google para añadirla a tu calendario.')}</small></span>
    </label>`;
};

/** Días de la semana con sesiones del plan (con el nombre de la sesión). */
function planDays() {
  return WEEKDAYS.map((wd) => ({ wd, r: state.routines.find((r) => r.fromPlan && r.weekday === wd) })).filter((x) => x.r);
}

/** Horario semanal: la hora de cada día de entreno, que rellena todas las sesiones futuras. */
function weekTimesDialog() {
  const wt = state.weekTimes || { days: {}, minutes: 60, gcal: true };
  const rows = planDays();
  if (!rows.length) { toast(t('Primero necesitas un plan con días de entreno')); return; }
  openDialog(`
    <h2>${ic('clock')} ${t('Horario semanal')}</h2>
    <p class="muted" style="font-size:var(--fs-sm)">${t('Elige a qué hora entrenas cada día. Se aplica a todas las sesiones que vienen; un día concreto lo puedes cambiar tocándolo en el calendario.')}</p>
    <div class="week-times">
      ${rows.map(({ wd, r }, i) => `<div class="wt-row"><span><b>${t(wd)}</b><small class="muted">${esc(rName(r.name))}</small></span>${timeSelects(`d${i}`, wt.days[wd] || '', { empty: true, label: t(wd) })}</div>`).join('')}
    </div>
    <label class="field" style="margin-top:12px">${t('Duración')}${durSelect(wt.minutes || 60)}</label>
    ${gcalOption(wt.gcal !== false)}
    ${dialogButtons(t('Guardar'))}`,
  (fd) => {
    const next = { days: {}, minutes: Number(fd.get('minutes')) || 60, gcal: fd.has('gcal') };
    rows.forEach(({ wd }, i) => { const tm = readTime(fd, `d${i}`); if (tm) next.days[wd] = tm; });
    state.weekTimes = next;
    const today = isoLocal(Date.now());
    // Las horas que venían del horario anterior se rehacen con el nuevo; las elegidas a mano se respetan.
    for (const x of [...state.schedule]) {
      if (!x.auto || x.iso < today) continue;
      const wd = WEEKDAYS[(new Date(`${x.iso}T12:00:00`).getDay() + 6) % 7];
      const tm = next.days[wd];
      if (!tm) { dropEvent(x); state.schedule = state.schedule.filter((y) => y !== x); continue; }
      const changed = x.time !== tm || x.minutes !== next.minutes || x.gcal !== next.gcal;
      Object.assign(x, { time: tm, minutes: next.minutes, gcal: next.gcal });
      if (changed) syncEvent(x);
    }
    reconcileSchedule();
    save(); render();
    // Se pide el permiso ahora, mientras el toque del botón aún permite abrir la ventana de Google.
    flushCalendar(true);
    const n = Object.keys(next.days).length;
    toast(n ? tn(n, 'Horario guardado para {n} día', 'Horario guardado para {n} días') : t('Horario semanal quitado'));
  });
}

/** La hora de una sesión concreta (cambia solo ese día). */
function scheduleDialog(cell) {
  const cur = timeAt(cell.iso);
  const wt = state.weekTimes;
  const time = cur?.time || wt?.days?.[cell.weekday] || (state.schedule || []).reduce((a, x) => (!x.off && (!a || x.iso > a.iso) ? x : a), null)?.time || '19:00';
  const minutes = cur?.minutes || wt?.minutes || 60;
  const gcal = cur ? !!cur.gcal : wt ? wt.gcal !== false : true;
  openDialog(`
    <h2>${ic('clock')} ${esc(rName(cell.routine.name))} · ${dayLabel(cell)}</h2>
    <div class="row" style="margin-top:12px;align-items:flex-end;flex-wrap:wrap">
      <label class="field">${t('Hora')}${timeSelects('', time)}</label>
      <label class="field" style="flex:1">${t('Duración')}${durSelect(minutes)}</label>
    </div>
    ${gcalOption(gcal)}
    <div class="stack" style="margin-top:12px">
      <button class="block primary" value="ok">${t('Guardar')}</button>
      ${cur ? `<button class="block ghost danger" value="remove" formnovalidate>${t('Quitar la hora de este día')}</button>` : ''}
      <button class="block ghost" value="week" formnovalidate>${t('Horario semanal…')}</button>
      <button class="block ghost" value="cancel" formnovalidate>${t('Cancelar')}</button>
    </div>`,
  (fd, _f, value) => {
    if (value === 'week') { weekTimesDialog(); return; }
    if (value === 'remove') {
      dropEvent(cur);
      // Si el horario semanal tiene hora ese día, se marca "sin hora" para que no vuelva a rellenarse.
      if (wt?.days?.[cell.weekday]) Object.assign(cur, { off: true, auto: false });
      else state.schedule = state.schedule.filter((x) => x !== cur);
      save(); render(); flushCalendar(true);
      toast(t('Hora quitada'));
      return;
    }
    const tm = readTime(fd, '');
    if (!tm) return false;
    let entry = scheduleAt(cell.iso);
    if (!entry) { entry = { iso: cell.iso, name: cell.routine.name }; state.schedule.push(entry); }
    Object.assign(entry, { name: cell.routine.name, time: tm, minutes: Number(fd.get('minutes')) || 60, gcal: fd.has('gcal'), auto: false, off: false });
    syncEvent(entry);
    save(); render();
    flushCalendar(true);
    toast(t('Sesión a las {time}', { time: tm }));
  });
}

/* ---------- sesiones extra (fuera del plan) ---------- */
// state.extras: [{ id, iso, name, exerciseIds, targets, extra: true }] — una sesión en un día sin sesión del plan.

const focusLabel = (f) => ({ gap: t('Lo que menos has trabajado esta semana'), torso: t('Torso'), pierna: t('Pierna'), full: t('Cuerpo completo') }[f]);
const targetText = (id, tg) => (tg ? `${tg.sets}×${tg.reps}${isTimed(id) ? ' s' : ''}${tg.rir !== undefined && tg.rir !== '' ? ` · RIR ${tg.rir}` : ''}` : '');

/** Objetivo de un ejercicio elegido a mano: el del plan si está en él; si no, uno estándar. */
function targetFor(id) {
  for (const r of state.routines) if (r.targets?.[id]) return { ...r.targets[id] };
  return isTimed(id) ? { sets: 3, reps: '30-45', rir: 2 } : { sets: 3, reps: '8-12', rir: 2 };
}

/** Nueva sesión: elegir el día (hoy o uno libre de las próximas dos semanas) y qué tipo de sesión. */
function newSessionDialog(iso) {
  const today = isoLocal(Date.now());
  const days = freeDays(calWeeks(Math.max(3, calSpan())), today, 14);
  if (!days.length) { toast(t('No hay días libres en las próximas dos semanas')); return; }
  const sel = days.some((d) => d.iso === iso) ? iso : days[0].iso;
  const plan = state.routines.filter((r) => r.fromPlan && r.exerciseIds.some(exById));
  const radio = (value, label, sub = '', checked = false) => `<label><input type="radio" name="kind" value="${value}" ${checked ? 'checked' : ''}><span>${label}${sub ? ` <span class="muted">· ${sub}</span>` : ''}</span></label>`;
  openDialog(`
    <h2>${t('Nueva sesión')}</h2>
    <label class="field">${t('Día')}<select name="day">${days.map((d) => `<option value="${d.iso}" ${d.iso === sel ? 'selected' : ''}>${t(d.weekday)} ${d.date.getDate()}${d.iso === today ? ` · ${t('hoy')}` : ''}</option>`).join('')}</select></label>
    <p class="muted" style="margin-top:12px;font-size:var(--fs-sm)">${t('¿Qué quieres entrenar? Te propongo los ejercicios y los puedes ajustar.')}</p>
    <div class="pick-list">
      <small class="muted">${t('Sugerida')}</small>
      ${radio('gap', focusLabel('gap'), t('según tu plan y lo que ya hiciste'), true)}
      ${radio('torso', focusLabel('torso'))}
      ${radio('pierna', focusLabel('pierna'))}
      ${radio('full', focusLabel('full'))}
      ${plan.length ? `<small class="muted">${t('Repetir una sesión de tu plan')}</small>${plan.map((r) => radio(`r:${r.id}`, esc(rName(r.name)), tn(r.exerciseIds.filter(exById).length, '{n} ejercicio', '{n} ejercicios'))).join('')}` : ''}
      <small class="muted">${t('A tu manera')}</small>
      ${radio('pick', t('Elijo yo los ejercicios'))}
      ${radio('empty', t('Vacía: añado los ejercicios sobre la marcha'), t('solo hoy'))}
    </div>
    ${dialogButtons(t('Siguiente'))}`,
  (fd) => {
    const day = String(fd.get('day'));
    const kind = String(fd.get('kind') || 'gap');
    if (kind === 'empty') {
      if (day !== today) { toast(t('Una sesión vacía solo se puede empezar hoy')); return false; }
      actions.start(); tab = 'train'; commit();
      return;
    }
    if (kind === 'pick') {
      pickExercisesDialog({
        title: t('Elige los ejercicios'), confirm: t('Siguiente'),
        onDone: (ids) => { if (ids.length) sessionPreview(day, `${t('Sesión')} (${t('extra')})`, ids.map((id) => ({ exerciseId: id, target: targetFor(id) }))); },
      });
      return;
    }
    if (kind.startsWith('r:')) {
      const r = state.routines.find((x) => x.id === kind.slice(2));
      if (!r) return false;
      sessionPreview(day, `${rName(r.name)} (${t('extra')})`, r.exerciseIds.filter(exById).map((id) => ({ exerciseId: id, target: r.targets?.[id] ? { ...r.targets[id] } : targetFor(id) })));
      return;
    }
    const items = suggestSession({ focus: kind, routines: state.routines, workouts: state.workouts, exercises: state.exercises, now: Date.now() });
    if (!items.length) { toast(t('No encontré ejercicios para sugerir: añade algunos en Rutinas')); return false; }
    sessionPreview(day, `${kind === 'gap' ? t('Complemento') : focusLabel(kind)} (${t('extra')})`, items, kind === 'gap');
  });
}

/** Ejercicios propuestos (se pueden desmarcar) y empezar ya o dejarla programada. */
function sessionPreview(iso, name, items, gap = false) {
  const today = isoLocal(Date.now());
  const cell = calCell(iso) || calWeeks(Math.max(3, calSpan())).flatMap((w) => w.days).find((d) => d.iso === iso);
  const muscles = [...new Set(items.map((x) => exById(x.exerciseId)?.muscle).filter(Boolean))].map(mLabel).join(' · ');
  openDialog(`
    <h2>${esc(name)}</h2>
    <p class="muted">${cell ? `${t(cell.weekday)} ${cell.date.getDate()}${iso === today ? ` · ${t('hoy')}` : ''}` : iso}${gap && muscles ? ` · ${t('Para completar: {m}', { m: esc(muscles) })}` : ''}</p>
    <div class="pick-list">
      ${items.map((x) => `<label><input type="checkbox" name="ex" value="${x.exerciseId}" checked><span>${esc(exDisp(x.exerciseId))} <span class="muted" dir="ltr">· ${esc(targetText(x.exerciseId, x.target))}</span></span></label>`).join('')}
    </div>
    <p class="muted" style="font-size:var(--fs-sm)">${t('Puedes añadir, quitar o reordenar ejercicios durante el entreno.')}</p>
    <div class="stack" style="margin-top:12px">
      ${iso === today ? `<button class="block primary" value="start">${t('Empezar ahora')}</button>` : ''}
      <button class="block ${iso === today ? '' : 'primary'}" value="plan">${ic('calendar')} ${iso === today ? t('Dejarla programada para hoy') : t('Programar')}</button>
      <button class="block ghost" value="cancel" formnovalidate>${t('Cancelar')}</button>
    </div>`,
  (fd, _f, value) => {
    const ids = fd.getAll('ex');
    if (!ids.length) { toast(t('Elige al menos un ejercicio')); return false; }
    const targets = {};
    items.forEach((x) => { if (ids.includes(x.exerciseId)) targets[x.exerciseId] = x.target; });
    const extra = { id: `x-${uid()}`, iso, name, exerciseIds: ids, targets, extra: true };
    state.extras.push(extra);
    if (value === 'start') { actions.start(extra.id); tab = 'train'; commit(); window.scrollTo(0, 0); return; }
    commit();
    toast(t('Sesión programada para el {day}', { day: cell ? dayLabel(cell) : iso }));
  });
}

/** Cambiar de día una sesión extra (su hora y su evento la acompañan). */
function moveExtraDialog(cell) {
  const today = isoLocal(Date.now());
  const days = freeDays(calWeeks(Math.max(3, calSpan())), today, 14);
  if (!days.length) { toast(t('No hay días libres en las próximas dos semanas')); return; }
  openDialog(`
    <h2>${t('Mover {name}', { name: esc(rName(cell.routine.name)) })}</h2>
    <div class="pick-list">${days.map((d) => `<label><input type="radio" name="to" value="${d.iso}" required><span>${t(d.weekday)} ${d.date.getDate()}${d.iso === today ? ` · ${t('hoy')}` : ''}</span></label>`).join('')}</div>
    ${dialogButtons(t('Mover'))}`,
  (fd) => {
    const to = String(fd.get('to') || '');
    const x = state.extras.find((e) => e.id === cell.routine.id);
    if (!to || !x) return false;
    const sch = scheduleAt(x.iso);
    x.iso = to;
    if (sch) { sch.iso = to; sch.auto = false; if (sch.eventId || sch.gcal) syncEvent(sch); }
    commit();
    const dest = calCell(to);
    toast(t('Movida al {day}', { day: dest ? dayLabel(dest) : to }));
  });
}

function skipSession(cell) {
  ask(t('¿Saltar «{name}» ({day})? Seguirás con el plan sin recuperarla.', { name: rName(cell.routine.name), day: dayLabel(cell) }), t('Saltar'), () => { setMove(state, cell, null, calCell); commit(); });
}

/** Texto del botón del horario semanal: "Mar 07:30 · Jue 19:00" o la invitación a ponerlo. */
function weekTimesSummary() {
  const d = state.weekTimes?.days || {};
  const set = WEEKDAYS.filter((wd) => d[wd]);
  return set.length ? `${t('Horario')}: <span dir="ltr">${set.map((wd) => `${dayShort(wd)} ${d[wd]}`).join(' · ')}</span>` : t('Fijar horario semanal (y Google Calendar)');
}

function viewCalendar() {
  const weeks = calWeeks(calSpan());
  if (!weeks.some((w) => w.days.some((d) => d.routine))) return '';
  const today = weeks[0].days.find((d) => d.isToday);
  const n = (r) => r.exerciseIds.filter(exById).length;
  let hoy;
  if (today.routine && (today.status === 'planned')) {
    hoy = `<div class="card accent today-card"><div class="row between"><div><small class="muted">${t('Hoy')} · ${t(today.weekday)}${timeAt(today.iso) ? ` · ${timeAt(today.iso).time}` : ''}</small><h3>${esc(rName(today.routine.name))}</h3><span class="muted">${tn(n(today.routine), '{n} ejercicio', '{n} ejercicios')}</span></div><button class="primary" data-action="start" data-id="${today.routine.id}">${t('Empezar')}</button></div></div>`;
  } else if (today.status === 'done' || today.status === 'partial') {
    hoy = `<div class="card today-card"><div class="row between"><div><small class="muted">${t('Hoy')}</small><h3>${today.status === 'partial' ? '◐' : '✓'} ${esc(rName(today.routine.name))}</h3></div><button class="small" data-action="cal-day" data-iso="${today.iso}">${t('Ver')}</button></div></div>`;
  } else if (today.status === 'extra') {
    hoy = `<div class="card today-card"><small class="muted">${t('Hoy')}</small><h3>✓ ${esc(rName(today.extra.name))}</h3></div>`;
  } else {
    hoy = `<div class="card today-card"><b>${t('Hoy no toca entrenar')}</b></div>`;
  }
  const sym = { done: '✓', partial: '◐', missed: '–', planned: '', extra: '•', rest: '', moved: '↪', skipped: '⏭' };
  const cell = (d) => {
    const label = d.routine ? shortName(rName(d.routine.name)) : d.status === 'extra' ? shortName(rName(d.extra.name)) : d.status === 'moved' ? `${fwd()} ${Number(d.movedTo.slice(8))}` : d.status === 'skipped' ? t('saltada') : '';
    const click = d.routine || d.extra || d.status === 'moved' || d.status === 'skipped' || (d.status === 'rest' && !d.isPast);
    return `<button class="cal-day ${d.status} ${d.isToday ? 'today' : ''}" ${click ? `data-action="cal-day" data-iso="${d.iso}"` : 'disabled'} aria-label="${t(d.weekday)} ${d.date.getDate()}${label ? `, ${esc(label)}` : ''}">
      <small>${dayLetter(d.idx)}</small><b>${d.date.getDate()}</b><i${d.status === 'planned' && timeAt(d.iso) ? ' class="tm"' : ''}>${d.status === 'planned' && timeAt(d.iso) ? timeAt(d.iso).time : d.movedFrom && d.status === 'planned' ? '↪' : sym[d.status]}</i><em>${esc(label)}</em></button>`;
  };
  const grid = weeks.map((w, i) => {
    const lab = planWeekLabel(w.days[0].date.getTime());
    return `<div class="cal-head"><b>${i === 0 ? t('Esta semana') : i === 1 ? t('Próxima') : t('Semana del {date}', { date: w.days[0].date.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) })}</b><span class="muted">${lab ? esc(lab.text) : ''}</span>${lab?.deload ? `<span class="pill">${t('Descarga')}</span>` : ''}</div>
      <div class="cal-grid">${w.days.map(cell).join('')}</div>`;
  }).join('');
  const gq = state.gcalQueue?.length && cloud.currentUser() && !calFlushing
    ? `<div class="card row between"><span class="muted">${ic('calendar')} ${t('Hay cambios pendientes en tu Google Calendar')}</span><button class="small" data-action="gcal-sync">${t('Actualizar')}</button></div>` : '';
  return `${hoy}${pendingCard(weeks)}${gq}<div class="cal">${grid}</div>
    <button class="block cal-week-btn" data-action="week-times">${ic('clock')} ${weekTimesSummary()}</button>`;
}

function viewTrain() {
  const a = state.active;
  if (!a) {
    const cal = viewCalendar();
    const today = todayName();
    const order = (r) => (r.fromPlan ? WEEKDAYS.indexOf(r.weekday) : 99);
    const routineRows = [...state.routines].sort((x, y) => order(x) - order(y)).map((r) => `
      <button class="item ${r.fromPlan && r.weekday === today ? 'today' : ''}" data-action="start" data-id="${r.id}">
        <div class="row between"><h3>${esc(rName(r.name))}</h3><span class="pill">${r.fromPlan ? (r.weekday === today ? `${t('Hoy')} · ` : '') + esc(t(r.weekday)) : tn(r.exerciseIds.length, '{n} ejercicio', '{n} ejercicios')}</span></div>
        <div class="rlist">${r.exerciseIds.map((id) => esc(exDisp(id))).join(' · ') || t('Sin ejercicios')}</div>
      </button>`).join('');
    const routines = routineRows ? `<div class="list">${routineRows}</div>` : '';
    const weekAgo = Date.now() - 7 * 864e5;
    const thisWeek = state.workouts.filter((w) => w.start >= weekAgo).length;
    const missing = missingLoads().length;
    return `
      ${planTrainBanner()}
      ${missing ? loadsBanner(missing) : ''}
      ${cal}
      <div class="actions2">
        <button class="primary" data-action="new-session">+ ${t('Nueva sesión')}</button>
        <button data-action="voice-open">${ic('mic')} ${t('Dictar')}</button>
      </div>
      ${cal ? (routines ? `<details class="how"><summary>${t('Todas las rutinas')}</summary>${routines}</details>` : '') : (routines || emptyState('coach', t('Aún no tienes rutinas'), t('Crea tu plan con el coach y tus rutinas aparecerán aquí.'), `<button class="primary" data-action="go-plan">${t('Crear mi plan')}</button><button data-action="start">+ ${t('Entreno vacío')}</button>`))}
      ${state.workouts.length ? `<p class="statline"><b>${thisWeek}</b> ${t('esta semana')} · <b>${state.workouts.length}</b> ${t('entrenos')} · <b>${fmtKg(state.workouts.reduce((sum, w) => sum + workoutVolume(w), 0) / 1000)}</b> ${t('t')}</p>` : ''}`;
  }

  if (reorder) return viewReorder(a);

  const tm = a.timer;
  // La serie que toca ahora: la primera sin hacer de todo el entreno.
  let cur = null;
  a.entries.some((e, ei) => e.sets.some((s, si) => { if (!s.done) { cur = { ei, si }; return true; } return false; }));
  const entries = a.entries.map((e, ei) => {
    const g = e.group ? { next: nextInGroup(a, e.group), others: a.entries.filter((x) => x.group === e.group && x !== e) } : null;
    const prev = lastSetsFor(e.exerciseId);
    const timed = isTimed(e.exerciseId);
    const rows = e.sets.map((s, si) => {
      const running = tm?.kind === 'set' && tm.e === ei && tm.s === si;
      const isNext = g?.next && g.next.entry === e && g.next.si === si;
      return `
      <tr class="${s.done ? 'done' : ''} ${running ? 'running' : ''} ${isNext ? 'next' : ''} ${!g && !running && cur && cur.ei === ei && cur.si === si ? 'current' : ''}">
        <td>${si + 1}</td>
        <td class="prev">${prev[si] ? fmtSet(e.exerciseId, prev[si]) : '—'}</td>
        <td><input class="${s.sug && !s.done ? 'sug' : ''}" inputmode="decimal" dir="ltr" placeholder="${t('kg')}" value="${esc(s.w)}" data-field="w" data-e="${ei}" data-s="${si}" aria-label="${t('Peso serie {n}', { n: si + 1 })}"></td>
        <td><input class="${s.sug && !s.done ? 'sug' : ''}" inputmode="numeric" dir="ltr" placeholder="${e.target ? esc(e.target.reps) : timed ? t('seg') : t('reps')}" value="${esc(s.r)}" data-field="r" data-e="${ei}" data-s="${si}" aria-label="${timed ? t('Segundos serie {n}', { n: si + 1 }) : t('Repeticiones serie {n}', { n: si + 1 })}"></td>
        <td class="btns">
          <button class="icon play" data-action="${running ? 'finish-set' : 'start-set'}" data-e="${ei}" data-s="${si}" aria-label="${running ? t('Terminar serie {n}', { n: si + 1 }) : t('Cronometrar serie {n}', { n: si + 1 })}">${running ? '■' : '▶'}</button>
          <button class="icon check" data-action="toggle-set" data-e="${ei}" data-s="${si}" aria-label="${t('Completar serie {n}', { n: si + 1 })}">✓</button>
        </td>
      </tr>`;
    }).join('');
    const tg = e.target;
    return `
      <div class="card ${g ? 'grouped' : ''} ${e.sets.length && e.sets.every((x) => x.done) ? 'exdone' : ''}" ${g ? `style="--block:${blockColor(a.entries, e.group)}"` : ''}>
        <div class="row between">
          <h3>${esc(exDisp(e.exerciseId))}${e.adj ? ` <span class="pill">${esc(adjLabel(e))}</span>` : ''}</h3>
          <div class="row">
            <button class="ghost small" data-action="set-rest" data-e="${ei}" aria-label="${t('Cambiar descanso')}">${ic('clock')} ${fmtSecs(restForEntry(e))}</button>
            <button class="ghost danger" data-action="remove-entry" data-e="${ei}" aria-label="${t('Quitar ejercicio')}">✕</button>
          </div>
        </div>
        ${g ? `<div class="blockinfo">${ic('link')} <b>${blockLetter(a.entries, e.group)}</b> · ${g.next ? t('toca {name} · serie {n}', { name: `<b>${esc(exDisp(g.next.entry.exerciseId))}</b>`, n: g.next.si + 1 }) : t('bloque completo ✓')}</div>` : ''}
        ${targetHTML(tg, timed)}
        ${suggestHTML(e.suggest, e.exerciseId)}
        <table class="sets">
          <thead><tr><th>#</th><th>${t('Anterior')}</th><th>${t('Kg')}</th><th>${timed ? t('Seg') : t('Reps')}</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="row" style="margin-top:8px">
          <button class="block" data-action="add-set" data-e="${ei}">+ ${t('Serie')}</button>
          ${e.sets.length > 1 ? `<button data-action="remove-set" data-e="${ei}" aria-label="${t('Quitar última serie')}">−</button>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="card row between">
      <div>
        <h3>${esc(rName(a.name))}</h3>
        <span class="muted timer" id="elapsed">${fmtDuration(Date.now() - a.start)}</span>
      </div>
      <div class="row">
        ${a.entries.length > 1 ? `<button class="icon" data-action="reorder-start" aria-label="${t('Orden y bloques')}">${ic('reorder')}</button>` : ''}
        <button class="primary" data-action="finish">${t('Terminar')}</button>
      </div>
    </div>
    ${a.entries.some((e) => e.suggest?.kind === 'calibrate') ? loadsBanner(a.entries.filter((e) => e.suggest?.kind === 'calibrate').length) : ''}
    ${entries || emptyState('train', t('Añade tu primer ejercicio'), t('Elige de tu biblioteca o dicta lo que llevas hecho.'), '')}
    <div class="actions2">
      <button data-action="add-exercise">+ ${t('Ejercicio')}</button>
      <button data-action="voice-open-active">${ic('mic')} ${t('Dictar')}</button>
    </div>
    <button class="ghost danger small center" data-action="discard">${t('Descartar entreno')}</button>`;
}

function viewReorder(a) {
  const rows = a.entries.map((e, i) => {
    const lab = e.group ? blockLetter(a.entries, e.group) : '';
    const done = e.sets.filter((s) => s.done).length;
    return `
      <div class="rrow ${e.group ? 'grouped' : ''}" ${e.group ? `style="--block:${blockColor(a.entries, e.group)}"` : ''}>
        <button class="handle" data-handle aria-label="${t('Arrastrar para cambiar el orden')}">⠿</button>
        <div class="rname"><b>${esc(exDisp(e.exerciseId))}</b><small>${e.group ? `${ic('link')} ${t('Bloque {l}', { l: lab })} · ` : ''}${tn(e.sets.length, '{n} serie', '{n} series')}${done ? ` · ${t('{n} hechas', { n: done })}` : ''}</small></div>
        <button class="icon" data-action="move-up" data-e="${i}" aria-label="${t('Subir')}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="icon" data-action="move-down" data-e="${i}" aria-label="${t('Bajar')}" ${i === a.entries.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="icon" data-action="block-dialog" data-e="${i}" aria-label="${t('Alternar series con otros ejercicios')}">${ic('link')}</button>
      </div>`;
  }).join('');
  return `
    <div class="card row between">
      <h3>${t('Orden y bloques')}</h3>
      <button class="primary" data-action="reorder-done">${t('Listo')}</button>
    </div>
    <p class="muted hint">⠿ ${t('arrastra para ordenar')} · ${ic('link')} ${t('alterna series entre ejercicios')}</p>
    ${rows}`;
}

function viewRoutines() {
  const routines = state.routines.map((r) => `
    <div class="item">
      <div class="row between">
        <h3>${esc(rName(r.name))}</h3>
        <div class="row">
          <button class="ghost" data-action="edit-routine" data-id="${r.id}">${t('Editar')}</button>
          <button class="ghost danger" data-action="delete-routine" data-id="${r.id}" aria-label="${t('Borrar rutina')}">✕</button>
        </div>
      </div>
      <div class="rlist">${r.exerciseIds.map((id) => esc(exDisp(id))).join(' · ') || t('Sin ejercicios')}</div>
    </div>`).join('');

  const groups = {};
  state.exercises.forEach((e) => (groups[e.muscle] ||= []).push(e));
  const exercises = Object.keys(groups).sort((a, b) => mLabel(a).localeCompare(mLabel(b), getLang())).map((m) => `
    <section class="list">
      <h3 class="list-title">${esc(mLabel(m))}</h3>
      ${groups[m].sort((a, b) => exLabel(a.name).localeCompare(exLabel(b.name), getLang())).map((e) => `
        <div class="item row between">
          <button class="ghost link" data-action="edit-exercise" data-id="${e.id}">
            ${esc(exLabel(e.name))}${e.type === 'time' ? ` <span class="muted">· ${t('tiempo')}</span>` : ''}${e.rest == null ? '' : ` <span class="muted">· ${ic('clock')} ${fmtSecs(e.rest)}</span>`}
          </button>
          <button class="ghost danger" data-action="delete-exercise" data-id="${e.id}" aria-label="${t('Borrar {name}', { name: esc(exLabel(e.name)) })}">✕</button>
        </div>`).join('')}
    </section>`).join('');

  const dups = findDuplicates(state.exercises).slice(0, 3);
  const dupHTML = dups.length ? `
    <div class="card accent stack"><b>${t('¿Son el mismo ejercicio?')}</b>
      ${dups.map(([x, y]) => `<div class="row between"><span>${esc(exLabel(x.name))} ≈ ${esc(exLabel(y.name))}</span><button class="small" data-action="merge-pair" data-a="${x.id}" data-b="${y.id}">${t('Unir')}</button></div>`).join('')}
    </div>` : '';
  return `
    ${dupHTML}
    <div class="row between"><h2>${t('Mis rutinas')}</h2><button class="primary" data-action="new-routine">+ ${t('Nueva')}</button></div>
    ${routines ? `<div class="list">${routines}</div>` : emptyState('list', t('Sin rutinas.'), t('Una rutina es la lista de ejercicios de un día de entreno.'), `<button class="primary" data-action="new-routine">+ ${t('Nueva')}</button>`)}
    <div class="row between" style="margin-top:20px"><h2>${t('Ejercicios')}</h2><button data-action="new-exercise">+ ${t('Nuevo')}</button></div>
    ${exercises}
    <h2 style="margin-top:20px">${t('Datos')}</h2>
    <div class="row">
      <button class="block" data-action="export">${t('Exportar copia')}</button>
      <button class="block" data-action="import">${t('Importar')}</button>
    </div>`;
}

function viewHistory() {
  const buttons = `<button class="${state.workouts.length ? 'small' : 'primary'}" data-action="voice-open">${ic('mic')} ${t('Registrar')}</button>
    <button class="${state.workouts.length ? 'small' : ''}" data-action="import-open">${ic('import')} ${t('Importar')}</button>`;
  if (!state.workouts.length) {
    return emptyState('calendar', t('Sin entrenos todavía.'), t('Cuando termines un entreno, aparecerá aquí con sus series y sus cargas. También puedes dictar uno o importar tu historial.'), buttons);
  }
  return `<h2>${t('Historial')}</h2><div class="row wrap" style="margin-bottom:12px">${buttons}</div><div class="list">` + [...state.workouts].reverse().map((w) => `
    <div class="item">
      <div class="row between">
        <div><h3>${esc(rName(w.name))}${w.partial ? ` <span class="pill warn">${t('parcial')}</span>` : ''}</h3><span class="muted">${fmtDate(w.start)} · ${fmtDuration(w.end - w.start)} · ${fmtKg(workoutVolume(w))} ${t('kg')}</span></div>
        <div class="row">
          <button class="ghost" data-action="workout-edit" data-id="${w.id}" aria-label="${t('Editar entreno')}">${ic('edit')}</button>
          <button class="ghost danger" data-action="delete-workout" data-id="${w.id}" aria-label="${t('Borrar entreno')}">✕</button>
        </div>
      </div>
      ${historyTable(w)}
    </div>`).join('') + '</div>';
}

/** Valores de las series en columna: uno solo si todas coinciden ("10"); si no, en orden ("10 · 10 · 8"). */
const histVals = (vals) => (!vals.length ? '—' : vals.every((v) => v === vals[0]) ? vals[0] : vals.join(' · '));

/** Tabla de un entreno del historial: una fila por ejercicio con series, repeticiones, kilos y RIR. */
function historyTable(w) {
  const rows = w.entries.map((e) => {
    const done = e.sets.filter((s) => s.done);
    const timed = isTimed(e.exerciseId);
    const badge = e.group ? ` <span class="pill">${ic('link')}${blockLetter(w.entries, e.group)}</span>` : '';
    const reps = done.map((s) => (timed ? fmtSecs(num(s.r)) : String(num(s.r))));
    const kg = done.some((s) => num(s.w)) ? done.map((s) => fmtKg(num(s.w))) : [];
    const rir = e.target?.rir ?? e.rir;
    return `<tr${done.length ? '' : ' class="none"'}>
      <th scope="row">${esc(exDisp(e.exerciseId))}${badge}</th>
      <td>${done.length || '—'}</td>
      <td dir="ltr">${histVals(reps)}</td>
      <td dir="ltr">${kg.length ? histVals(kg) : done.length ? `<span class="muted">${t('corp.')}</span>` : '—'}</td>
      <td>${rir !== undefined && rir !== null && rir !== '' ? esc(String(rir)) : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class="scroll-x" tabindex="0"><table class="hist-table">
    <thead><tr><th scope="col">${t('Ejercicio')}</th><th scope="col">${t('Series')}</th><th scope="col">${t('Reps')}</th><th scope="col">${t('Kg')}</th><th scope="col">RIR</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
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
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Evolución')}">
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
    return emptyState('trend', t('Aún no hay progreso que mostrar'), t('Completa algunas series y aquí verás tu progreso.'), `<button class="primary" data-action="go-train">${t('Ir a Entrenar')}</button>`);
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
    <h2>${t('Progreso')}</h2>
    <select data-action="pick-progress" aria-label="${t('Ejercicio')}">
      ${used.map((e) => `<option value="${e.id}" ${e.id === progressExerciseId ? 'selected' : ''}>${esc(exLabel(e.name))}</option>`).join('')}
    </select>
    <div class="stats" style="margin-top:12px">
      <div class="card stat"><b>${timed ? fmtSecs(best) : fmtKg(best)}</b><span class="muted">${timed ? t('mejor tiempo') : t('1RM est. (kg)')}</span></div>
      <div class="card stat"><b>${timed ? pts.length : fmtKg(maxW)}</b><span class="muted">${timed ? t('sesiones') : t('peso máx.')}</span></div>
      <div class="card stat"><b>${fmtDelta(delta)}</b><span class="muted">${t('cambio')}</span></div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:8px">${timed ? t('Mejor tiempo por sesión') : t('1RM estimado')}</h3>
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

const dialogButtons = (ok) => `<div class="row" style="margin-top:14px"><button class="block" value="cancel" formnovalidate>${t('Cancelar')}</button><button class="block primary" value="ok">${esc(ok)}</button></div>`;

function pickExercisesDialog({ title, selected = [], confirm, nameField, onDone }) {
  const list = [...state.exercises].sort((a, b) => mLabel(a.muscle).localeCompare(mLabel(b.muscle), getLang()) || exLabel(a.name).localeCompare(exLabel(b.name), getLang()));
  openDialog(`
    <h2>${esc(title)}</h2>
    ${nameField !== undefined ? `<input name="name" placeholder="${t('Nombre de la rutina')}" value="${esc(nameField)}" required>` : ''}
    <div class="pick-list">
      ${list.map((e) => `<label><input type="checkbox" name="ex" value="${e.id}" ${selected.includes(e.id) ? 'checked' : ''}> ${esc(exLabel(e.name))} <span class="muted">· ${esc(mLabel(e.muscle))}</span></label>`).join('')}
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
    <h2>${ex ? t('Editar ejercicio') : t('Nuevo ejercicio')}</h2>
    <div class="stack">
      <label class="field">${t('Nombre')}<input name="name" placeholder="${t('p. ej. Hip thrust')}" value="${esc(ex ? exLabel(ex.name) : '')}" required></label>
      <label class="field">${t('Grupo muscular')}<input name="muscle" list="muscles" value="${esc(ex ? mLabel(ex.muscle) : '')}" required></label>
      <datalist id="muscles">${muscles.map((m) => `<option value="${esc(mLabel(m))}">`).join('')}</datalist>
      <label class="field">${t('Se mide por')}
        <select name="type">
          <option value="reps" ${ex?.type !== 'time' ? 'selected' : ''}>${t('Repeticiones')}</option>
          <option value="time" ${ex?.type === 'time' ? 'selected' : ''}>${t('Tiempo (segundos)')}</option>
        </select>
      </label>
      <label class="field">${t('Descanso entre series')}
        <select name="rest">
          <option value="">${t('Predeterminado ({time})', { time: fmtSecs(state.settings.rest) })}</option>
          ${restOptions(ex?.rest)}
        </select>
      </label>
    </div>
    ${dialogButtons(ex ? t('Guardar') : t('Crear'))}
    ${ex ? `<button class="block ghost" value="merge" formnovalidate style="margin-top:8px">⇄ ${t('Unir con otro ejercicio…')}</button>` : ''}`,
  (fd, _f, value) => {
    if (value === 'merge') { mergeDialog(ex); return; }
    const data = {
      name: canonicalExercise(fd.get('name')),
      muscle: muscleKey(fd.get('muscle').trim()),
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

const loadsBanner = (n) => `<div class="card loadsb"><div class="row between"><span><b>${t('Faltan cargas de partida')}</b> <span class="muted">· ${tn(n, '{n} ejercicio', '{n} ejercicios')}</span></span><button class="small primary" data-action="loads-estimate">${t('Estimar con IA')}</button></div></div>`;

function confirmMerge(fromId, toId) {
  const f = exById(fromId), dest = exById(toId);
  if (!f || !dest) return;
  ask(t('¿Unir «{a}» con «{b}»? Todo el historial de «{a}» pasará a «{b}».', { a: exLabel(f.name), b: exLabel(dest.name) }), t('Unir'), () => {
    mergeExercises(state, fromId, toId, { newEntry: (id, tg) => newEntry(id, tg) });
    toast(t('Ejercicios unidos'));
    commit();
  });
}

function mergeDialog(ex) {
  const others = state.exercises.filter((e) => e.id !== ex.id).sort((a, b) => exLabel(a.name).localeCompare(exLabel(b.name), getLang()));
  openDialog(`
    <h2>${t('Unir «{name}» con…', { name: esc(exLabel(ex.name)) })}</h2>
    <div class="pick-list">${others.map((o) => `<label><input type="radio" name="into" value="${o.id}" required> ${esc(exLabel(o.name))} <span class="muted">· ${esc(mLabel(o.muscle))}</span></label>`).join('')}</div>
    ${dialogButtons(t('Unir'))}`,
  (fd) => { if (fd.get('into')) confirmMerge(ex.id, fd.get('into')); });
}

const actions = {
  start(id) {
    const r = state.routines.find((x) => x.id === id) || (state.extras || []).find((x) => x.id === id);
    state.active = {
      name: r ? r.name : T('Entreno libre'),
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
      name: `${w.name} · ${t('lo que faltó')}`,
      routineId: w.routineId,
      remainderOf: w.id,
      start: Date.now(),
      entries: w.skipped.filter(exById).map((exId) => newEntry(exId, r?.targets?.[exId], { deload: !!(r?.fromPlan && weekInfo(state.plan)?.wp?.deload) })),
      timer: null,
    };
  },
  'add-exercise'() {
    pickExercisesDialog({
      title: t('Añadir ejercicios'), confirm: t('Añadir'),
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
  'go-train'() { tab = 'train'; },
  'go-plan'() { tab = 'plan'; },
  'reorder-start'() { reorder = true; },
  'reorder-done'() { reorder = false; },
  'move-up'(_, el) { moveEntry(+el.dataset.e, +el.dataset.e - 1); return false; },
  'move-down'(_, el) { moveEntry(+el.dataset.e, +el.dataset.e + 1); return false; },
  'block-dialog'(_, el) {
    const a = state.active, i = +el.dataset.e, me = a.entries[i];
    const others = a.entries.map((e, k) => ({ e, k })).filter(({ k }) => k !== i);
    if (!others.length) { toast(t('Añade otro ejercicio para poder alternar')); return false; }
    openDialog(`
      <h2>${t('Alternar {name} con…', { name: esc(exDisp(me.exerciseId)) })}</h2>
      <div class="pick-list">${others.map(({ e, k }) => `<label><input type="checkbox" name="with" value="${k}" ${me.group && e.group === me.group ? 'checked' : ''}> ${esc(exDisp(e.exerciseId))}</label>`).join('')}</div>
      ${dialogButtons(t('Guardar'))}`,
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
      <h2>${t('Descanso')} · ${esc(exLabel(ex.name))}</h2>
      <select name="rest">
        <option value="">${t('Predeterminado ({time})', { time: fmtSecs(state.settings.rest) })}</option>
        ${restOptions(ex.rest)}
      </select>
      ${dialogButtons(t('Guardar'))}`,
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
      <h2>${t('Terminar entreno')}</h2>
      ${logged ? `<p class="finish-sum">${t('{a} series hechas · {b} de {c} ejercicios', { a: `<b>${logged}</b>`, b: `<b>${exDone}</b>`, c: `<b>${a.entries.length}</b>` })}</p>` : `<p class="muted">${t('Aún no hay series registradas.')}</p>`}
      ${sm.typed ? `<label class="switch"><input type="checkbox" name="typed" checked><span><b>${t('{n} con datos sin marcar ✓', { n: sm.typed })}</b><small>${t('Guardarlas como hechas')}</small></span></label>` : ''}
      ${sm.sugs ? `<label class="switch"><input type="checkbox" name="sugs"><span><b>${t('{n} sugeridas sin confirmar', { n: sm.sugs })}</b><small>${t('Marca si las hiciste tal como estaban')}</small></span></label>` : ''}
      ${sm.skipped.length && logged ? `<p class="muted">${t('Sin hacer:')} ${esc(sm.skipped.map((id) => exDisp(id)).join(', '))}</p>` : ''}
      <div class="stack" style="margin-top:14px">
        ${sm.done + sm.typed + sm.sugs ? `<button class="block primary" value="save">${t('Guardar entreno')}</button>` : ''}
        <button class="block" value="cancel" formnovalidate>${t('Seguir entrenando')}</button>
        <button class="block ghost danger" value="discard">${t('Descartar')}</button>
      </div>`,
    (fd, _f, value) => {
      if (value === 'discard') {
        ask(t('¿Descartar este entreno? Se perderán las series.'), t('Descartar'), () => { state.active = null; clearNotes(); commit(); });
        return;
      }
      const w = workoutFromActive(a, { typed: fd.has('typed'), sugs: fd.has('sugs') });
      if (!w.entries.length) { toast(sm.sugs ? t('Marca las series que hiciste para guardarlas') : t('No hay series que guardar')); return false; }
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
      toast(w.partial ? t('Guardado como sesión parcial: lo tendré en cuenta para tus próximas cargas') : t('Entreno guardado'));
    });
    return false;
  },
  // ---- calendario de la pestaña Entrenar
  'cal-day'(_, el) {
    const day = calCell(el.dataset.iso);
    if (!day) return false;
    const title = `${t(day.weekday)} ${day.date.getDate()}`;
    const r = day.routine;
    if (r) {
      const items = r.exerciseIds.filter(exById).map((id) => {
        const t = r.targets?.[id];
        return `<li>${esc(exDisp(id))}${t ? ` <span class="muted" dir="ltr">${t.sets}×${esc(t.reps)}</span>` : ''}</li>`;
      }).join('');
      const adj = adjustmentsFor(state, r.name, day.date.getTime()).map((x) => `<li class="muted">＋ ${x.kind === 'add_sets' ? tn(x.sets, '{n} serie de {name}', '{n} series de {name}', { name: esc(exLabel(x.exercise)) }) : `${esc(exLabel(x.exercise))} ${x.sets}×${esc(x.reps)}`}</li>`).join('');
      const note = day.workout
        ? `<p class="muted">${day.status === 'partial' ? `◐ ${t('Sesión parcial')}` : `✓ ${t('Hecho')}`}${day.doneOn ? ` · ${t('el {date}', { date: fmtDate(day.workout.start) })}` : ''}</p>`
        : day.movedFrom ? `<p class="muted">↪ ${t('Movida desde el {day}', { day: dayLabel(calCell(day.movedFrom) || { weekday: day.movedFrom, date: new Date() }) })}</p>` : '';
      const canMove = !day.workout;
      openDialog(`
        <h2>${title} · ${esc(rName(r.name))}</h2>
        ${timeAt(day.iso) && !day.workout ? `<p class="muted">${ic('clock')} ${timeAt(day.iso).time}${timeAt(day.iso).eventId ? ` · ${t('en tu Google Calendar')}` : ''}</p>` : ''}
        ${note}
        <ul class="exlist">${items}${adj}</ul>
        <div class="stack" style="margin-top:12px">
          <button class="block primary" value="start">${day.workout ? t('Hacerlo otra vez') : day.status === 'missed' ? t('Hacerlo ahora') : t('Empezar')}</button>
          ${day.status === 'partial' && day.workout?.skipped?.length ? `<button class="block" value="rest">${t('Hacer lo que faltó')}</button>` : ''}
          ${canMove && !day.isPast ? `<button class="block" value="time">${ic('clock')} ${timeAt(day.iso) ? t('A las {time} · cambiar', { time: timeAt(day.iso).time }) : t('Poner hora')}</button>` : ''}
          ${canMove && r.extra ? `<button class="block" value="xmove">${ic('calendar')} ${t('Mover a otro día')}</button><button class="block ghost danger" value="xdel">${t('Quitar esta sesión')}</button>` : ''}
          ${canMove && !r.extra ? `<button class="block" value="move">${ic('calendar')} ${t('Mover a otro día')}</button><button class="block" value="skip">${t('Saltar esta sesión')}</button>` : ''}
          ${day.movedFrom && !day.workout ? `<button class="block ghost" value="back">${t('Volver a su día')}</button>` : ''}
          ${day.workout ? `<button class="block" value="history">${t('Ver en historial')}</button>` : ''}
          <button class="block ghost" value="cancel" formnovalidate>${t('Cerrar')}</button>
        </div>`,
      (fd, _f, value) => {
        if (value === 'start') { actions.start(r.id); commit(); }
        else if (value === 'rest') { actions['start-rest'](day.workout.id); commit(); }
        else if (value === 'time') scheduleDialog(day);
        else if (value === 'move') moveDialog(day);
        else if (value === 'xmove') moveExtraDialog(day);
        else if (value === 'xdel') ask(t('¿Quitar «{name}» del {day}?', { name: rName(r.name), day: dayLabel(day) }), t('Quitar'), () => { state.extras = state.extras.filter((x) => x.id !== r.id); commit(); });
        else if (value === 'skip') skipSession(day);
        else if (value === 'back') { setMove(state, day, day.movedFrom, calCell); commit(); }
        else if (value === 'history') { tab = 'history'; render(); window.scrollTo(0, 0); }
      });
    } else if (day.status === 'moved' || day.status === 'skipped') {
      const mv = (state.moves || []).find((m) => m.from === day.iso);
      const dest = day.movedTo ? calCell(day.movedTo) : null;
      openDialog(`
        <h2>${title} · ${esc(rName(mv?.name || t('Sesión')))}</h2>
        <p class="muted">${day.status === 'skipped' ? `⏭ ${t('Sesión saltada')}` : `↪ ${t('Movida al {day}', { day: dest ? dayLabel(dest) : day.movedTo })}`}</p>
        <div class="stack" style="margin-top:12px">
          <button class="block primary" value="restore">${day.status === 'skipped' ? t('Recuperar la sesión') : t('Volver a este día')}</button>
          <button class="block ghost" value="cancel" formnovalidate>${t('Cerrar')}</button>
        </div>`,
      () => { state.moves = state.moves.filter((m) => m !== mv); commit(); });
    } else if (day.extra) {
      openDialog(`
        <h2>${title} · ${esc(rName(day.extra.name))}</h2>
        <p class="muted">${t('Entreno fuera del plan')}</p>
        <div class="stack" style="margin-top:12px">
          <button class="block" value="history">${t('Ver en historial')}</button>
          <button class="block ghost" value="cancel" formnovalidate>${t('Cerrar')}</button>
        </div>`,
      () => { tab = 'history'; render(); window.scrollTo(0, 0); });
    } else if (day.status === 'rest' && !day.isPast) {
      newSessionDialog(day.iso);
    }
    return false;
  },
  'gcal-sync'() { flushCalendar(true); return false; },
  'week-times'() { weekTimesDialog(); return false; },
  'new-session'() { newSessionDialog(isoLocal(Date.now())); return false; },
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
    ask(t('¿Descartar este entreno? Se perderán las series.'), t('Descartar'), () => { state.active = null; clearNotes(); commit(); });
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
        <span><b>${title}</b>${help || !supported ? `<small>${help}${supported ? '' : ` ${t('No disponible en este navegador')}`}</small>` : ''}</span>
      </label>`;
    openDialog(`
      <h2>${t('Ajustes')}</h2>
      <label class="field">${t('Idioma')}
        <select name="lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === getLang() ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <label class="field" style="margin-top:12px">${t('Tema')}
        <select name="theme">${[['system', t('Seguir al sistema')], ['light', t('Claro')], ['dark', t('Oscuro')]].map(([k, v]) => `<option value="${k}" ${k === (s.theme || 'system') ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <label class="field" style="margin-top:12px">${t('Descanso entre series')}
        <select name="rest">${restOptions(s.rest)}</select>
      </label>
      ${sw('lockscreen', t('Temporizador con el móvil bloqueado'), t('Puede pausar tu música'), canLock)}
      ${sw('notify', t('Notificaciones'), t('Aviso al terminar el descanso'), canNotify)}
      ${sw('sound', t('Sonido y vibración'), '')}
      ${sw('wakeLock', t('Pantalla siempre encendida'), t('Durante el entreno'), canWake)}
      ${dialogButtons(t('Guardar'))}`,
    (fd) => {
      const newLang = fd.get('lang');
      s.theme = ['light', 'dark'].includes(fd.get('theme')) ? fd.get('theme') : 'system';
      applyTheme();
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
          if (!s.notify) toast(t('Permiso de notificaciones denegado: actívalo en los ajustes del navegador'));
          commit();
        });
      } else {
        s.notify = wantNotify;
      }
      if (LANGS[newLang] && newLang !== s.lang) { s.lang = newLang; applyLang(); }
      commit();
    });
    return false;
  },
  'new-routine'() {
    pickExercisesDialog({
      title: t('Nueva rutina'), confirm: t('Guardar'), nameField: '',
      onDone: (ids, name) => { state.routines.push({ id: uid(), name: name || t('Rutina'), exerciseIds: ids }); commit(); },
    });
    return false;
  },
  'edit-routine'(id) {
    const r = state.routines.find((x) => x.id === id);
    pickExercisesDialog({
      title: t('Editar rutina'), confirm: t('Guardar'), nameField: rName(r.name), selected: r.exerciseIds,
      onDone: (ids, name) => { r.name = name || r.name; r.exerciseIds = ids; commit(); },
    });
    return false;
  },
  'delete-routine'(id) {
    ask(t('¿Borrar esta rutina?'), t('Borrar'), () => { state.routines = state.routines.filter((r) => r.id !== id); commit(); });
    return false;
  },
  'new-exercise'() { exerciseDialog(null); return false; },
  'edit-exercise'(id) { exerciseDialog(exById(id)); return false; },
  'delete-exercise'(id) {
    const usedInHistory = state.workouts.some((w) => w.entries.some((e) => e.exerciseId === id));
    const msg = usedInHistory
      ? t('Este ejercicio aparece en tu historial. ¿Borrarlo de todos modos? El historial lo mostrará como "Ejercicio eliminado".')
      : t('¿Borrar este ejercicio?');
    ask(msg, t('Borrar'), () => {
      state.exercises = state.exercises.filter((e) => e.id !== id);
      state.routines.forEach((r) => { r.exerciseIds = r.exerciseIds.filter((x) => x !== id); });
      commit();
    });
    return false;
  },
  'delete-workout'(id) {
    ask(t('¿Borrar este entreno del historial?'), t('Borrar'), () => {
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
        ask(t('Esto reemplazará todos tus datos actuales. ¿Continuar?'), t('Reemplazar'), () => {
          state = migrate({ ...defaultState(), ...data });
          commit();
        });
      } catch (_) {
        toast(t('El archivo no es una copia válida de Gymonkey'));
      }
    };
    input.click();
    return false;
  },
};

function commit() { reconcileSchedule(); save(); render(); flushCalendar(); }

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

// En el chat, Enter envía el mensaje (Mayús+Enter hace un salto de línea).
document.addEventListener('keydown', (ev) => {
  const el = ev.target;
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && el.dataset?.chatinput !== undefined) { ev.preventDefault(); el.form?.requestSubmit(); }
});

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
  if (el.dataset.chatinput !== undefined) { onChatInput(el); return; }
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
      showNote(t('Descanso en curso'), `${t('Siguiente serie a las {time} ({dur})', { time: fmtClock(state.active.timer.start + info.duration), dur: fmtDuration(info.duration) })} · ${info.name}`, { silent: true });
    } else if (info?.kind === 'set') {
      showNote(t('Serie {n} en curso', { n: info.setNo }), `${info.name} · ${t('empezaste a las {time}', { time: fmtClock(state.active.timer.start) })}`, { silent: true });
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
      reconcileSchedule();
      storeLocal();
      if (JSON.stringify(state) !== before && !document.querySelector('dialog[open]')) { applyLang(); render(); }
      await cloud.pushState(state);
    }
    setSyncStatus('ok');
    flushCalendar();
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
  if (!u) { el.innerHTML = `<button class="small" data-action="sign-in">${t('Entrar')}</button>`; return; }
  const dot = { saving: 'saving', ok: 'ok', error: 'error' }[syncStatus] || '';
  const initial = esc((u.displayName || u.email || '?').trim()[0].toUpperCase());
  el.innerHTML = `<button class="avatar ${dot}" data-action="account" aria-label="${t('Tu cuenta')}">
    ${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : initial}</button>`;
}

Object.assign(actions, planActions, sessionsActions, weekActions, loadsActions, {
  reload() { location.reload(); return false; },
  'sign-in'() {
    cloud.signIn().catch((e) => toast(t('No se pudo iniciar sesión: {msg}', { msg: e.message })));
    return false;
  },
  account() {
    const u = cloud.currentUser();
    const statusText = { saving: t('Sincronizando…'), ok: t('Todo guardado en tu cuenta ✓'), error: t('No se pudo sincronizar (se reintentará)'), idle: '' }[syncStatus];
    openDialog(`
      <h2>${t('Tu cuenta')}</h2>
      <p><b>${esc(u.displayName || '')}</b><br><span class="muted">${esc(u.email || '')}</span></p>
      <p class="muted">${statusText}</p>
      <div class="row" style="margin-top:14px">
        <button class="block" value="sync">${t('Sincronizar ahora')}</button>
        <button class="block danger" value="logout">${t('Cerrar sesión')}</button>
      </div>
      <button class="block ghost" value="cancel" style="margin-top:8px">${t('Cerrar')}</button>`,
    async (_, __, value) => {
      if (value === 'sync') { await syncPush(); await syncPull(); }
    });
    // Los botones devuelven su value en el submit; se gestiona el cierre de sesión aparte.
    $dialog.querySelector('[value="logout"]').addEventListener('click', async (ev) => {
      ev.preventDefault();
      ask(t('¿Cerrar sesión? Los datos se borrarán de este dispositivo, pero siguen guardados en tu cuenta.'), t('Cerrar sesión'), async () => {
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

/** Aplica el idioma elegido (o el del navegador) a toda la app: textos fijos, dirección y vistas. */
function applyLang() {
  setLang(state.settings.lang || detectLang());
  applyStatic();
  applyTheme();
}

/** Tema: el del sistema (por defecto), claro u oscuro. */
function applyTheme() {
  const th = state.settings.theme;
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
}

/** Textos del index.html: los elementos con data-i18n (y data-i18n-aria para etiquetas accesibles). */
function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
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
  setTab: (x) => { tab = x; },
  commit, save, render, openDialog, dialogButtons, ask, esc, uid, fmtSecs, exName, fmtSet, toast,
  auth: { configured: cloud.cloudConfigured, user: cloud.currentUser, idToken: cloud.idToken },
});

cloud.initCloud((u) => {
  renderAccount();
  if (u) syncPull();
  if (tab === 'plan') render();
}).catch((e) => console.error('No se pudo iniciar Firebase', e));

applyLang();
// Las sesiones nuevas que entran en el calendario toman la hora del horario semanal.
try { reconcileSchedule(); storeLocal(); } catch (e) { console.error(e); }
render();
setInterval(tick, 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
