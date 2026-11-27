// Plan de entrenamiento con IA: formulario inicial → preguntas de seguimiento →
// plan por mesociclos → aplicar a rutinas → editar a mano o ajustar con IA.

import { DEMO_AI } from './config.js';
import { MAX_DOC, PROMPT_OTRA_IA, buildExport } from './context.js';

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const GOALS = [
  ['hipertrofia', 'Ganar músculo (hipertrofia)'],
  ['fuerza', 'Ganar fuerza'],
  ['grasa', 'Perder grasa manteniendo músculo'],
  ['recomposicion', 'Recomposición corporal'],
  ['salud', 'Salud y forma general'],
  ['rendimiento', 'Rendimiento para un deporte'],
];
const LEVELS = [
  ['principiante', 'Principiante (menos de 6 meses)'],
  ['novato', 'Novato (6-12 meses)'],
  ['intermedio', 'Intermedio (1-3 años)'],
  ['avanzado', 'Avanzado (más de 3 años)'],
];
const EQUIPMENT = [
  'Barra y discos', 'Rack o jaula', 'Banco ajustable', 'Mancuernas', 'Máquinas guiadas', 'Poleas',
  'Prensa de piernas', 'Máquina Smith', 'Kettlebells', 'Barra de dominadas', 'Paralelas', 'Bandas elásticas', 'Máquinas de cardio',
];
const MINUTES = [30, 45, 60, 75, 90, 120];
const WEEKS = [4, 6, 8, 10, 12, 16];
const FEEDBACK_OPTIONS = [
  'Quiero entrenar menos días', 'Quiero entrenar más días', 'Cambiar los días de la semana',
  'Sesiones más cortas', 'Sesiones más largas', 'Tengo una molestia o lesión',
  'No tengo acceso a algún ejercicio o máquina', 'Me resulta demasiado fácil',
  'Me resulta demasiado duro / estoy muy cansado', 'Quiero priorizar un músculo', 'Cambiar ejercicios que no me gustan',
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

const ui = { step: null, loading: null, error: null, questions: null, editing: null, editMeso: 0, viewMeso: null, draft: {}, lastRun: null };
export const planBusy = () => !!ui.loading;

/* ---------- semana actual del plan ---------- */

/** Semana del plan en la que se entra (1 si se empieza de cero; más si la persona ya llevaba semanas). */
export const startWeek = (plan) => Math.max(1, Math.min(plan.total_weeks || 1, Math.round(plan.start_week) || 1));

export function weekInfo(plan) {
  if (!plan?.mesocycles?.length) return null;
  const started = !!plan.startDate;
  const raw = started ? Math.floor((startOfDay(Date.now()) - plan.startDate) / (7 * DAY)) + 1 : 1;
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
  if (auth.configured && !auth.user()) throw new Error('Inicia sesión con Google para usar la IA.');
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
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ mode, input }),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new Error(stalled ? LOST : 'No hay conexión con el servidor. Revisa tu internet y pulsa Reintentar.');
    }
    poke(); // las cabeceras llegan enseguida si el servidor envía en directo; desde aquí vigilamos el silencio
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch { /* respuesta sin JSON */ }
      throw new Error(data.error || (res.status === 404 || res.status === 405
        ? 'El servidor de IA no está disponible. La IA funciona cuando la app está publicada en Vercel.'
        : `Error del servidor (${res.status}).`));
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
      if (!result && !failure) throw new Error(LOST);
    }
    if (failure) throw new Error(failure);
    if (!result) throw new Error(LOST);
    return result;
  } finally {
    clearTimeout(idle);
  }
}

const LOST = 'Se cortó la conexión antes de terminar (pasa a veces con datos móviles). Pulsa Reintentar: tus respuestas siguen guardadas.';

/** Ejecuta una llamada larga a la IA mostrando el avance. Se puede cancelar y reintentar. */
async function runAI(text, fn) {
  const abort = new AbortController();
  ui.lastRun = { text, fn };
  ui.loading = { text, since: Date.now(), pct: 0, shown: 0, phase: 'Conectando con el entrenador…', abort };
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
    if (!abort.signal.aborted) ui.error = e.message || 'Algo salió mal.';
  } finally {
    ui.loading = null;
    ctx.commit();
  }
}

function aiProfile() {
  const { context_doc, ...p } = S().profile || {};
  return { ...p, goal: label(GOALS, p.goal), experience: label(LEVELS, p.experience) };
}
const profileDoc = () => (S().profile?.context_doc || '').trim();
const library = () => S().exercises.map((e) => e.name);
const planForAI = (plan) => Object.fromEntries(PLAN_FIELDS.map((k) => [k, plan[k]]));

function trainingSummary() {
  return S().workouts.slice(-8).map((w) => ({
    date: new Date(w.start).toISOString().slice(0, 10),
    routine: w.name,
    exercises: w.entries.map((e) => `${ctx.exName(e.exerciseId)}: ${e.sets.map((s) => ctx.fmtSet(e.exerciseId, s)).join(', ')}`),
  }));
}

/** Guarda un plan nuevo o actualizado (conservando el progreso y la versión anterior para deshacer). */
function setPlan(data, message, changes, keepProgress) {
  const st = S();
  const prev = st.plan;
  const keep = keepProgress && prev;
  const strip = ({ history, ...rest }) => rest;
  st.plan = {
    ...planForAI(data),
    id: keep ? prev.id : ctx.uid(),
    createdAt: keep ? prev.createdAt : Date.now(),
    updatedAt: Date.now(),
    startDate: keep ? prev.startDate : null,
    appliedMeso: keep ? prev.appliedMeso : null,
    lastMessage: message || '',
    lastChanges: changes || [],
    history: keep ? [strip(prev), ...(prev.history || [])].slice(0, 3) : [],
  };
  ui.viewMeso = null;
  if (keep && st.plan.appliedMeso != null) {
    applyMeso(weekInfo(st.plan).meso);
    ctx.toast('Plan actualizado y rutinas al día');
  }
}

/* ---------- aplicar el plan a las rutinas ---------- */

function findOrCreateExercise(x) {
  const st = S();
  const key = norm(x.name);
  let ex = st.exercises.find((e) => norm(e.name) === key);
  if (!ex) {
    ex = { id: ctx.uid(), name: x.name.trim(), muscle: x.muscle_group || 'Otros', type: x.type === 'time' ? 'time' : 'reps' };
    st.exercises.push(ex);
  }
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
      targets[ex.id] = { sets: x.sets, reps: x.reps, rir: x.rir, rest: x.rest_seconds, notes: x.notes, startLoad: x.start_load_kg || 0 };
    });
    st.routines.push({ id: ctx.uid(), name: d.name, exerciseIds, targets, fromPlan: true, weekday: d.weekday, planDay: { meso: mi, day: di } });
  });
  plan.appliedMeso = mi;
}

/* ---------- vistas ---------- */

const chips = (name, values, selected = [], type = 'checkbox') => `<div class="chips">${values.map((v) => `
  <label class="chip"><input type="${type}" name="${name}" value="${esc(v)}" ${selected.includes(v) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
const options = (list, sel) => list.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`).join('');

export function viewPlan() {
  if (ui.loading) {
    return `<div class="card ai-loading" role="status">
      <h3>${esc(ui.loading.text)}</h3>
      <div class="progress" aria-hidden="true"><i id="ai-bar" style="width:${Math.round(ui.loading.shown)}%"></i></div>
      <div class="row between"><span id="ai-phase" class="phase">${esc(ui.loading.phase)}</span><b id="ai-pct" class="timer">${Math.round(ui.loading.shown)} %</b></div>
      <div class="row between small-line muted"><span>⏱ <b id="ai-elapsed" class="timer">0:00</b></span><span>Mantén la pantalla abierta</span></div>
      <button class="ghost block" style="margin-top:8px" data-action="plan-cancel-ai">Cancelar</button>
    </div>`;
  }
  const err = ui.error ? `<div class="card error" role="alert"><p style="margin:0 0 8px">⚠️ ${esc(ui.error)}</p>${ui.lastRun ? '<button class="primary" data-action="plan-retry">Reintentar</button>' : ''}</div>` : '';
  const login = ctx.auth.configured && !ctx.auth.user()
    ? `<div class="card"><button class="primary block" data-action="sign-in">Iniciar sesión con Google</button><p class="muted" style="margin:8px 0 0;text-align:center">Para usar la IA y guardar tus datos</p></div>`
    : '';
  const demo = DEMO_AI ? '<div class="card demo-note">🧪 <b>Modo demo</b> · la IA está simulada</div>' : '';
  if (ui.step === 'form') return err + demo + login + formView();
  if (ui.step === 'questions') return err + demo + questionsView();
  if (!S().plan && !ui.editing) return err + demo + login + introView();
  if (ui.editing) return err + editView();
  return err + planView(S().plan);
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

function introView() {
  return `
    <div class="card intro">
      <div class="big">🧠</div>
      <h2>Tu plan con IA</h2>
      <p class="muted">Un cuestionario corto y recibes un plan por mesociclos.</p>
      <button class="primary block" data-action="plan-start">Crear mi plan</button>
    </div>`;
}

/** Bloque "adjuntar mi plan o notas": archivo, texto pegado y prompt para otra IA. */
function contextBlock(value = '', open = false) {
  return `
    <details class="ctx" ${open || value ? 'open' : ''}>
      <summary><b>📎 Adjuntar plan o notas</b></summary>
      <div class="row wrap" style="margin-top:8px">
        <label class="file-btn"><input type="file" data-ctx-file accept=".md,.markdown,.txt,.csv,.json,text/*"><span>📄 Archivo</span></label>
        <button type="button" class="small" data-action="ctx-copy-prompt">📋 Prompt para otra IA</button>
        <button type="button" class="small" data-action="ctx-copy-export">📤 Mis datos</button>
        <button type="button" class="small" data-action="ctx-download-export">⬇️ .md</button>
      </div>
      <textarea name="context_doc" data-ctxdoc rows="5" placeholder="Pega aquí tu plan o notas…">${esc(value)}</textarea>
      <div class="ctx-tools">
        <div class="row between small-line muted"><span>🔒 Se envía a la IA · sin datos personales</span><span data-ctx-count>${value.length.toLocaleString('es')} / ${MAX_DOC.toLocaleString('es')}</span></div>
        <details class="how"><summary>¿Cómo funciona?</summary>
          <ol class="muted ctx-steps">
            <li>Abre tu otra IA en la conversación que ya tiene tu historial.</li>
            <li>Pega el prompt y envíalo: te devolverá un resumen en Markdown.</li>
            <li>Pégalo aquí o súbelo como .md.</li>
          </ol>
          <p class="muted" style="margin:6px 0 0">¿Plan en PDF o foto? Adjúntalo en ese mismo mensaje. Las sesiones con fecha se importan desde <b>Historial</b>.</p>
        </details>
      </div>
    </details>`;
}

function formView() {
  const p = S().profile || {};
  return `
    <form data-form="plan-profile" class="card stack">
      <h2>Cuéntanos sobre ti</h2>
      <label class="field">Objetivo principal<select name="goal">${options(GOALS, p.goal || 'hipertrofia')}</select></label>
      <label class="field">Experiencia con pesas<select name="experience">${options(LEVELS, p.experience || 'novato')}</select></label>
      <fieldset class="field"><legend>¿Qué días puedes entrenar?</legend>${chips('days', WEEKDAYS, p.days || ['Lunes', 'Miércoles', 'Viernes'])}</fieldset>
      <div class="grid2">
        <label class="field">Tiempo por sesión<select name="minutes">${options(MINUTES.map((m) => [m, `${m} min`]), p.minutes || 60)}</select></label>
        <label class="field">Duración del plan<select name="weeks">${options(WEEKS.map((w) => [w, `${w} semanas`]), p.weeks || 12)}</select></label>
      </div>
      <fieldset class="field"><legend>Material disponible <button type="button" class="ghost small" data-action="plan-all-equipment">Gimnasio completo</button></legend>
        ${chips('equipment', EQUIPMENT, p.equipment || EQUIPMENT)}
      </fieldset>
      <div class="grid2">
        <label class="field">Edad (opcional)<input name="age" inputmode="numeric" value="${esc(p.age || '')}"></label>
        <label class="field">Sexo (opcional)<select name="sex">${options([['', 'Prefiero no decirlo'], ['Mujer', 'Mujer'], ['Hombre', 'Hombre']], p.sex || '')}</select></label>
      </div>
      <label class="field">Tus marcas actuales (opcional)<textarea name="reference_lifts" rows="2" placeholder="Press banca 60 kg × 8, sentadilla 80 kg × 6">${esc(p.reference_lifts || '')}</textarea></label>
      <label class="field">Lesiones, molestias o limitaciones<textarea name="injuries" rows="2" placeholder="Ej.: dolor lumbar ocasional">${esc(p.injuries || '')}</textarea></label>
      <label class="field">Músculos o aspectos a priorizar<textarea name="priorities" rows="2" placeholder="Ej.: glúteos, espalda">${esc(p.priorities || '')}</textarea></label>
      <label class="field">Preferencias<textarea name="preferences" rows="2" placeholder="Ejercicios que te gustan o evitas">${esc(p.preferences || '')}</textarea></label>
      ${contextBlock(p.context_doc || '')}
      <button class="primary block">Siguiente</button>
      <button type="button" class="ghost block" data-action="plan-cancel">Cancelar</button>
    </form>`;
}

function questionsView() {
  const q = ui.questions || { intro: '', questions: [] };
  return `
    <form data-form="plan-questions" class="stack">
      <div class="card"><p style="margin:0">${esc(q.intro || 'Unas preguntas más para afinar tu plan:')}</p></div>
      ${q.questions.map((x, i) => `
        <div class="card">
          <b>${esc(x.question)}</b>
          <details class="why"><summary>¿Por qué?</summary><p class="muted" style="margin:4px 0 0">${esc(x.why)}</p></details>
          ${chips(`q_${i}`, x.options, [ui.draft[`q_${i}`]].filter(Boolean), 'radio')}
          <input name="q_${i}_other" placeholder="Otra respuesta (opcional)" value="${esc(ui.draft[`q_${i}_other`] || '')}" style="margin-top:8px">
        </div>`).join('')}
      <button class="primary block">Generar mi plan</button>
      <button type="button" class="ghost block" data-action="plan-back-form">Volver al cuestionario</button>
    </form>`;
}

function exerciseTable(d) {
  return `<table class="plan-table">
    <thead><tr><th>Ejercicio</th><th>Series</th><th>RIR</th><th>Desc.</th></tr></thead>
    <tbody>${d.exercises.map((x) => `
      <tr>
        <td><b>${esc(x.name)}</b>${x.notes ? `<small>${esc(x.notes)}</small>` : ''}${x.alternatives?.length ? `<small class="alt">Alternativas: ${esc(x.alternatives.join(', '))}</small>` : ''}</td>
        <td>${x.sets}×${esc(x.reps)}${x.type === 'time' ? ' s' : ''}</td>
        <td>${esc(x.rir)}</td>
        <td>${ctx.fmtSecs(x.rest_seconds)}</td>
      </tr>`).join('')}</tbody>
  </table>`;
}

function planView(plan) {
  const wi = weekInfo(plan);
  const mi = ui.viewMeso ?? wi.meso;
  const meso = plan.mesocycles[mi];
  const pct = Math.round(((wi.started ? wi.week - (wi.finished ? 0 : 1) : 0) / plan.total_weeks) * 100);

  const progress = !wi.started
    ? `<div class="card accent">
        <button class="primary block" data-action="plan-apply">Empezar el plan${startWeek(plan) > 1 ? ` · semana ${startWeek(plan)}` : ''}</button>
        <p class="muted" style="margin:6px 0 0;text-align:center">Crea tus rutinas de entrenamiento</p>
      </div>`
    : `<div class="card">
        <div class="row between"><h3>Semana ${wi.week} de ${plan.total_weeks}</h3>${wi.wp?.deload ? '<span class="pill">Descarga</span>' : ''}</div>
        <div class="bar light"><i style="width:${pct}%"></i></div>
        <p style="margin:8px 0 0"><b>${esc(plan.mesocycles[wi.meso].name)}</b>${wi.wp ? ` · ${esc(wi.wp.guidance)}` : ''}</p>
        ${wi.finished ? '<p class="muted">🎉 Plan completado</p>' : ''}
        ${plan.appliedMeso !== wi.meso ? `<button class="primary block" style="margin-top:10px" data-action="plan-apply">Actualizar rutinas · ${esc(plan.mesocycles[wi.meso].name)}</button>` : ''}
      </div>`;

  const changes = plan.lastMessage || plan.lastChanges?.length
    ? `<div class="card">
        <p style="margin-top:0">💬 ${esc(plan.lastMessage)}</p>
        ${plan.lastChanges?.length ? `<ul class="changes">${plan.lastChanges.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        <div class="row">
          ${plan.history?.length ? '<button class="small" data-action="plan-undo">↩ Deshacer cambios</button>' : ''}
          <button class="small ghost" data-action="plan-dismiss-msg">Ocultar</button>
        </div>
      </div>`
    : '';

  return `
    <div class="card">
      <h2 style="margin:0 0 8px">${esc(plan.title)}</h2>
      <div class="tags">
        <span class="pill">${esc(plan.split)}</span>
        <span class="pill">${plan.days_per_week} días</span>
        <span class="pill">${plan.session_minutes} min</span>
        <span class="pill">${plan.total_weeks} sem</span>
        <span class="pill">📅 ${esc(plan.schedule.map((d) => d.slice(0, 3)).join(' · '))}</span>
      </div>
      <details class="how"><summary>Resumen</summary><p style="margin:6px 0 0">${esc(plan.summary)}</p></details>
    </div>
    ${changes}
    ${progress}
    <div class="row wrap">
      <button class="primary" data-action="plan-feedback">💬 Ajustar con IA</button>
      <button data-action="plan-edit">✏️ Editar</button>
      <button class="ghost danger" data-action="plan-new">Nuevo plan</button>
    </div>

    <h2 style="margin-top:20px">Mesociclos</h2>
    <div class="seg">${plan.mesocycles.map((m, i) => `<button class="${i === mi ? 'on' : ''}" data-action="plan-view-meso" data-i="${i}">${i + 1}. ${esc(m.name)}<small>${m.weeks} sem</small></button>`).join('')}</div>
    <div class="card">
      <h3>${esc(meso.name)} · ${meso.weeks} sem</h3>
      <p class="muted" style="margin:2px 0 0">${esc(meso.focus)} · ${esc(meso.intensity)}</p>
      <details class="how"><summary>Semana a semana</summary>
        <p style="margin:6px 0">${esc(meso.description)}</p>
        <ol class="weeks">${meso.weeks_plan.map((w) => `<li class="${w.deload ? 'deload' : ''}"><b>${esc(w.label)}</b> — ${esc(w.guidance)}</li>`).join('')}</ol>
      </details>
    </div>
    ${meso.days.map((d) => `
      <div class="card">
        <div class="row between"><h3>${esc(d.name)}</h3><span class="pill">${esc(d.weekday)}</span></div>
        <p class="muted" style="margin:2px 0 4px">${esc(d.focus)} · ~${d.estimated_minutes} min</p>
        ${exerciseTable(d)}
      </div>`).join('')}

    <details class="card"><summary><b>🔬 En qué se basa este plan</b></summary>
      <ul class="principles">${plan.principles.map((p) => `<li><b>${esc(p.title)}.</b> ${esc(p.detail)} <span class="muted">(${esc(p.source)})</span></li>`).join('')}</ul>
    </details>
    <details class="card"><summary><b>📈 Cómo progresar</b></summary>
      <ul>${plan.progression_rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p><b>Calentamiento:</b> ${esc(plan.warmup)}</p>
    </details>
    <details class="card"><summary><b>📝 Notas</b></summary>
      ${plan.notes?.length ? `<ul>${plan.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <p class="muted small-print">Plan orientativo generado por IA. No sustituye a un profesional sanitario o a un entrenador; si sientes dolor, para y consulta.</p>
    </details>`;
}

function editView() {
  const p = ui.editing;
  const mi = Math.min(ui.editMeso, p.mesocycles.length - 1);
  const m = p.mesocycles[mi];
  const lib = S().exercises.map((e) => `<option value="${esc(e.name)}">`).join('');
  const wd = (sel) => WEEKDAYS.map((w) => `<option ${w === sel ? 'selected' : ''}>${w}</option>`).join('');
  return `
    <div class="card row between sticky-top">
      <h3>Editando el plan</h3>
      <div class="row"><button data-action="plan-edit-cancel">Cancelar</button><button class="primary" data-action="plan-edit-save">Guardar</button></div>
    </div>
    <datalist id="ex-library">${lib}</datalist>
    <div class="seg">${p.mesocycles.map((x, i) => `<button class="${i === mi ? 'on' : ''}" data-action="plan-edit-meso" data-i="${i}">${i + 1}. ${esc(x.name)}</button>`).join('')}</div>
    <div class="card grid2">
      <label class="field">Nombre del mesociclo<input data-edit="m.${mi}.name" value="${esc(m.name)}"></label>
      <label class="field">Semanas<input data-edit="m.${mi}.weeks" inputmode="numeric" value="${m.weeks}"></label>
    </div>
    ${m.days.map((d, di) => `
      <div class="card">
        <div class="grid2">
          <label class="field">Día<input data-edit="d.${mi}.${di}.name" value="${esc(d.name)}"></label>
          <label class="field">Día de la semana<select data-edit="d.${mi}.${di}.weekday">${wd(d.weekday)}</select></label>
        </div>
        <table class="edit-table">
          <thead><tr><th>Ejercicio</th><th>Series</th><th>Reps</th><th>RIR</th><th>Desc. (s)</th><th></th></tr></thead>
          <tbody>${d.exercises.map((x, xi) => `
            <tr>
              <td><input list="ex-library" data-edit="x.${mi}.${di}.${xi}.name" value="${esc(x.name)}" aria-label="Ejercicio"></td>
              <td><input inputmode="numeric" data-edit="x.${mi}.${di}.${xi}.sets" value="${x.sets}" aria-label="Series"></td>
              <td><input data-edit="x.${mi}.${di}.${xi}.reps" value="${esc(x.reps)}" aria-label="Repeticiones"></td>
              <td><input data-edit="x.${mi}.${di}.${xi}.rir" value="${esc(x.rir)}" aria-label="RIR"></td>
              <td><input inputmode="numeric" data-edit="x.${mi}.${di}.${xi}.rest_seconds" value="${x.rest_seconds}" aria-label="Descanso en segundos"></td>
              <td><button class="ghost danger" data-action="plan-edit-del-ex" data-m="${mi}" data-d="${di}" data-x="${xi}" aria-label="Quitar ejercicio">✕</button></td>
            </tr>`).join('')}</tbody>
        </table>
        <div class="row" style="margin-top:8px">
          <button class="block" data-action="plan-edit-add-ex" data-m="${mi}" data-d="${di}">+ Ejercicio</button>
          <button class="ghost danger" data-action="plan-edit-del-day" data-m="${mi}" data-d="${di}">Eliminar día</button>
        </div>
      </div>`).join('')}
    <button class="block" data-action="plan-edit-add-day" data-m="${mi}">+ Añadir día</button>`;
}

/* ---------- formularios y campos ---------- */

export function onPlanSubmit(form) {
  const fd = new FormData(form);
  const st = S();
  if (form.dataset.form === 'plan-profile') {
    const profile = {
      goal: fd.get('goal'), experience: fd.get('experience'),
      days: WEEKDAYS.filter((d) => fd.getAll('days').includes(d)),
      minutes: +fd.get('minutes'), weeks: +fd.get('weeks'),
      equipment: fd.getAll('equipment'),
      age: fd.get('age').trim(), sex: fd.get('sex'), reference_lifts: fd.get('reference_lifts').trim(),
      context_doc: (fd.get('context_doc') || '').trim(),
      injuries: fd.get('injuries').trim(), priorities: fd.get('priorities').trim(), preferences: fd.get('preferences').trim(),
    };
    st.profile = profile;
    ctx.save();
    if (!profile.days.length) { ui.error = 'Elige al menos un día de entreno.'; ctx.render(); return; }
    if (!profile.equipment.length) { ui.error = 'Marca el material que tienes disponible.'; ctx.render(); return; }
    if (profile.context_doc.length > MAX_DOC) { ui.error = `El documento adjunto supera los ${MAX_DOC.toLocaleString('es')} caracteres. Resume lo más importante y vuelve a intentarlo.`; ctx.render(); return; }
    ui.draft = {};
    runAI('Pensando qué preguntarte…', async (o) => {
      ui.questions = await callAI('questions', { profile: aiProfile(), context_doc: profileDoc() }, o);
      ui.step = 'questions';
    });
  } else if (form.dataset.form === 'plan-questions') {
    const answers = (ui.questions?.questions || []).map((q, i) => ({
      question: q.question,
      answer: (fd.get(`q_${i}_other`) || '').trim() || fd.get(`q_${i}`) || 'Sin respuesta',
    }));
    ui.draft = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string'));
    runAI('Diseñando tu plan por mesociclos…', async (o) => {
      const r = await callAI('generate', { profile: aiProfile(), answers, library: library(), today: todayISO(), context_doc: profileDoc() }, o);
      setPlan(r.plan, r.message, [], false);
      ui.step = null;
      ctx.toast('¡Tu plan está listo!');
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
  ctx.toast('Selecciona el texto y cópialo');
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
  if (file.size > MAX_DOC * 4) { ctx.toast('El archivo es demasiado grande'); return; }
  let text = '';
  try { text = await file.text(); } catch { ctx.toast('No se pudo leer el archivo'); return; }
  if (text.includes('\u0000') || /^%PDF/.test(text)) { ctx.toast('Ese archivo no es de texto. Para PDF o fotos, adjúntalos a tu otra IA y usa el prompt'); return; }
  const merged = box.value.trim() ? `${box.value.trim()}\n\n---\n\n${text.trim()}` : text.trim();
  if (merged.length > MAX_DOC) { ctx.toast(`Demasiado largo (${merged.length.toLocaleString('es')} de ${MAX_DOC.toLocaleString('es')} caracteres). Resume el archivo`); return; }
  box.value = merged;
  onContextInput(box);
  ctx.toast(`Cargado: ${file.name}`);
}

export function onContextInput(box) {
  const n = box.closest('.ctx')?.querySelector('[data-ctx-count]');
  if (!n) return;
  const len = box.value.length;
  n.textContent = `${len.toLocaleString('es')} / ${MAX_DOC.toLocaleString('es')}`;
  n.classList.toggle('over', len > MAX_DOC);
}

export const planActions = {
  'ctx-copy-prompt'(_, el) { copyText(PROMPT_OTRA_IA, el, 'Prompt copiado: pégalo en la otra IA'); return false; },
  'ctx-copy-export'(_, el) { copyText(exportMd(), el, 'Datos copiados en Markdown'); return false; },
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
    runAI(run.text, run.fn);
    return false;
  },
  'plan-cancel-ai'() {
    ui.loading?.abort.abort();
    ui.lastRun = null;
    return false;
  },
  'plan-start'() { ui.step = 'form'; ui.error = null; },
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
    ctx.toast('Rutinas creadas: las tienes en Entrenar');
  },
  'plan-undo'() {
    const st = S();
    const [prev, ...rest] = st.plan.history || [];
    if (!prev) return false;
    ctx.ask('¿Volver a la versión anterior del plan?', 'Deshacer', () => {
      st.plan = { ...prev, startDate: st.plan.startDate, appliedMeso: st.plan.appliedMeso, history: rest, lastMessage: 'Has vuelto a la versión anterior del plan.', lastChanges: [] };
      if (st.plan.appliedMeso != null) applyMeso(weekInfo(st.plan).meso);
      ctx.commit();
    });
    return false;
  },
  'plan-new'() {
    ctx.ask('¿Crear un plan nuevo? El actual se borrará (tus rutinas y tu historial se mantienen).', 'Crear nuevo', () => {
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
      <h2>Ajustar el plan</h2>
      ${chips('opt', FEEDBACK_OPTIONS)}
      <fieldset class="field" style="margin-top:12px"><legend>Días que puedes entrenar</legend>${chips('days', WEEKDAYS, plan.schedule)}</fieldset>
      <label class="field" style="margin-top:12px">Tiempo por sesión
        <select name="minutes">${options(MINUTES.map((m) => [m, `${m} min`]), plan.session_minutes)}</select>
      </label>
      <label class="field" style="margin-top:12px">Comentario
        <textarea name="text" rows="3" placeholder="Ej.: los jueves ya no puedo; me molesta la rodilla"></textarea>
      </label>
      <div style="margin-top:12px">${contextBlock('')}</div>
      ${ctx.dialogButtons('Ajustar plan')}`,
    (fd) => {
      const opts = fd.getAll('opt');
      const days = WEEKDAYS.filter((d) => fd.getAll('days').includes(d));
      const minutes = +fd.get('minutes');
      const text = fd.get('text').trim();
      const doc = (fd.get('context_doc') || '').trim();
      if (doc.length > MAX_DOC) { ctx.toast(`El documento supera los ${MAX_DOC.toLocaleString('es')} caracteres`); return; }
      const daysChanged = days.join() !== plan.schedule.join();
      const minutesChanged = minutes !== plan.session_minutes;
      if (!opts.length && !text && !daysChanged && !minutesChanged && !doc) { ctx.toast('Indica qué quieres cambiar'); return; }
      if (!days.length) { ctx.toast('Elige al menos un día'); return; }
      const st = S();
      if (st.profile) {
        if (daysChanged) st.profile.days = days;
        if (minutesChanged) st.profile.minutes = minutes;
      }
      runAI('Adaptando tu plan…', async (o) => {
        const r = await callAI('adapt', {
          profile: aiProfile(), plan: planForAI(plan), currentWeek: weekInfo(plan).week,
          history: trainingSummary(), library: library(), today: todayISO(), context_doc: doc,
          feedback: { options: opts, days: daysChanged ? days : [], minutes: minutesChanged ? minutes : null, text },
        }, o);
        setPlan(r.plan, r.message, r.changes, true);
      });
    });
    return false;
  },
  'plan-edit'() { ui.editing = structuredClone(planForAI(S().plan)); ui.editMeso = weekInfo(S().plan).meso; },
  'plan-edit-meso'(_, el) { ui.editMeso = +el.dataset.i; },
  'plan-edit-cancel'() { ui.editing = null; },
  'plan-edit-add-ex'(_, el) {
    ui.editing.mesocycles[+el.dataset.m].days[+el.dataset.d].exercises.push({
      name: '', muscle_group: 'Otros', type: 'reps', sets: 3, reps: '8-12', rir: '2', rest_seconds: 90, start_load_kg: 0, notes: '', alternatives: [],
    });
  },
  'plan-edit-del-ex'(_, el) { ui.editing.mesocycles[+el.dataset.m].days[+el.dataset.d].exercises.splice(+el.dataset.x, 1); },
  'plan-edit-add-day'(_, el) {
    const m = ui.editing.mesocycles[+el.dataset.m];
    const used = m.days.map((d) => d.weekday);
    m.days.push({ name: `Día ${m.days.length + 1}`, weekday: WEEKDAYS.find((w) => !used.includes(w)) || 'Lunes', focus: '', estimated_minutes: 0, exercises: [] });
  },
  'plan-edit-del-day'(_, el) {
    ctx.ask('¿Eliminar este día del mesociclo?', 'Eliminar', () => {
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
      while (m.weeks_plan.length < m.weeks) m.weeks_plan.push({ week: m.weeks_plan.length + 1, label: `Semana ${m.weeks_plan.length + 1}`, guidance: 'Sigue la progresión del bloque.', deload: false });
      m.weeks_plan.length = m.weeks;
    });
    p.total_weeks = p.mesocycles.reduce((t, m) => t + m.weeks, 0);
    const cur = p.mesocycles[weekInfo(S().plan).meso] || p.mesocycles[0];
    p.days_per_week = cur.days.length;
    p.schedule = WEEKDAYS.filter((w) => cur.days.some((d) => d.weekday === w));
    ui.editing = null;
    setPlan(p, 'Has editado el plan a mano.', ['Edición manual'], true);
  },
};

/** Aviso del plan en la pestaña Entrenar. */
export function planTrainBanner() {
  const plan = S().plan;
  const wi = weekInfo(plan);
  if (!wi?.started) return '';
  const needsUpdate = plan.appliedMeso !== wi.meso;
  return `
    <div class="card plan-banner">
      <div class="row between"><b>Semana ${wi.week}/${plan.total_weeks} · ${esc(plan.mesocycles[wi.meso].name)}</b>${wi.wp?.deload ? '<span class="pill">Descarga</span>' : ''}</div>
      ${needsUpdate ? `<button class="primary block" style="margin-top:8px" data-action="plan-apply">Actualizar rutinas</button>` : ''}
    </div>`;
}
