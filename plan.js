// Plan de entrenamiento con IA: formulario inicial → preguntas de seguimiento →
// plan por mesociclos → aplicar a rutinas → editar a mano o ajustar con IA.

import { DEMO_AI } from './config.js';
import { MAX_DOC, promptOtraIA, buildExport } from './context.js';
import { matchExercise, addAlias } from './exercises.js';
import { knownLoads } from './progression.js';
import { t, tn, T, LANGS, getLang, fmtNum, exLabel, dayShort, canonicalExercise } from './i18n.js';
import { ic } from './icons.js';

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const GOALS = [
  ['hipertrofia', T('Ganar músculo (hipertrofia)')],
  ['fuerza', T('Ganar fuerza')],
  ['grasa', T('Perder grasa manteniendo músculo')],
  ['recomposicion', T('Recomposición corporal')],
  ['salud', T('Salud y forma general')],
  ['rendimiento', T('Rendimiento para un deporte')],
];
const LEVELS = [
  ['principiante', T('Principiante (menos de 6 meses)')],
  ['novato', T('Novato (6-12 meses)')],
  ['intermedio', T('Intermedio (1-3 años)')],
  ['avanzado', T('Avanzado (más de 3 años)')],
];
const EQUIPMENT = [
  T('Barra y discos'), T('Rack o jaula'), T('Banco ajustable'), T('Mancuernas'), T('Máquinas guiadas'), T('Poleas'),
  T('Prensa de piernas'), T('Máquina Smith'), T('Kettlebells'), T('Barra de dominadas'), T('Paralelas'), T('Bandas elásticas'), T('Máquinas de cardio'),
];
const MINUTES = [30, 45, 60, 75, 90, 120];
const WEEKS = [4, 6, 8, 10, 12, 16];
const FEEDBACK_OPTIONS = [
  T('Quiero entrenar menos días'), T('Quiero entrenar más días'), T('Cambiar los días de la semana'),
  T('Sesiones más cortas'), T('Sesiones más largas'), T('Tengo una molestia o lesión'),
  T('No tengo acceso a algún ejercicio o máquina'), T('Me resulta demasiado fácil'),
  T('Me resulta demasiado duro / estoy muy cansado'), T('Quiero priorizar un músculo'), T('Cambiar ejercicios que no me gustan'),
];
const PLAN_FIELDS = ['title', 'summary', 'goal', 'split', 'days_per_week', 'session_minutes', 'total_weeks', 'start_week', 'schedule', 'warmup', 'principles', 'mesocycles', 'progression_rules', 'notes'];

const DAY = 864e5;
const label = (list, v) => list.find(([k]) => k === v)?.[1] ?? v;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const todayISO = () => new Date().toISOString().slice(0, 10);
export const todayName = () => WEEKDAYS[(new Date().getDay() + 6) % 7];
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

let ctx;
/** ctx: funciones y utilidades compartidas con app.js */
export function initPlan(c) { ctx = c; }
const S = () => ctx.state();
const esc = (s) => ctx.esc(s);

const ui = { showPlan: false, chatDraft: '', noTranslate: false, step: null, loading: null, error: null, questions: null, editing: null, editMeso: 0, viewMeso: null, draft: {}, lastRun: null };
export const planBusy = () => !!ui.loading;

/* ---------- semana actual del plan ---------- */

/** Semana del plan en la que se entra (1 si se empieza de cero; más si la persona ya llevaba semanas). */
export const startWeek = (plan) => Math.max(1, Math.min(plan.total_weeks || 1, Math.round(plan.start_week) || 1));

export function weekInfo(plan, at = Date.now()) {
  if (!plan?.mesocycles?.length) return null;
  const started = !!plan.startDate;
  const raw = started ? Math.floor((startOfDay(at) - plan.startDate) / (7 * DAY)) + 1 : 1;
  const finished = raw > plan.total_weeks;
  const week = Math.max(1, Math.min(raw, plan.total_weeks));
  let acc = 0;
  for (let i = 0; i < plan.mesocycles.length; i++) {
    const m = plan.mesocycles[i];
    if (week <= acc + m.weeks || i === plan.mesocycles.length - 1) {
      const weekInMeso = Math.min(week - acc, m.weeks);
      return { week, meso: i, weekInMeso, wp: m.weeks_plan?.[weekInMeso - 1] || null, started, finished };
    }
    acc += m.weeks;
  }
  return null;
}

/* ---------- llamadas a la IA ---------- */

const IDLE_MS = 45_000; // sin ninguna señal del servidor durante este tiempo = conexión perdida

export async function callAI(mode, input, { signal, onProgress } = {}) {
  if (DEMO_AI) return (await import('./demo.js')).demoAI(mode, input, onProgress);
  const auth = ctx.auth;
  if (auth.configured && !auth.user()) throw new Error(t('Inicia sesión con Google para usar la IA.'));
  const token = await auth.idToken();

  // Si el servidor se queda en silencio, se corta y se avisa (en vez de esperar sin fin).
  const link = new AbortController();
  let idle = null, stalled = false;
  const poke = () => { clearTimeout(idle); idle = setTimeout(() => { stalled = true; link.abort(); }, IDLE_MS); };
  signal?.addEventListener('abort', () => link.abort());

  try {
    let res;
    try {
      res = await fetch('api/plan', {
        method: 'POST',
        signal: link.signal,
        headers: { 'Content-Type': 'application/json', 'X-App-Lang': getLang(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ mode, input, lang: getLang() }),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new Error(stalled ? lost() : t('No hay conexión con el servidor. Revisa tu internet y pulsa Reintentar.'));
    }
    poke(); // las cabeceras llegan enseguida si el servidor envía en directo; desde aquí vigilamos el silencio
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch { /* respuesta sin JSON */ }
      throw new Error(data.error || (res.status === 404 || res.status === 405
        ? t('El servidor de IA no está disponible. La IA funciona cuando la app está publicada en Vercel.')
        : t('Error del servidor ({n}).', { n: res.status })));
    }

    let result = null, failure = null;
    const handle = (frame) => {
      const payload = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!payload) return;
      let ev;
      try { ev = JSON.parse(payload); } catch { return; }
      if (ev.type === 'progress') onProgress?.(ev);
      else if (ev.type === 'result') result = ev.data;
      else if (ev.type === 'error') failure = ev.error;
    };
    try {
      if (res.body?.getReader) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          poke();
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 2); }
        }
        handle(buf);
      } else {
        (await res.text()).split('\n\n').forEach(handle);
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      if (!result && !failure) throw new Error(lost());
    }
    if (failure) throw new Error(failure);
    if (!result) throw new Error(lost());
    return result;
  } finally {
    clearTimeout(idle);
  }
}

const lost = () => t('Se cortó la conexión antes de terminar (pasa a veces con datos móviles). Pulsa Reintentar: tus respuestas siguen guardadas.');

/** Ejecuta una llamada larga a la IA mostrando el avance. Se puede cancelar y reintentar. */
async function runAI(text, fn, { chat = false } = {}) {
  const abort = new AbortController();
  ui.lastRun = { text, fn, chat };
  ui.loading = { text, chat, since: Date.now(), pct: 0, shown: 0, phase: t('Conectando con el entrenador…'), abort };
  ui.error = null;
  ctx.render();
  const onProgress = (p) => {
    if (!ui.loading) return;
    ui.loading.pct = Math.max(ui.loading.pct, p.pct);
    ui.loading.phase = p.phase;
    planTick();
  };
  try {
    await fn({ signal: abort.signal, onProgress });
    ui.lastRun = null;
  } catch (e) {
    if (!abort.signal.aborted) ui.error = e.message || t('Algo salió mal.');
  } finally {
    ui.loading = null;
    ctx.commit();
  }
}

export function aiProfile() {
  const { context_doc, ...p } = S().profile || {};
  return { ...p, goal: label(GOALS, p.goal), experience: label(LEVELS, p.experience) };
}
const profileDoc = () => (S().profile?.context_doc || '').trim();
const library = () => S().exercises.map((e) => e.name);
const planForAI = (plan) => Object.fromEntries(PLAN_FIELDS.map((k) => [k, plan[k]]));

export function trainingSummary() {
  return S().workouts.slice(-8).map((w) => ({
    date: new Date(w.start).toISOString().slice(0, 10),
    routine: w.name,
    ...(w.partial ? { partial: true, skipped: (w.skipped || []).map((id) => ctx.exName(id)) } : {}),
    exercises: w.entries.map((e) => `${ctx.exName(e.exerciseId)}: ${e.sets.map((s) => ctx.fmtSet(e.exerciseId, s)).join(', ')}`),
  }));
}

/** Guarda un plan nuevo o actualizado (conservando el progreso y la versión anterior para deshacer). */
function setPlan(data, message, changes, keepProgress, lang = getLang()) {
  const st = S();
  const prev = st.plan;
  const keep = keepProgress && prev;
  const strip = ({ history, ...rest }) => rest;
  st.plan = {
    ...planForAI(data),
    id: keep ? prev.id : ctx.uid(),
    createdAt: keep ? prev.createdAt : Date.now(),
    updatedAt: Date.now(),
    lang,
    startDate: keep ? prev.startDate : null,
    appliedMeso: keep ? prev.appliedMeso : null,
    lastMessage: message || '',
    lastChanges: changes || [],
    history: keep ? [strip(prev), ...(prev.history || [])].slice(0, 3) : [],
  };
  ui.viewMeso = null;
  if (keep) renameSessions(prev, st.plan);
  if (keep && st.plan.appliedMeso != null) {
    applyMeso(weekInfo(st.plan).meso);
    ctx.toast(t('Plan actualizado y rutinas al día'));
  }
}

/** Si la IA renombra sesiones (p. ej. al traducir), los movimientos y ajustes que apuntan a su nombre antiguo siguen al nuevo (mismo mesociclo, mismo lugar). */
function renameSessions(prev, next) {
  const st = S();
  prev.mesocycles?.forEach((m, mi) => m.days?.forEach((d, di) => {
    const nd = next.mesocycles?.[mi]?.days?.[di];
    if (!nd || !nd.name || nd.name === d.name || nd.weekday !== d.weekday) return;
    (st.moves || []).forEach((x) => { if (x.name === d.name) x.name = nd.name; });
    (st.adjust || []).forEach((x) => { if (x.routine === d.name) x.routine = nd.name; });
  }));
}

/* ---------- aplicar el plan a las rutinas ---------- */

function findOrCreateExercise(x) {
  const st = S();
  // Reconoce el ejercicio aunque se llame un poco distinto ("Press banca" = "Press de banca") y recuerda el nombre.
  const name = canonicalExercise(x.name);
  const m = matchExercise(name, st.exercises);
  if (m) {
    if (m.how === 'similar') addAlias(m.exercise, x.name);
    return m.exercise;
  }
  const ex = { id: ctx.uid(), name: name.trim(), muscle: x.muscle_group || 'Otros', type: x.type === 'time' ? 'time' : 'reps' };
  st.exercises.push(ex);
  return ex;
}

function applyMeso(mi) {
  const st = S();
  const plan = st.plan;
  const meso = plan.mesocycles[mi];
  if (!meso) return;
  st.routines = st.routines.filter((r) => !r.fromPlan);
  meso.days.forEach((d, di) => {
    const exerciseIds = [];
    const targets = {};
    d.exercises.filter((x) => x.name?.trim()).forEach((x) => {
      const ex = findOrCreateExercise(x);
      exerciseIds.push(ex.id);
      targets[ex.id] = { sets: x.sets, reps: x.reps, rir: x.rir, rest: x.rest_seconds, notes: x.notes, startLoad: x.start_load_kg || 0, startBasis: x.load_basis || '' };
      // La carga prescrita también queda en el ejercicio, para que cualquier rutina que lo use la aproveche.
      if (!(ex.startLoad > 0) && x.start_load_kg > 0) { ex.startLoad = x.start_load_kg; ex.startBasis = x.load_basis || 'estimado'; }
      else if (!ex.startBasis && x.load_basis === 'peso_corporal') ex.startBasis = 'peso_corporal';
    });
    st.routines.push({ id: ctx.uid(), name: d.name, exerciseIds, targets, fromPlan: true, weekday: d.weekday, planDay: { meso: mi, day: di } });
  });
  plan.appliedMeso = mi;
}

/* ---------- vistas ---------- */

const chips = (name, values, selected = [], type = 'checkbox', tr = true) => `<div class="chips">${values.map((v) => `
  <label class="chip"><input type="${type}" name="${name}" value="${esc(v)}" ${selected.includes(v) ? 'checked' : ''}><span>${esc(tr ? t(v) : v)}</span></label>`).join('')}</div>`;
const options = (list, sel, tr = true) => list.map(([v, txt]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(tr ? t(txt) : txt)}</option>`).join('');
const minuteOpts = () => MINUTES.map((m) => [m, t('{n} min', { n: m })]);

function loadingCard() {
  return `<div class="card ai-loading" role="status">
      <h3>${esc(ui.loading.text)}</h3>
      <div class="progress" aria-hidden="true"><i id="ai-bar" style="width:${Math.round(ui.loading.shown)}%"></i></div>
      <div class="skel" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="row between"><span id="ai-phase" class="phase">${esc(ui.loading.phase)}</span><b id="ai-pct" class="timer">${Math.round(ui.loading.shown)} %</b></div>
      <div class="row between small-line muted"><span>${ic('clock')} <b id="ai-elapsed" class="timer">0:00</b></span><span>${t('Mantén la pantalla abierta')}</span></div>
      <button class="ghost block" style="margin-top:8px" data-action="plan-cancel-ai">${t('Cancelar')}</button>
    </div>`;
}

export function viewPlan() {
  if (ui.loading && !ui.loading.chat) return loadingCard();
  const err = ui.error ? `<div class="card error" role="alert"><p style="margin:0 0 8px">${ic('alert')} ${esc(ui.error)}</p>${ui.lastRun ? `<button class="primary" data-action="plan-retry">${t('Reintentar')}</button>` : ''}</div>` : '';
  const login = ctx.auth.configured && !ctx.auth.user()
    ? `<div class="card"><button class="primary block" data-action="sign-in">${t('Iniciar sesión con Google')}</button><p class="muted" style="margin:8px 0 0;text-align:center">${t('Para usar la IA y guardar tus datos')}</p></div>`
    : '';
  const demo = DEMO_AI ? `<div class="card demo-note">${ic('flask')} <b>${t('Modo demo')}</b> · ${t('la IA está simulada')}</div>` : '';
  if (ui.step === 'form') return err + demo + login + formView();
  if (ui.step === 'questions') return err + demo + questionsView();
  if (!S().plan && !ui.editing) return err + demo + login + chatView();
  if (ui.editing) return err + editView();
  if (ui.showPlan) return err + planView(S().plan);
  return err + demo + chatView();
}

export function planTick() {
  const l = ui.loading;
  if (!l) return;
  const secs = Math.floor((Date.now() - l.since) / 1000);
  // Mientras la IA piensa y aún no ha escrito nada, la barra avanza despacio para que se note que sigue viva.
  const target = l.pct > 4 ? l.pct : Math.min(4, secs / 20);
  l.shown += (target - l.shown) * 0.35;
  if (Math.abs(target - l.shown) < 0.2) l.shown = target;
  const set = (id, fn) => { const n = document.getElementById(id); if (n) fn(n); };
  set('ai-elapsed', (n) => { n.textContent = ctx.fmtSecs(secs); });
  set('ai-bar', (n) => { n.style.width = `${l.shown.toFixed(1)}%`; });
  set('ai-pct', (n) => { n.textContent = `${Math.round(l.shown)} %`; });
  set('ai-phase', (n) => { if (n.textContent !== l.phase) n.textContent = l.phase; });
}

/** Al volver a la app: si la pantalla se quedó en "cargando" pero ya hay resultado, se repinta. */
export function planResume() {
  if (!ui.loading && document.querySelector('.ai-loading')) ctx.render();
}

/* ---------- chat con el coach ---------- */

function pushChat(role, text, changes) {
  const st = S();
  st.chat ||= [];
  const msg = { id: ctx.uid(), role, text: String(text || ''), ts: Date.now() };
  if (changes?.length) msg.changes = changes;
  st.chat.push(msg);
  if (st.chat.length > 80) st.chat = st.chat.slice(-80);
}

const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

function bubble(m, withUndo) {
  const changes = m.changes?.length ? `<ul class="changes">${m.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
  const undo = withUndo ? `<button class="small" data-action="plan-undo">↩ ${t('Deshacer cambios')}</button>` : '';
  return `<div class="bubble ${m.role === 'user' ? 'me' : 'coach'}">${m.text ? `<p>${nl2br(m.text)}</p>` : ''}${changes}${undo}</div>`;
}

/** Atajos para empezar la conversación (la persona puede escribir lo que quiera). */
const QUICK = [
  () => t('¿Cómo voy esta semana?'),
  () => t('Tengo una molestia'),
  () => t('Quiero sesiones más cortas'),
  () => t('Quiero cambiar algunos ejercicios'),
];

function chatView() {
  const plan = S().plan;
  const msgs = S().chat || [];
  const lastChange = [...msgs].reverse().find((m) => m.changes?.length)?.id;
  const canUndo = !!plan?.history?.length;
  const intro = !plan
    ? `<div class="bubble coach"><p>${t('¡Hola! Soy tu coach. Te hago unas preguntas, diseño tu plan por mesociclos y después lo vamos ajustando por aquí, charlando.')}</p><button class="primary" data-action="plan-start">${t('Crear mi plan')}</button></div>`
    : !msgs.length
      ? `<div class="bubble coach"><p>${t('Cuéntame cómo vas y ajusto tu plan: días, ejercicios, molestias, tiempo… Pregúntame lo que quieras.')}</p></div>`
      : '';
  const translate = plan && !ui.noTranslate && (plan.lang || 'es') !== getLang()
    ? `<div class="card accent stack"><span>${t('Tu plan está escrito en {lang}. ¿Quieres que el coach lo traduzca?', { lang: LANGS[plan.lang || 'es'] })}</span>
        <div class="row"><button class="primary small" data-action="chat-translate">${t('Traducir mi plan')}</button><button class="ghost small" data-action="chat-no-translate">${t('Ahora no')}</button></div></div>`
    : '';
  const busy = !!ui.loading;
  return `<div class="chat">
    <div class="row between chat-head"><h2>${ic('coach')} ${t('Tu coach')}</h2>${plan ? `<button class="small" data-action="plan-chat-toggle">${ic('clipboard')} ${t('Ver plan')}</button>` : ''}</div>
    <div class="bubbles">
      ${intro}
      ${msgs.map((m) => bubble(m, m.id === lastChange && canUndo)).join('')}
      ${plan && !plan.startDate ? `<div class="bubble coach"><p>${t('Tu plan está listo. Empiézalo para ver tu calendario y tus rutinas en Entrenar.')}</p><button class="primary" data-action="plan-apply">${t('Empezar el plan')}${startWeek(plan) > 1 ? ` · ${t('semana {n}', { n: startWeek(plan) })}` : ''}</button></div>` : ''}
      ${translate}
      ${ui.loading?.chat ? loadingCard() : ''}
      <div id="chat-end"></div>
    </div>
    ${plan && !busy ? `<div class="chips quick">${QUICK.map((q, i) => `<button type="button" class="chip-btn" data-action="chat-quick" data-q="${i}">${esc(q())}</button>`).join('')}</div>` : ''}
    ${plan ? `<form data-form="plan-chat" class="chat-input">
      <textarea name="text" rows="1" data-chatinput placeholder="${t('Escribe a tu coach…')}" aria-label="${t('Escribe a tu coach…')}" ${busy ? 'disabled' : ''}>${esc(ui.chatDraft)}</textarea>
      <button class="primary" aria-label="${t('Enviar')}" ${busy ? 'disabled' : ''}>↑</button>
    </form>` : ''}
  </div>`;
}

export function onChatInput(el) {
  ui.chatDraft = el.value;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
}

/** Un mensaje de la persona: el coach responde y, si hace falta, ajusta el plan. */
function sendChat(text) {
  pushChat('user', text);
  ui.chatDraft = '';
  let reply = null, updated = false;
  const base = () => {
    const plan = S().plan;
    return { profile: aiProfile(), plan: planForAI(plan), currentWeek: weekInfo(plan)?.week || 1, history: trainingSummary(), today: todayISO(), library: library(), known_loads: knownLoads(S().workouts, S().exercises) };
  };
  runAI(t('Pensando…'), async (o) => {
    if (!reply) {
      const chat = (S().chat || []).slice(-14).map(({ role, text: tx }) => ({ role, text: tx }));
      reply = await callAI('chat', { ...base(), chat }, o);
      pushChat('coach', reply.message);
      ctx.render();
    }
    if (reply.action === 'update_plan' && reply.instruction && !updated) {
      ui.loading.text = t('Ajustando tu plan…');
      Object.assign(ui.loading, { pct: 0, shown: 0, since: Date.now(), phase: t('Conectando con el entrenador…') });
      const r = await callAI('adapt', { ...base(), feedback: { options: [], days: [], minutes: null, text: reply.instruction } }, o);
      setPlan(r.plan, '', r.changes, true);
      updated = true;
      pushChat('coach', r.message, r.changes);
    }
  }, { chat: true });
}

/** Bloque "adjuntar mi plan o notas": archivo, texto pegado y prompt para otra IA. */
function contextBlock(value = '', open = false) {
  return `
    <details class="ctx" ${open || value ? 'open' : ''}>
      <summary><b>${ic('clip')} ${t('Adjuntar plan o notas')}</b></summary>
      <div class="row wrap" style="margin-top:8px">
        <label class="file-btn"><input type="file" data-ctx-file accept=".md,.markdown,.txt,.csv,.json,text/*"><span>${ic('file')} ${t('Archivo')}</span></label>
        <button type="button" class="small" data-action="ctx-copy-prompt">${ic('clipboard')} ${t('Prompt para otra IA')}</button>
        <button type="button" class="small" data-action="ctx-copy-export">${ic('export')} ${t('Mis datos')}</button>
        <button type="button" class="small" data-action="ctx-download-export">${ic('import')} .md</button>
      </div>
      <textarea name="context_doc" data-ctxdoc rows="5" placeholder="${t('Pega aquí tu plan o notas…')}">${esc(value)}</textarea>
      <div class="ctx-tools">
        <div class="row between small-line muted"><span>${ic('lock')} ${t('Se envía a la IA · sin datos personales')}</span><span data-ctx-count dir="ltr">${fmtNum(value.length)} / ${fmtNum(MAX_DOC)}</span></div>
        <details class="how"><summary>${t('¿Cómo funciona?')}</summary>
          <ol class="muted ctx-steps">
            <li>${t('Abre tu otra IA en la conversación que ya tiene tu historial.')}</li>
            <li>${t('Pega el prompt y envíalo: te devolverá un resumen en Markdown.')}</li>
            <li>${t('Pégalo aquí o súbelo como .md.')}</li>
          </ol>
          <p class="muted" style="margin:6px 0 0">${t('¿Plan en PDF o foto? Adjúntalo en ese mismo mensaje. Las sesiones con fecha se importan desde <b>Historial</b>.')}</p>
        </details>
      </div>
    </details>`;
}

function formView() {
  const p = S().profile || {};
  return `
    <form data-form="plan-profile" class="card stack">
      <h2>${t('Cuéntanos sobre ti')}</h2>
      <label class="field">${t('Objetivo principal')}<select name="goal">${options(GOALS, p.goal || 'hipertrofia')}</select></label>
      <label class="field">${t('Experiencia con pesas')}<select name="experience">${options(LEVELS, p.experience || 'novato')}</select></label>
      <fieldset class="field"><legend>${t('¿Qué días puedes entrenar?')}</legend>${chips('days', WEEKDAYS, p.days || ['Lunes', 'Miércoles', 'Viernes'])}</fieldset>
      <div class="grid2">
        <label class="field">${t('Tiempo por sesión')}<select name="minutes">${options(minuteOpts(), p.minutes || 60, false)}</select></label>
        <label class="field">${t('Duración del plan')}<select name="weeks">${options(WEEKS.map((w) => [w, t('{n} semanas', { n: w })]), p.weeks || 12, false)}</select></label>
      </div>
      <fieldset class="field"><legend>${t('Material disponible')} <button type="button" class="ghost small" data-action="plan-all-equipment">${t('Gimnasio completo')}</button></legend>
        ${chips('equipment', EQUIPMENT, p.equipment || EQUIPMENT)}
      </fieldset>
      <div class="grid2">
        <label class="field">${t('Peso corporal (kg)')}<input name="bodyweight_kg" inputmode="decimal" dir="ltr" placeholder="${t('Para estimar cargas')}" value="${esc(p.bodyweight_kg || '')}"></label>
        <label class="field">${t('Edad (opcional)')}<input name="age" inputmode="numeric" dir="ltr" value="${esc(p.age || '')}"></label>
      </div>
      <label class="field">${t('Sexo (opcional)')}<select name="sex">${options([['', T('Prefiero no decirlo')], ['Mujer', 'Mujer'], ['Hombre', 'Hombre']], p.sex || '')}</select></label>
      <label class="field">${t('Tus marcas actuales (opcional)')}<textarea name="reference_lifts" rows="2" placeholder="${t('Press banca 60 kg × 8, sentadilla 80 kg × 6')}">${esc(p.reference_lifts || '')}</textarea></label>
      <label class="field">${t('Lesiones, molestias o limitaciones')}<textarea name="injuries" rows="2" placeholder="${t('Ej.: dolor lumbar ocasional')}">${esc(p.injuries || '')}</textarea></label>
      <label class="field">${t('Músculos o aspectos a priorizar')}<textarea name="priorities" rows="2" placeholder="${t('Ej.: glúteos, espalda')}">${esc(p.priorities || '')}</textarea></label>
      <label class="field">${t('Preferencias')}<textarea name="preferences" rows="2" placeholder="${t('Ejercicios que te gustan o evitas')}">${esc(p.preferences || '')}</textarea></label>
      ${contextBlock(p.context_doc || '')}
      <button class="primary block">${t('Siguiente')}</button>
      <button type="button" class="ghost block" data-action="plan-cancel">${t('Cancelar')}</button>
    </form>`;
}

function questionsView() {
  const q = ui.questions || { intro: '', questions: [] };
  return `
    <form data-form="plan-questions" class="stack">
      <div class="card"><p style="margin:0">${esc(q.intro || t('Unas preguntas más para afinar tu plan:'))}</p></div>
      ${q.questions.map((x, i) => `
        <div class="card">
          <b>${esc(x.question)}</b>
          <details class="why"><summary>${t('¿Por qué?')}</summary><p class="muted" style="margin:4px 0 0">${esc(x.why)}</p></details>
          ${chips(`q_${i}`, x.options, [ui.draft[`q_${i}`]].filter(Boolean), 'radio', false)}
          <input name="q_${i}_other" aria-label="${t('Otra respuesta (opcional)')}" placeholder="${t('Otra respuesta (opcional)')}" value="${esc(ui.draft[`q_${i}_other`] || '')}" style="margin-top:8px">
        </div>`).join('')}
      <button class="primary block">${t('Generar mi plan')}</button>
      <button type="button" class="ghost block" data-action="plan-back-form">${t('Volver al cuestionario')}</button>
    </form>`;
}

/** Carga prescrita de un ejercicio del plan: "≈ 40 kg" (estimada), "60 kg" (de tus marcas), "peso corp." o "—" (sin dato). */
function loadCell(x) {
  if (x.start_load_kg > 0) return `${x.load_basis === 'marca' ? '' : '≈ '}${fmtNum(Math.round(x.start_load_kg * 10) / 10)} ${t('kg')}`;
  if (x.load_basis === 'peso_corporal' || x.type === 'time') return t('peso corp.');
  return '—';
}

function exerciseTable(d) {
  return `<div class="scroll-x" tabindex="0"><table class="plan-table">
    <thead><tr><th>${t('Ejercicio')}</th><th>${t('Series')}</th><th>${t('Carga')}</th><th>RIR</th><th>${t('Desc.')}</th></tr></thead>
    <tbody>${d.exercises.map((x) => `
      <tr>
        <td><b>${esc(exLabel(x.name))}</b>${x.notes ? `<small>${esc(x.notes)}</small>` : ''}${x.alternatives?.length ? `<small class="alt">${t('Alternativas:')} ${esc(x.alternatives.map(exLabel).join(', '))}</small>` : ''}</td>
        <td dir="ltr">${x.sets}×${esc(x.reps)}${x.type === 'time' ? ' s' : ''}</td>
        <td>${loadCell(x)}</td>
        <td>${esc(x.rir)}</td>
        <td>${ctx.fmtSecs(x.rest_seconds)}</td>
      </tr>`).join('')}</tbody>
  </table></div>`;
}

function planView(plan) {
  const wi = weekInfo(plan);
  const mi = ui.viewMeso ?? wi.meso;
  const meso = plan.mesocycles[mi];
  const pct = Math.round(((wi.started ? wi.week - (wi.finished ? 0 : 1) : 0) / plan.total_weeks) * 100);

  const progress = !wi.started
    ? `<div class="card accent">
        <button class="primary block" data-action="plan-apply">${t('Empezar el plan')}${startWeek(plan) > 1 ? ` · ${t('semana {n}', { n: startWeek(plan) })}` : ''}</button>
        <p class="muted" style="margin:6px 0 0;text-align:center">${t('Crea tus rutinas de entrenamiento')}</p>
      </div>`
    : `<div class="card">
        <div class="row between"><h3>${t('Semana {w} de {total}', { w: wi.week, total: plan.total_weeks })}</h3>${wi.wp?.deload ? `<span class="pill">${t('Descarga')}</span>` : ''}</div>
        <div class="bar light"><i style="width:${pct}%"></i></div>
        <p style="margin:8px 0 0"><b>${esc(plan.mesocycles[wi.meso].name)}</b>${wi.wp ? ` · ${esc(wi.wp.guidance)}` : ''}</p>
        ${wi.finished ? `<p class="muted">${ic('flag')} ${t('Plan completado')}</p>` : ''}
        ${plan.appliedMeso !== wi.meso ? `<button class="primary block" style="margin-top:10px" data-action="plan-apply">${t('Actualizar rutinas')} · ${esc(plan.mesocycles[wi.meso].name)}</button>` : ''}
      </div>`;

  const changes = plan.lastMessage || plan.lastChanges?.length
    ? `<div class="card">
        <p style="margin-top:0">${ic('coach')} ${esc(plan.lastMessage)}</p>
        ${plan.lastChanges?.length ? `<ul class="changes">${plan.lastChanges.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        <div class="row">
          ${plan.history?.length ? `<button class="small" data-action="plan-undo">↩ ${t('Deshacer cambios')}</button>` : ''}
          <button class="small ghost" data-action="plan-dismiss-msg">${t('Ocultar')}</button>
        </div>
      </div>`
    : '';

  return `
    <div class="row between" style="margin-bottom:8px"><span></span><button class="small" data-action="plan-chat-toggle">${ic('coach')} ${t('Chat')}</button></div>
    <div class="card">
      <h2 style="margin:0 0 8px">${esc(plan.title)}</h2>
      <div class="tags">
        <span class="pill">${esc(plan.split)}</span>
        <span class="pill">${tn(plan.days_per_week, '{n} día', '{n} días')}</span>
        <span class="pill">${t('{n} min', { n: plan.session_minutes })}</span>
        <span class="pill">${t('{n} sem', { n: plan.total_weeks })}</span>
        <span class="pill">${ic('calendar')} ${esc(plan.schedule.map(dayShort).join(' · '))}</span>
      </div>
      <details class="how"><summary>${t('Resumen')}</summary><p style="margin:6px 0 0">${esc(plan.summary)}</p></details>
    </div>
    ${changes}
    ${progress}
    <div class="row wrap">
      <button class="primary" data-action="plan-feedback">${ic('coach')} ${t('Ajustar con IA')}</button>
      <button data-action="plan-edit">${ic('edit')} ${t('Editar')}</button>
      <button class="ghost danger" data-action="plan-new">${t('Nuevo plan')}</button>
    </div>

    <h2 style="margin-top:20px">${t('Mesociclos')}</h2>
    <div class="seg">${plan.mesocycles.map((m, i) => `<button class="${i === mi ? 'on' : ''}" data-action="plan-view-meso" data-i="${i}">${i + 1}. ${esc(m.name)}<small>${t('{n} sem', { n: m.weeks })}</small></button>`).join('')}</div>
    <div class="card">
      <h3>${esc(meso.name)} · ${t('{n} sem', { n: meso.weeks })}</h3>
      <p class="muted" style="margin:2px 0 0">${esc(meso.focus)} · ${esc(meso.intensity)}</p>
      <details class="how"><summary>${t('Semana a semana')}</summary>
        <p style="margin:6px 0">${esc(meso.description)}</p>
        <ol class="weeks">${meso.weeks_plan.map((w) => `<li class="${w.deload ? 'deload' : ''}"><b>${esc(w.label)}</b> — ${esc(w.guidance)}</li>`).join('')}</ol>
      </details>
    </div>
    ${meso.days.map((d) => `
      <div class="card">
        <div class="row between"><h3>${esc(d.name)}</h3><span class="pill">${esc(t(d.weekday))}</span></div>
        <p class="muted" style="margin:2px 0 4px">${esc(d.focus)} · ${t('~{n} min', { n: d.estimated_minutes })}</p>
        ${exerciseTable(d)}
      </div>`).join('')}

    <details class="card"><summary><b>${ic('book')} ${t('En qué se basa este plan')}</b></summary>
      <ul class="principles">${plan.principles.map((p) => `<li><b>${esc(p.title)}.</b> ${esc(p.detail)} <span class="muted">(${esc(p.source)})</span></li>`).join('')}</ul>
    </details>
    <details class="card"><summary><b>${ic('trend')} ${t('Cómo progresar')}</b></summary>
      <ul>${plan.progression_rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p><b>${t('Calentamiento:')}</b> ${esc(plan.warmup)}</p>
    </details>
    <details class="card"><summary><b>${ic('edit')} ${t('Notas')}</b></summary>
      ${plan.notes?.length ? `<ul>${plan.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <p class="muted small-print">${t('Plan orientativo generado por IA. No sustituye a un profesional sanitario o a un entrenador; si sientes dolor, para y consulta.')}</p>
    </details>`;
}

function editView() {
  const p = ui.editing;
  const mi = Math.min(ui.editMeso, p.mesocycles.length - 1);
  const m = p.mesocycles[mi];
  const lib = S().exercises.map((e) => `<option value="${esc(e.name)}">`).join('');
  const wd = (sel) => WEEKDAYS.map((w) => `<option value="${w}" ${w === sel ? 'selected' : ''}>${t(w)}</option>`).join('');
  return `
    <div class="card row between sticky-top">
      <h3>${t('Editando el plan')}</h3>
      <div class="row"><button data-action="plan-edit-cancel">${t('Cancelar')}</button><button class="primary" data-action="plan-edit-save">${t('Guardar')}</button></div>
    </div>
    <datalist id="ex-library">${lib}</datalist>
    <div class="seg">${p.mesocycles.map((x, i) => `<button class="${i === mi ? 'on' : ''}" data-action="plan-edit-meso" data-i="${i}">${i + 1}. ${esc(x.name)}</button>`).join('')}</div>
    <div class="card grid2">
      <label class="field">${t('Nombre del mesociclo')}<input data-edit="m.${mi}.name" value="${esc(m.name)}"></label>
      <label class="field">${t('Semanas')}<input data-edit="m.${mi}.weeks" inputmode="numeric" dir="ltr" value="${m.weeks}"></label>
    </div>
    ${m.days.map((d, di) => `
      <div class="card">
        <div class="grid2">
          <label class="field">${t('Día')}<input data-edit="d.${mi}.${di}.name" value="${esc(d.name)}"></label>
          <label class="field">${t('Día de la semana')}<select data-edit="d.${mi}.${di}.weekday">${wd(d.weekday)}</select></label>
        </div>
        <div class="scroll-x" tabindex="0"><table class="edit-table">
          <thead><tr><th>${t('Ejercicio')}</th><th>${t('Series')}</th><th>${t('Reps')}</th><th>${t('Kg')}</th><th>RIR</th><th>${t('Desc. (s)')}</th><th></th></tr></thead>
          <tbody>${d.exercises.map((x, xi) => `
            <tr>
              <td><input list="ex-library" data-edit="x.${mi}.${di}.${xi}.name" value="${esc(x.name)}" aria-label="${t('Ejercicio')}"></td>
              <td><input inputmode="numeric" dir="ltr" data-edit="x.${mi}.${di}.${xi}.sets" value="${x.sets}" aria-label="${t('Series')}"></td>
              <td><input dir="ltr" data-edit="x.${mi}.${di}.${xi}.reps" value="${esc(x.reps)}" aria-label="${t('Repeticiones')}"></td>
              <td><input inputmode="decimal" dir="ltr" data-edit="x.${mi}.${di}.${xi}.start_load_kg" value="${x.start_load_kg || ''}" placeholder="${t('kg')}" aria-label="${t('Carga en kg')}"></td>
              <td><input dir="ltr" data-edit="x.${mi}.${di}.${xi}.rir" value="${esc(x.rir)}" aria-label="RIR"></td>
              <td><input inputmode="numeric" dir="ltr" data-edit="x.${mi}.${di}.${xi}.rest_seconds" value="${x.rest_seconds}" aria-label="${t('Descanso en segundos')}"></td>
              <td><button class="ghost danger" data-action="plan-edit-del-ex" data-m="${mi}" data-d="${di}" data-x="${xi}" aria-label="${t('Quitar ejercicio')}">✕</button></td>
            </tr>`).join('')}</tbody>
        </table></div>
        <div class="row" style="margin-top:8px">
          <button class="block" data-action="plan-edit-add-ex" data-m="${mi}" data-d="${di}">+ ${t('Ejercicio')}</button>
          <button class="ghost danger" data-action="plan-edit-del-day" data-m="${mi}" data-d="${di}">${t('Eliminar día')}</button>
        </div>
      </div>`).join('')}
    <button class="block" data-action="plan-edit-add-day" data-m="${mi}">+ ${t('Añadir día')}</button>`;
}

/* ---------- formularios y campos ---------- */

export function onPlanSubmit(form) {
  const fd = new FormData(form);
  const st = S();
  if (form.dataset.form === 'plan-chat') {
    const text = (fd.get('text') || '').trim();
    if (text && !ui.loading) sendChat(text);
    return;
  }
  if (form.dataset.form === 'plan-profile') {
    const profile = {
      goal: fd.get('goal'), experience: fd.get('experience'),
      days: WEEKDAYS.filter((d) => fd.getAll('days').includes(d)),
      minutes: +fd.get('minutes'), weeks: +fd.get('weeks'),
      equipment: fd.getAll('equipment'),
      age: fd.get('age').trim(), sex: fd.get('sex'), bodyweight_kg: fd.get('bodyweight_kg').trim(), reference_lifts: fd.get('reference_lifts').trim(),
      context_doc: (fd.get('context_doc') || '').trim(),
      injuries: fd.get('injuries').trim(), priorities: fd.get('priorities').trim(), preferences: fd.get('preferences').trim(),
    };
    st.profile = profile;
    ctx.save();
    if (!profile.days.length) { ui.error = t('Elige al menos un día de entreno.'); ctx.render(); return; }
    if (!profile.equipment.length) { ui.error = t('Marca el material que tienes disponible.'); ctx.render(); return; }
    if (profile.context_doc.length > MAX_DOC) { ui.error = t('El documento adjunto supera los {max} caracteres. Resume lo más importante y vuelve a intentarlo.', { max: fmtNum(MAX_DOC) }); ctx.render(); return; }
    ui.draft = {};
    runAI(t('Pensando qué preguntarte…'), async (o) => {
      ui.questions = await callAI('questions', { profile: aiProfile(), context_doc: profileDoc(), known_loads: knownLoads(S().workouts, S().exercises) }, o);
      ui.step = 'questions';
    });
  } else if (form.dataset.form === 'plan-questions') {
    const answers = (ui.questions?.questions || []).map((q, i) => ({
      question: q.question,
      answer: (fd.get(`q_${i}_other`) || '').trim() || fd.get(`q_${i}`) || t('Sin respuesta'),
    }));
    ui.draft = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string'));
    runAI(t('Diseñando tu plan por mesociclos…'), async (o) => {
      const r = await callAI('generate', { profile: aiProfile(), answers, library: library(), today: todayISO(), context_doc: profileDoc(), known_loads: knownLoads(S().workouts, S().exercises) }, o);
      setPlan(r.plan, r.message, [], false);
      pushChat('coach', r.message, r.changes);
      ui.step = null;
      ui.showPlan = false;
      ctx.toast(t('¡Tu plan está listo!'));
    });
  }
}

export function onPlanInput(el) {
  const p = ui.editing;
  if (!p || !el.dataset.edit) return;
  const [kind, ...idx] = el.dataset.edit.split('.');
  const field = idx.pop();
  const [mi, di, xi] = idx.map(Number);
  const target = kind === 'm' ? p.mesocycles[mi] : kind === 'd' ? p.mesocycles[mi].days[di] : p.mesocycles[mi].days[di].exercises[xi];
  const ints = ['sets', 'rest_seconds', 'weeks'];
  if (field === 'start_load_kg') {
    // Una carga escrita a mano es una marca tuya.
    const n = parseFloat(String(el.value).replace(',', '.'));
    target.start_load_kg = Number.isFinite(n) && n > 0 ? n : 0;
    if (target.start_load_kg > 0) target.load_basis = 'marca';
    else if (target.load_basis === 'marca') target.load_basis = 'estimado';
    return;
  }
  target[field] = ints.includes(field) ? Math.max(0, parseInt(el.value, 10) || 0) : el.value;
  if (kind === 'x' && field === 'name') {
    const ex = S().exercises.find((e) => norm(e.name) === norm(el.value));
    if (ex) { target.muscle_group = ex.muscle; target.type = ex.type; }
  }
}

/* ---------- acciones ---------- */

/** Copia al portapapeles; si el navegador lo impide, muestra el texto seleccionado para copiarlo a mano. */
async function copyText(text, btn, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    ctx.toast(okMsg);
    return;
  } catch { /* sin permiso: se ofrece copia manual */ }
  const host = btn.closest('.ctx-tools') || btn.parentElement;
  host.querySelector('.copy-fallback')?.remove();
  const ta = document.createElement('textarea');
  ta.className = 'copy-fallback';
  ta.readOnly = true;
  ta.rows = 6;
  ta.value = text;
  host.appendChild(ta);
  ta.focus();
  ta.select();
  ctx.toast(t('Selecciona el texto y cópialo'));
}

const stamp = () => new Date().toISOString().slice(0, 10);
const exportMd = () => {
  const st = S();
  return buildExport({
    profile: st.profile ? aiProfile() : null, plan: st.plan, week: st.plan ? weekInfo(st.plan) : null,
    workouts: st.workouts, routines: st.routines, exName: ctx.exName, fmtSet: ctx.fmtSet,
  });
};

/** Carga un archivo de texto en el cuadro de documento. */
export async function onContextFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const box = input.closest('.ctx')?.querySelector('textarea[data-ctxdoc]');
  if (!box) return;
  if (file.size > MAX_DOC * 4) { ctx.toast(t('El archivo es demasiado grande')); return; }
  let text = '';
  try { text = await file.text(); } catch { ctx.toast(t('No se pudo leer el archivo')); return; }
  if (text.includes('\u0000') || /^%PDF/.test(text)) { ctx.toast(t('Ese archivo no es de texto. Para PDF o fotos, adjúntalos a tu otra IA y usa el prompt')); return; }
  const merged = box.value.trim() ? `${box.value.trim()}\n\n---\n\n${text.trim()}` : text.trim();
  if (merged.length > MAX_DOC) { ctx.toast(t('Demasiado largo ({n} de {max} caracteres). Resume el archivo', { n: fmtNum(merged.length), max: fmtNum(MAX_DOC) })); return; }
  box.value = merged;
  onContextInput(box);
  ctx.toast(t('Cargado: {name}', { name: file.name }));
}

export function onContextInput(box) {
  const n = box.closest('.ctx')?.querySelector('[data-ctx-count]');
  if (!n) return;
  const len = box.value.length;
  n.textContent = `${fmtNum(len)} / ${fmtNum(MAX_DOC)}`;
  n.classList.toggle('over', len > MAX_DOC);
}

export const planActions = {
  'plan-chat-toggle'() { ui.showPlan = !ui.showPlan; },
  'chat-translate'() { ctx.setTab('plan'); ui.showPlan = false; sendChat(t('Traduce mi plan al {lang}', { lang: LANGS[getLang()] })); return false; },
  'chat-quick'(_, el) { if (!ui.loading) sendChat(QUICK[+el.dataset.q]()); return false; },
  'chat-no-translate'() { ui.noTranslate = true; },
  'ctx-copy-prompt'(_, el) { copyText(promptOtraIA(getLang()), el, t('Prompt copiado: pégalo en la otra IA')); return false; },
  'ctx-copy-export'(_, el) { copyText(exportMd(), el, t('Datos copiados en Markdown')); return false; },
  'ctx-download-export'() {
    const blob = new Blob([exportMd()], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gymonkey-datos-${stamp()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return false;
  },
  'plan-retry'() {
    const run = ui.lastRun;
    if (!run) return false;
    runAI(run.text, run.fn, { chat: run.chat });
    return false;
  },
  'plan-cancel-ai'() {
    ui.loading?.abort.abort();
    ui.lastRun = null;
    return false;
  },
  'plan-start'() { ui.step = 'form'; ui.error = null; ui.showPlan = false; },
  'plan-cancel'() { ui.step = null; ui.error = null; },
  'plan-back-form'() { ui.step = 'form'; ui.error = null; },
  'plan-all-equipment'() {
    document.querySelectorAll('input[name="equipment"]').forEach((i) => { i.checked = true; });
    return false;
  },
  'plan-view-meso'(_, el) { ui.viewMeso = +el.dataset.i; },
  'plan-dismiss-msg'() { S().plan.lastMessage = ''; S().plan.lastChanges = []; },
  'plan-apply'() {
    const plan = S().plan;
    if (!plan.startDate) plan.startDate = startOfDay(Date.now()) - (startWeek(plan) - 1) * 7 * DAY;
    applyMeso(weekInfo(plan).meso);
    ui.showPlan = false;
    ctx.setTab('train');
    ctx.toast(t('Rutinas creadas: las tienes en Entrenar'));
  },
  'plan-undo'() {
    const st = S();
    const [prev, ...rest] = st.plan.history || [];
    if (!prev) return false;
    ctx.ask(t('¿Volver a la versión anterior del plan?'), t('Deshacer'), () => {
      st.plan = { ...prev, startDate: st.plan.startDate, appliedMeso: st.plan.appliedMeso, history: rest, lastMessage: t('Has vuelto a la versión anterior del plan.'), lastChanges: [] };
      pushChat('coach', t('Has vuelto a la versión anterior del plan.'));
      if (st.plan.appliedMeso != null) applyMeso(weekInfo(st.plan).meso);
      ctx.commit();
    });
    return false;
  },
  'plan-new'() {
    ctx.ask(t('¿Crear un plan nuevo? El actual se borrará (tus rutinas y tu historial se mantienen).'), t('Crear nuevo'), () => {
      S().plan = null;
      ui.step = 'form';
      ui.error = null;
      ctx.commit();
    });
    return false;
  },
  'plan-feedback'() {
    const plan = S().plan;
    ctx.openDialog(`
      <h2>${t('Ajustar el plan')}</h2>
      ${chips('opt', FEEDBACK_OPTIONS)}
      <fieldset class="field" style="margin-top:12px"><legend>${t('Días que puedes entrenar')}</legend>${chips('days', WEEKDAYS, plan.schedule)}</fieldset>
      <label class="field" style="margin-top:12px">${t('Tiempo por sesión')}
        <select name="minutes">${options(minuteOpts(), plan.session_minutes, false)}</select>
      </label>
      <label class="field" style="margin-top:12px">${t('Comentario')}
        <textarea name="text" rows="3" placeholder="${t('Ej.: los jueves ya no puedo; me molesta la rodilla')}"></textarea>
      </label>
      <div style="margin-top:12px">${contextBlock('')}</div>
      ${ctx.dialogButtons(t('Ajustar plan'))}`,
    (fd) => {
      const opts = fd.getAll('opt');
      const days = WEEKDAYS.filter((d) => fd.getAll('days').includes(d));
      const minutes = +fd.get('minutes');
      const text = fd.get('text').trim();
      const doc = (fd.get('context_doc') || '').trim();
      if (doc.length > MAX_DOC) { ctx.toast(t('El documento supera los {max} caracteres', { max: fmtNum(MAX_DOC) })); return; }
      const daysChanged = days.join() !== plan.schedule.join();
      const minutesChanged = minutes !== plan.session_minutes;
      if (!opts.length && !text && !daysChanged && !minutesChanged && !doc) { ctx.toast(t('Indica qué quieres cambiar')); return; }
      if (!days.length) { ctx.toast(t('Elige al menos un día')); return; }
      const st = S();
      if (st.profile) {
        if (daysChanged) st.profile.days = days;
        if (minutesChanged) st.profile.minutes = minutes;
      }
      runAI(t('Adaptando tu plan…'), async (o) => {
        const r = await callAI('adapt', {
          profile: aiProfile(), plan: planForAI(plan), currentWeek: weekInfo(plan).week,
          history: trainingSummary(), library: library(), today: todayISO(), context_doc: doc, known_loads: knownLoads(S().workouts, S().exercises),
          feedback: { options: opts, days: daysChanged ? days : [], minutes: minutesChanged ? minutes : null, text },
        }, o);
        setPlan(r.plan, r.message, r.changes, true);
        pushChat('coach', r.message, r.changes);
      });
    });
    return false;
  },
  'plan-edit'() { ui.editing = structuredClone(planForAI(S().plan)); ui.editMeso = weekInfo(S().plan).meso; },
  'plan-edit-meso'(_, el) { ui.editMeso = +el.dataset.i; },
  'plan-edit-cancel'() { ui.editing = null; },
  'plan-edit-add-ex'(_, el) {
    ui.editing.mesocycles[+el.dataset.m].days[+el.dataset.d].exercises.push({
      name: '', muscle_group: 'Otros', type: 'reps', sets: 3, reps: '8-12', rir: '2', rest_seconds: 90, start_load_kg: 0, load_basis: 'estimado', notes: '', alternatives: [],
    });
  },
  'plan-edit-del-ex'(_, el) { ui.editing.mesocycles[+el.dataset.m].days[+el.dataset.d].exercises.splice(+el.dataset.x, 1); },
  'plan-edit-add-day'(_, el) {
    const m = ui.editing.mesocycles[+el.dataset.m];
    const used = m.days.map((d) => d.weekday);
    m.days.push({ name: t('Día {n}', { n: m.days.length + 1 }), weekday: WEEKDAYS.find((w) => !used.includes(w)) || 'Lunes', focus: '', estimated_minutes: 0, exercises: [] });
  },
  'plan-edit-del-day'(_, el) {
    ctx.ask(t('¿Eliminar este día del mesociclo?'), t('Eliminar'), () => {
      ui.editing.mesocycles[+el.dataset.m].days.splice(+el.dataset.d, 1);
      ctx.render();
    });
    return false;
  },
  'plan-edit-save'() {
    const p = ui.editing;
    p.mesocycles.forEach((m) => {
      m.weeks = Math.max(1, m.weeks);
      m.days.forEach((d) => { d.exercises = d.exercises.filter((x) => x.name.trim()); });
      // Mantener una entrada de guía por semana.
      while (m.weeks_plan.length < m.weeks) m.weeks_plan.push({ week: m.weeks_plan.length + 1, label: t('Semana {n}', { n: m.weeks_plan.length + 1 }), guidance: t('Sigue la progresión del bloque.'), deload: false });
      m.weeks_plan.length = m.weeks;
    });
    p.total_weeks = p.mesocycles.reduce((sum, m) => sum + m.weeks, 0);
    const cur = p.mesocycles[weekInfo(S().plan).meso] || p.mesocycles[0];
    p.days_per_week = cur.days.length;
    p.schedule = WEEKDAYS.filter((w) => cur.days.some((d) => d.weekday === w));
    ui.editing = null;
    setPlan(p, t('Has editado el plan a mano.'), [t('Edición manual')], true, S().plan.lang || 'es');
  },
};

/** Aviso del plan en la pestaña Entrenar. */
/** Datos del plan que necesita la IA para revisar la semana. */
export function planBrief() {
  const plan = S().plan;
  if (!plan) return {};
  const wi = weekInfo(plan);
  const m = wi && plan.mesocycles[wi.meso];
  return {
    title: plan.title, split: plan.split, days_per_week: plan.days_per_week, session_minutes: plan.session_minutes, total_weeks: plan.total_weeks,
    current_week: wi?.week, deload: !!wi?.wp?.deload, week_guidance: wi?.wp?.guidance || '',
    mesocycle: m ? { name: m.name, focus: m.focus, intensity: m.intensity } : null,
  };
}

export function planTrainBanner() {
  const plan = S().plan;
  if (!plan) return '';
  const tr = !ui.noTranslate && (plan.lang || 'es') !== getLang()
    ? `<div class="card accent stack"><span>${t('Tu plan está escrito en {lang}. ¿Quieres que el coach lo traduzca?', { lang: LANGS[plan.lang || 'es'] })}</span>
        <div class="row"><button class="primary small" data-action="chat-translate">${t('Traducir mi plan')}</button><button class="ghost small" data-action="chat-no-translate">${t('Ahora no')}</button></div></div>`
    : '';
  const wi = weekInfo(plan);
  if (!wi?.started) {
    return `${tr}<div class="card accent stack"><b>${t('Tu plan está listo')}</b><span class="muted">${esc(plan.title)}</span>
      <button class="primary block" data-action="plan-apply">${t('Empezar el plan')}${startWeek(plan) > 1 ? ` · ${t('semana {n}', { n: startWeek(plan) })}` : ''}</button></div>`;
  }
  if (plan.appliedMeso === wi.meso) return tr;
  return `${tr}<div class="card plan-banner"><button class="primary block" data-action="plan-apply">${t('Nuevo bloque: actualizar rutinas')}</button></div>`;
}

/** Etiqueta de la semana del plan que contiene la fecha dada: "S3/8 · Acumulación". */
export function planWeekLabel(ts) {
  const plan = S().plan;
  if (!plan?.startDate) return null;
  const wi = weekInfo(plan, ts);
  if (!wi) return null;
  if (wi.finished) return { text: t('Plan completado'), deload: false };
  const m = plan.mesocycles[wi.meso];
  return {
    text: t('Semana {w} de {total} · {name}', { w: wi.week, total: plan.total_weeks, name: m.name }),
    // Para el calendario: "Semana 2 de 12" y debajo el bloque en el que estás y lo que toca esa semana.
    head: t('Semana {w} de {total} del plan', { w: wi.week, total: plan.total_weeks }),
    block: t('{name} · semana {n} de {of}', { name: m.name, n: wi.weekInMeso, of: m.weeks }),
    tip: wi.wp?.label || '',
    deload: !!wi.wp?.deload,
  };
}
