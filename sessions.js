// Registrar un entreno hablando o escribiendo, e importar sesiones antiguas de un documento.
// Flujo: texto o dictado → la IA lo ordena en sesiones → revisión (con preguntas si falta algo) → guardar.

import { callAI } from './plan.js';
import { MAX_DOC } from './context.js';

let ctx;
export function initSessions(c) { ctx = c; }
const S = () => ctx.state();
const esc = (s) => ctx.esc(s);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fromISO = (iso) => new Date(`${iso}T12:00:00`).getTime();
const validISO = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && !Number.isNaN(fromISO(iso));

const sv = {
  active: false, step: 'input', kind: 'voice', target: 'new',
  text: '', draft: null, message: '', questions: [], include: [],
  loading: null, error: null, lastRun: null, listening: false,
};

export const sessionsActive = () => sv.active;
export const sessionsBusy = () => !!sv.loading;

/* ---------- abrir y cerrar ---------- */

function open(kind, target) {
  Object.assign(sv, { active: true, step: 'input', kind, target, text: '', draft: null, message: '', questions: [], include: [], loading: null, error: null, lastRun: null });
  ctx.render();
  window.scrollTo(0, 0);
}

function close() {
  stopMic();
  sv.loading?.abort.abort();
  Object.assign(sv, { active: false, loading: null, draft: null, lastRun: null, error: null });
}

/** Al cambiar de pestaña: si hay un borrador sin guardar, se pregunta antes de perderlo. */
export function sessionsLeave(next) {
  if (sv.step === 'review' && sv.draft && !sv.loading) {
    ctx.ask('¿Salir sin guardar? Se perderá lo que acabas de ordenar.', 'Salir', () => { close(); next(); });
    return;
  }
  close();
  next();
}

/* ---------- dictado por voz (Web Speech API del navegador) ---------- */

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
let rec = null;

function micUI() {
  const b = document.getElementById('sv-mic');
  if (b) b.textContent = sv.listening ? '⏹ Parar' : '🎙️ Dictar';
  const st = document.getElementById('sv-status');
  if (st && !sv.listening) st.textContent = '';
}

function stopMic() {
  sv.listening = false;
  try { rec?.stop(); } catch { /* ya parado */ }
  rec = null;
  micUI();
}

function startMic() {
  if (!SR) { ctx.toast('Tu navegador no ofrece dictado aquí: usa el micrófono de tu teclado'); return; }
  const box = document.getElementById('sv-text');
  if (!box) return;
  rec = new SR();
  rec.lang = /^es/i.test(navigator.language || '') ? navigator.language : 'es-ES';
  rec.interimResults = true;
  // Una frase por reconocimiento y se vuelve a arrancar al terminar: evita las repeticiones de palabras del modo continuo en Android.
  rec.continuous = false;
  rec.onresult = (ev) => {
    let fin = '', interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) fin += `${r[0].transcript} `; else interim += r[0].transcript;
    }
    if (fin) {
      sv.text = `${sv.text.trim()} ${fin.trim()}`.trim();
      box.value = sv.text;
      countUI(box);
    }
    const st = document.getElementById('sv-status');
    if (st) st.textContent = interim ? `… ${interim}` : 'Escuchando…';
  };
  rec.onerror = (ev) => {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { ctx.toast('Permiso de micrófono denegado: actívalo en los ajustes del navegador'); stopMic(); }
    else if (ev.error === 'audio-capture') { ctx.toast('No se encuentra el micrófono'); stopMic(); }
    else if (ev.error === 'network') { ctx.toast('Sin conexión para transcribir el dictado'); stopMic(); }
    // "no-speech" y "aborted" son normales: se reintenta al terminar.
  };
  rec.onend = () => {
    if (sv.listening) { setTimeout(() => { try { rec?.start(); } catch { stopMic(); } }, 150); } else micUI();
  };
  sv.listening = true;
  try { rec.start(); } catch { stopMic(); return; }
  micUI();
  const st = document.getElementById('sv-status');
  if (st) st.textContent = 'Escuchando…';
}

/* ---------- llamadas a la IA ---------- */

async function run(text, fn) {
  stopMic();
  const abort = new AbortController();
  sv.lastRun = { text, fn };
  sv.loading = { text, since: Date.now(), pct: 0, shown: 0, phase: 'Conectando con el asistente…', abort };
  sv.error = null;
  ctx.render();
  const onProgress = (p) => {
    if (!sv.loading) return;
    sv.loading.pct = Math.max(sv.loading.pct, p.pct);
    sv.loading.phase = p.phase;
    sessionsTick();
  };
  try {
    await fn({ signal: abort.signal, onProgress });
    sv.lastRun = null;
  } catch (e) {
    if (!abort.signal.aborted) sv.error = e.message || 'Algo salió mal.';
  } finally {
    sv.loading = null;
    ctx.render();
  }
}

const baseInput = () => ({ text: sv.text, source: sv.kind === 'import' ? 'documento' : 'voz', today: isoLocal(Date.now()), library: S().exercises.map((e) => e.name) });

function setDraft(r) {
  sv.draft = { sessions: r.sessions || [] };
  sv.message = r.message || '';
  sv.questions = r.questions || [];
  sv.step = 'review';
  sv.include = sv.draft.sessions.map((s) => s.entries.length > 0 && !isDup(s));
}

export function sessionsTick() {
  const l = sv.loading;
  if (!l) return;
  const secs = Math.floor((Date.now() - l.since) / 1000);
  const target = l.pct > 4 ? l.pct : Math.min(4, secs / 15);
  l.shown += (target - l.shown) * 0.35;
  if (Math.abs(target - l.shown) < 0.2) l.shown = target;
  const set = (id, fn) => { const n = document.getElementById(id); if (n) fn(n); };
  set('sv-elapsed', (n) => { n.textContent = ctx.fmtSecs(secs); });
  set('sv-bar', (n) => { n.style.width = `${l.shown.toFixed(1)}%`; });
  set('sv-pct', (n) => { n.textContent = `${Math.round(l.shown)} %`; });
  set('sv-phase', (n) => { if (n.textContent !== l.phase) n.textContent = l.phase; });
}

/* ---------- duplicados ---------- */

const sigOf = (date, entries) => `${date}|${entries.map(({ name, sets }) => `${norm(name)}:${sets.map(([w, r]) => `${w}x${r}`).join(',')}`).join(';')}`;
const draftSig = (s) => sigOf(s.date, s.entries.map((e) => ({ name: e.exercise, sets: e.sets.map((t) => [num(t.weight_kg), num(t.reps)]) })));
function existingSigs() {
  const st = S();
  const name = (id) => st.exercises.find((e) => e.id === id)?.name || '';
  return new Set(st.workouts.map((w) => sigOf(isoLocal(w.start), w.entries.map((e) => ({ name: name(e.exerciseId), sets: e.sets.filter((t) => t.done).map((t) => [num(t.w), num(t.r)]) })))));
}
const isDup = (s) => !!s.date && existingSigs().has(draftSig(s));

/* ---------- vistas ---------- */

export function viewSessions() {
  if (sv.loading) return loadingView();
  const err = sv.error
    ? `<div class="card error" role="alert"><p style="margin:0 0 8px">⚠️ ${esc(sv.error)}</p>${sv.lastRun ? '<button class="primary" data-action="sv-retry">Reintentar</button>' : ''}</div>`
    : '';
  return err + (sv.step === 'review' ? reviewView() : inputView());
}

function loadingView() {
  const l = sv.loading;
  return `<div class="card ai-loading" role="status">
    <h3>${esc(l.text)}</h3>
    <div class="progress" aria-hidden="true"><i id="sv-bar" style="width:${Math.round(l.shown)}%"></i></div>
    <div class="row between"><span id="sv-phase" class="phase">${esc(l.phase)}</span><b id="sv-pct" class="timer">${Math.round(l.shown)} %</b></div>
    <p class="muted" style="margin:10px 0 0">Llevas <b id="sv-elapsed" class="timer">0:00</b>. Suele tardar menos de un minuto. Mantén esta pantalla abierta.</p>
    <button class="ghost block" style="margin-top:8px" data-action="sv-cancel-ai">Cancelar</button>
  </div>`;
}

function inputView() {
  const imp = sv.kind === 'import';
  const title = imp ? 'Importar historial' : sv.target === 'active' ? 'Dictar series' : 'Registrar un entreno';
  const desc = imp
    ? 'Pega o sube el resumen de tu otra IA (o cualquier historial con fechas). Detectaré las sesiones y las añadiré a tu historial. Las que ya tengas no se duplican.'
    : sv.target === 'active'
      ? 'Cuéntame lo que llevas hecho y lo pasaré a tu entreno en curso. Si falta algo, te lo preguntaré antes de guardar.'
      : 'Cuéntame lo que hiciste, como se lo dirías a un amigo: ejercicios, pesos, series y repeticiones, y si alternaste algunos. Puedes decir cuándo fue ("ayer", "el lunes"). Si falta algo, te lo preguntaré antes de guardar.';
  const tools = imp
    ? `<div class="row wrap">
        <label class="file-btn"><input type="file" data-sv-file accept=".md,.markdown,.txt,.csv,.json,text/*"><span>📄 Subir archivo</span></label>
        <button type="button" class="small" data-action="ctx-copy-prompt">📋 Copiar prompt para otra IA</button>
      </div>`
    : `<div class="row"><button class="primary" id="sv-mic" data-action="sv-mic">${sv.listening ? '⏹ Parar' : '🎙️ Dictar'}</button><span class="muted" id="sv-status"></span></div>
       <p class="muted" style="margin:0;font-size:0.8rem">${SR ? 'El dictado lo hace tu navegador (Chrome envía el audio a Google para transcribirlo). También puedes usar el micrófono de tu teclado.' : 'Tu navegador no ofrece dictado aquí: usa el micrófono de tu teclado.'}</p>`;
  return `
    <div class="card stack">
      <h2 style="margin:0">${title}</h2>
      <p class="muted" style="margin:0">${desc}</p>
      ${tools}
      <textarea id="sv-text" data-svtext rows="${imp ? 10 : 8}" placeholder="${imp ? 'Pega aquí tu historial…' : 'Ej.: Hoy hice sentadilla 4 series de 6 con 80 kilos, alternando con landmine 3 series de 10 con 25. Después press militar 3 por 8 con 35…'}">${esc(sv.text)}</textarea>
      <div class="ctx-count muted" data-sv-count>${sv.text.length.toLocaleString('es')} / ${MAX_DOC.toLocaleString('es')} caracteres</div>
      <button class="primary block" data-action="sv-parse">${imp ? 'Leer y ordenar' : 'Ordenar mi sesión'}</button>
      <button class="ghost block" data-action="sv-cancel">Cancelar</button>
    </div>`;
}

const incompleteOf = (s) => s.entries.reduce((t, e) => t + e.sets.filter((x) => !x.complete).length, 0);

function reviewView() {
  const d = sv.draft;
  const many = d.sessions.length > 1;
  const sessions = d.sessions.map((s, i) => {
    const dup = isDup(s);
    const inc = incompleteOf(s);
    const sets = s.entries.reduce((t, e) => t + e.sets.length, 0);
    const letters = [...new Set(s.entries.map((e) => e.block).filter(Boolean))];
    return `
      <details class="card sess" ${many ? '' : 'open'}>
        <summary>
          <label class="sess-head"><input type="checkbox" data-sv-inc="${i}" ${sv.include[i] ? 'checked' : ''}>
            <span><b>${esc(s.date || 'Sin fecha')}</b> · ${esc(s.name || 'Entreno')}<br><small class="muted">${s.entries.length} ejercicios · ${sets} series</small></span></label>
          ${dup ? '<span class="pill">ya en tu historial</span>' : ''}${inc ? `<span class="pill warn">⚠️ ${inc}</span>` : ''}
        </summary>
        <div class="grid2" style="margin-top:8px">
          <label class="field">Fecha<input type="date" data-sv="s.${i}.date" value="${esc(validISO(s.date) ? s.date : '')}"></label>
          <label class="field">Nombre<input data-sv="s.${i}.name" value="${esc(s.name)}"></label>
        </div>
        ${s.entries.map((e, j) => `
          <div class="svent">
            <div class="row between"><b>${esc(e.exercise)}</b><span class="row">${e.block ? `<span class="pill">🔗 ${esc(e.block)}</span>` : ''}<button class="ghost danger small" data-action="sv-del-entry" data-i="${i}" data-j="${j}" aria-label="Quitar ejercicio">✕</button></span></div>
            <table class="sets"><thead><tr><th>#</th><th>Kg</th><th>${e.type === 'time' ? 'Seg' : 'Reps'}</th><th></th></tr></thead><tbody>
              ${e.sets.map((t, k) => `
                <tr class="${t.complete ? '' : 'warn'}">
                  <td>${k + 1}</td>
                  <td><input inputmode="decimal" data-sv="t.${i}.${j}.${k}.weight_kg" value="${t.weight_kg ? esc(t.weight_kg) : ''}" placeholder="${e.type === 'time' ? '' : 'kg'}" aria-label="Peso serie ${k + 1}"></td>
                  <td><input inputmode="numeric" data-sv="t.${i}.${j}.${k}.reps" value="${t.reps ? esc(t.reps) : ''}" placeholder="${e.type === 'time' ? 'seg' : 'reps'}" aria-label="${e.type === 'time' ? 'Segundos' : 'Repeticiones'} serie ${k + 1}"></td>
                  <td>${t.complete ? '' : '⚠️'}<button class="ghost danger small" data-action="sv-del-set" data-i="${i}" data-j="${j}" data-k="${k}" aria-label="Quitar serie">✕</button></td>
                </tr>`).join('')}
            </tbody></table>
            ${e.notes ? `<small class="muted">${esc(e.notes)}</small>` : ''}
          </div>`).join('') || '<p class="muted">Sin ejercicios.</p>'}
        ${letters.length ? '<p class="muted" style="margin:6px 0 0;font-size:0.82rem">🔗 Los ejercicios con la misma letra se alternaron serie a serie.</p>' : ''}
      </details>`;
  }).join('');

  const questions = sv.questions.length ? `
    <div class="card accent stack">
      <h3>Antes de guardar, necesito saber…</h3>
      ${sv.questions.map((q, i) => `
        <div>
          <b>${esc(q.question)}</b>
          ${q.options?.length ? `<div class="chips" style="margin-top:6px">${q.options.map((o) => `<label class="chip"><input type="radio" name="svq_${i}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div>` : ''}
          <input data-svq="${i}" placeholder="${q.options?.length ? 'Otra respuesta (opcional)' : 'Tu respuesta'}" style="margin-top:6px">
        </div>`).join('')}
      <button class="primary block" data-action="sv-answer">Responder y actualizar</button>
    </div>` : '';

  const n = sv.include.filter(Boolean).length;
  return `
    <div class="card"><p style="margin:0">💬 ${esc(sv.message || 'Esto es lo que he entendido:')}</p></div>
    ${questions}
    ${sessions || '<div class="empty">No encontré sesiones en el texto.</div>'}
    <button class="primary block" data-action="sv-save" ${n ? '' : 'disabled'}>${sv.target === 'active' ? 'Añadir a mi entreno' : n === 1 ? 'Guardar 1 sesión' : `Guardar ${n} sesiones`}</button>
    <button class="block" style="margin-top:8px" data-action="sv-back">✏️ Editar el texto</button>
    <button class="ghost block" data-action="sv-cancel">Cancelar</button>`;
}

/* ---------- guardar ---------- */

function ensureExercise(e) {
  const st = S();
  const key = norm(e.exercise);
  let ex = st.exercises.find((x) => norm(x.name) === key);
  if (!ex) {
    ex = { id: ctx.uid(), name: e.exercise.trim(), muscle: e.muscle_group || 'Otros', type: e.type === 'time' ? 'time' : 'reps' };
    st.exercises.push(ex);
  }
  return ex;
}

/** En el historial se guarda todo como hecho; en un entreno en curso, lo incompleto queda pendiente para que lo termines. */
const mapSets = (e, live = false) => e.sets.filter((t) => num(t.reps) > 0 || num(t.weight_kg) > 0).map((t) => ({
  w: num(t.weight_kg) > 0 ? String(num(t.weight_kg)) : '', r: num(t.reps) > 0 ? String(Math.round(num(t.reps))) : '',
  done: live ? t.complete !== false && num(t.reps) > 0 : true,
}));

/** Los ejercicios con la misma letra comparten bloque (id de grupo único por sesión). */
function groupIds(entries) {
  const ids = {};
  const out = entries.map((e) => (e.block ? (ids[e.block] ||= ctx.uid()) : null));
  const count = {};
  out.forEach((g) => { if (g) count[g] = (count[g] || 0) + 1; });
  return out.map((g) => (g && count[g] > 1 ? g : null));
}

function applyNew() {
  const st = S();
  const sigs = existingSigs();
  let added = 0, skipped = 0;
  sv.draft.sessions.forEach((s, i) => {
    if (!sv.include[i]) return;
    if (sigs.has(draftSig(s))) { skipped++; return; }
    const src = s.entries.filter((e) => mapSets(e).length);
    if (!src.length) return;
    const gids = groupIds(src);
    const entries = src.map((e, k) => {
      const entry = { exerciseId: ensureExercise(e).id, sets: mapSets(e) };
      if (gids[k]) entry.group = gids[k];
      return entry;
    });
    const start = fromISO(s.date);
    st.workouts.push({ id: ctx.uid(), name: s.name || 'Entreno', start, end: start + Math.max(1, s.duration_minutes || 60) * 60000, entries, source: sv.kind === 'import' ? 'importado' : 'dictado' });
    added++;
  });
  // El historial se recorre siempre en orden cronológico.
  st.workouts.sort((a, b) => a.start - b.start);
  return { added, skipped };
}

function applyToActive() {
  const a = S().active;
  let sets = 0;
  const rows = sv.draft.sessions.filter((_, i) => sv.include[i]).flatMap((s) => s.entries.filter((e) => mapSets(e).length));
  const gids = groupIds(rows);
  rows.forEach((e, k) => {
    const ex = ensureExercise(e);
    let entry = a.entries.find((x) => x.exerciseId === ex.id);
    if (!entry) { entry = ctx.newEntry(ex.id); a.entries.push(entry); }
    entry.sets = mapSets(e, true);
    delete entry.suggest;
    sets += entry.sets.length;
    if (gids[k]) entry.group = gids[k];
  });
  a.timer = null;
  return sets;
}

function save() {
  const inc = sv.draft.sessions.filter((_, i) => sv.include[i]);
  if (sv.target !== 'active') {
    const bad = sv.draft.sessions.findIndex((s, i) => sv.include[i] && !validISO(s.date));
    if (bad >= 0) { ctx.toast('Falta la fecha de una sesión: ponla para poder guardarla'); document.querySelectorAll('details.sess')[bad]?.setAttribute('open', ''); return; }
  }
  const missing = inc.reduce((t, s) => t + incompleteOf(s), 0);
  const go = () => {
    let msg;
    if (sv.target === 'active') {
      const sets = applyToActive();
      close();
      ctx.setTab('train');
      msg = `Añadidas ${sets} series a tu entreno`;
    } else {
      const { added, skipped } = applyNew();
      close();
      ctx.setTab('history');
      msg = `${added === 1 ? 'Sesión guardada' : `${added} sesiones guardadas`}${skipped ? ` · ${skipped} ya estaban` : ''}`;
    }
    ctx.commit();
    ctx.toast(msg);
  };
  if (missing) ctx.ask(`Quedan ${missing} series sin peso o repeticiones claros (⚠️). Se guardarán tal cual. ¿Guardar igualmente?`, 'Guardar igualmente', go);
  else go();
}

/* ---------- eventos ---------- */

function countUI(box) {
  const n = document.querySelector('[data-sv-count]');
  if (!n) return;
  n.textContent = `${box.value.length.toLocaleString('es')} / ${MAX_DOC.toLocaleString('es')} caracteres`;
  n.classList.toggle('over', box.value.length > MAX_DOC);
}

export function onSessionsInput(el) {
  if (el.dataset.svtext !== undefined) { sv.text = el.value; countUI(el); return; }
  if (el.dataset.sv === undefined || !sv.draft) return;
  const [kind, i, ...rest] = el.dataset.sv.split('.');
  const s = sv.draft.sessions[+i];
  if (kind === 's') { s[rest[0]] = el.value; return; }
  const [j, k, field] = rest;
  const t = s.entries[+j].sets[+k];
  t[field] = field === 'reps' ? Math.max(0, Math.round(num(el.value))) : num(el.value);
  // Si la persona corrige una serie, se da por revisada.
  if (num(t.reps) > 0) {
    t.complete = true;
    const tr = el.closest('tr');
    tr?.classList.remove('warn');
  }
}

export function onSessionsChange(el) {
  if (el.dataset.svInc !== undefined) { sv.include[+el.dataset.svInc] = el.checked; ctx.render(); }
}

export async function onSessionsFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > MAX_DOC * 4) { ctx.toast('El archivo es demasiado grande'); return; }
  let text = '';
  try { text = await file.text(); } catch { ctx.toast('No se pudo leer el archivo'); return; }
  if (text.includes('\u0000') || /^%PDF/.test(text)) { ctx.toast('Ese archivo no es de texto. Para PDF o fotos, pásalo antes por otra IA con el prompt'); return; }
  const merged = sv.text.trim() ? `${sv.text.trim()}\n\n---\n\n${text.trim()}` : text.trim();
  if (merged.length > MAX_DOC) { ctx.toast(`Demasiado largo (${merged.length.toLocaleString('es')} de ${MAX_DOC.toLocaleString('es')} caracteres)`); return; }
  sv.text = merged;
  const box = document.getElementById('sv-text');
  if (box) { box.value = merged; countUI(box); }
  ctx.toast(`Cargado: ${file.name}`);
}

export const sessionsActions = {
  'voice-open'() { open('voice', 'new'); return false; },
  'voice-open-active'() { open('voice', 'active'); return false; },
  'import-open'() { open('import', 'new'); return false; },
  'sv-mic'() { if (sv.listening) stopMic(); else startMic(); return false; },
  'sv-cancel'() { sessionsLeave(() => ctx.render()); return false; },
  'sv-cancel-ai'() { sv.loading?.abort.abort(); sv.lastRun = null; return false; },
  'sv-back'() { sv.step = 'input'; ctx.render(); return false; },
  'sv-retry'() { const r = sv.lastRun; if (r) run(r.text, r.fn); return false; },
  'sv-parse'() {
    const text = sv.text.trim();
    if (!text) { ctx.toast('Cuéntame primero qué entrenaste'); return false; }
    if (text.length > MAX_DOC) { ctx.toast(`El texto supera los ${MAX_DOC.toLocaleString('es')} caracteres`); return false; }
    run(sv.kind === 'import' ? 'Leyendo tu historial…' : 'Ordenando tu sesión…', async (o) => { setDraft(await callAI('sessions', baseInput(), o)); });
    return false;
  },
  'sv-answer'() {
    const answers = sv.questions.map((q, i) => {
      const other = (document.querySelector(`[data-svq="${i}"]`)?.value || '').trim();
      const chosen = document.querySelector(`input[name="svq_${i}"]:checked`)?.value;
      return { question: q.question, answer: other || chosen || '' };
    }).filter((a) => a.answer);
    if (!answers.length) { ctx.toast('Responde al menos una pregunta'); return false; }
    const draft = sv.draft;
    run('Actualizando tu sesión…', async (o) => { setDraft(await callAI('sessions', { ...baseInput(), draft, answers }, o)); });
    return false;
  },
  'sv-del-entry'(_, el) { sv.draft.sessions[+el.dataset.i].entries.splice(+el.dataset.j, 1); ctx.render(); return false; },
  'sv-del-set'(_, el) {
    const e = sv.draft.sessions[+el.dataset.i].entries[+el.dataset.j];
    e.sets.splice(+el.dataset.k, 1);
    ctx.render();
    return false;
  },
  'sv-save'() { save(); return false; },
};
