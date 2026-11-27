// Cargas de partida que faltan: la IA las estima a partir de tu historial y tus marcas.
// Flujo: lista de ejercicios sin carga → la IA estima → revisas y corriges → guardar.

import { callAI, aiProfile, planBrief } from './plan.js';
import { matchExercise } from './exercises.js';

let ctx;
export function initLoads(c) { ctx = c; }
const esc = (s) => ctx.esc(s);

const ld = { active: false, loading: null, error: null, message: '', rows: [], asked: false };

export const loadsActive = () => ld.active;
export const loadsBusy = () => !!ld.loading;

function close() {
  ld.loading?.abort.abort();
  Object.assign(ld, { active: false, loading: null, error: null, message: '', rows: [], asked: false });
}

export function loadsLeave(next) {
  if (ld.rows.length && !ld.loading) {
    ctx.ask('¿Salir sin guardar las cargas?', 'Salir', () => { close(); next(); });
    return;
  }
  close();
  next();
}

async function run() {
  const items = ctx.missing();
  if (!items.length) { close(); ctx.render(); ctx.toast('Todos tus ejercicios ya tienen carga de partida'); return; }
  const abort = new AbortController();
  ld.error = null;
  ld.loading = { since: Date.now(), pct: 0, shown: 0, phase: 'Conectando con el entrenador…', abort };
  ctx.render();
  const onProgress = (p) => {
    if (!ld.loading) return;
    ld.loading.pct = Math.max(ld.loading.pct, p.pct);
    ld.loading.phase = p.phase;
    loadsTick();
  };
  try {
    const r = await callAI('loads', {
      profile: aiProfile(), plan: planBrief(), known_loads: ctx.knownLoads(),
      exercises: items.map(({ name, muscle, type, sets, reps, rir }) => ({ name, muscle, type, sets, reps, rir })),
    }, { signal: abort.signal, onProgress });
    const lib = items.map((i) => ({ id: i.exerciseId, name: i.name }));
    ld.rows = (r.loads || []).map((x) => {
      const m = matchExercise(x.exercise, lib);
      const item = m && items.find((i) => i.exerciseId === m.exercise.id);
      return item ? { exerciseId: item.exerciseId, name: item.name, sets: item.sets, reps: item.reps, rir: item.rir, kg: x.start_load_kg || 0, basis: x.basis, note: x.note } : null;
    }).filter(Boolean);
    ld.message = r.message || '';
    ld.asked = true;
  } catch (e) {
    if (!abort.signal.aborted) ld.error = e.message || 'Algo salió mal.';
  } finally {
    ld.loading = null;
    ctx.render();
  }
}

export function loadsTick() {
  const l = ld.loading;
  if (!l) return;
  const secs = Math.floor((Date.now() - l.since) / 1000);
  const target = l.pct > 4 ? l.pct : Math.min(4, secs / 10);
  l.shown += (target - l.shown) * 0.35;
  if (Math.abs(target - l.shown) < 0.2) l.shown = target;
  const set = (id, fn) => { const n = document.getElementById(id); if (n) fn(n); };
  set('ld-elapsed', (n) => { n.textContent = ctx.fmtSecs(secs); });
  set('ld-bar', (n) => { n.style.width = `${l.shown.toFixed(1)}%`; });
  set('ld-pct', (n) => { n.textContent = `${Math.round(l.shown)} %`; });
  set('ld-phase', (n) => { if (n.textContent !== l.phase) n.textContent = l.phase; });
}

const BASIS = { marca: 'tus marcas', estimado: '≈ estimada', peso_corporal: 'peso corporal' };

export function viewLoads() {
  if (ld.loading) {
    const l = ld.loading;
    return `<div class="card ai-loading" role="status">
      <h3>Calculando tus cargas…</h3>
      <div class="progress" aria-hidden="true"><i id="ld-bar" style="width:${Math.round(l.shown)}%"></i></div>
      <div class="row between"><span id="ld-phase" class="phase">${esc(l.phase)}</span><b id="ld-pct" class="timer">${Math.round(l.shown)} %</b></div>
      <div class="row between small-line muted"><span>⏱ <b id="ld-elapsed" class="timer">0:00</b></span><span>Mantén la pantalla abierta</span></div>
      <button class="ghost block" style="margin-top:8px" data-action="ld-cancel-ai">Cancelar</button>
    </div>`;
  }
  if (ld.error) {
    return `<div class="card error" role="alert"><p style="margin:0 0 8px">⚠️ ${esc(ld.error)}</p>
      <div class="row"><button class="primary" data-action="ld-retry">Reintentar</button><button data-action="ld-close">Cerrar</button></div></div>`;
  }
  if (!ld.asked) return '';
  const rows = ld.rows.map((r, i) => `
    <div class="ld-row">
      <div class="ld-name"><b>${esc(r.name)}</b><small>${r.sets}×${esc(r.reps)} · RIR ${esc(r.rir)}</small>${r.note ? `<small class="muted">${esc(r.note)}</small>` : ''}</div>
      ${r.basis === 'peso_corporal'
    ? '<span class="pill">peso corporal</span>'
    : `<div class="ld-in"><input inputmode="decimal" data-ld="${i}" value="${r.kg || ''}" placeholder="kg" aria-label="Carga de ${esc(r.name)} en kg"><span class="pill">${BASIS[r.basis] || ''}</span></div>`}
    </div>`).join('');
  return `
    <div class="card"><h3>Cargas de partida</h3>${ld.message ? `<p class="muted" style="margin:6px 0 0">${esc(ld.message)}</p>` : ''}</div>
    ${rows ? `<div class="card stack">${rows}</div>` : '<div class="empty">No se pudo estimar ninguna carga.</div>'}
    ${rows ? '<button class="primary block" data-action="ld-apply">Guardar cargas</button>' : ''}
    <button class="ghost block" data-action="ld-close">${rows ? 'Cancelar' : 'Cerrar'}</button>`;
}

export function onLoadsInput(el) {
  if (el.dataset.ld === undefined) return;
  const n = parseFloat(String(el.value).replace(',', '.'));
  ld.rows[+el.dataset.ld].kg = Number.isFinite(n) && n >= 0 ? n : 0;
}

export const loadsActions = {
  'loads-estimate'() { Object.assign(ld, { active: true, rows: [], asked: false }); run(); return false; },
  'ld-retry'() { run(); return false; },
  'ld-cancel-ai'() { ld.loading?.abort.abort(); close(); ctx.render(); return false; },
  'ld-close'() { close(); ctx.render(); return false; },
  'ld-apply'() {
    let n = 0;
    for (const r of ld.rows) {
      if (r.basis === 'peso_corporal') { ctx.applyLoad(r.exerciseId, 0, 'peso_corporal'); n++; }
      else if (r.kg > 0) { ctx.applyLoad(r.exerciseId, r.kg, r.basis || 'estimado'); n++; }
    }
    close();
    ctx.commit();
    ctx.toast(n ? `Cargas guardadas (${n})` : 'No se guardó ninguna carga');
    return false;
  },
};
