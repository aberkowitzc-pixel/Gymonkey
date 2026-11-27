// Revisión de la semana con IA: ¿hay que compensar lo que no se hizo?
// Flujo: datos de la semana → la IA decide (o dice que no hace falta) → propuestas con casillas → aplicar.

import { callAI, aiProfile, trainingSummary, planBrief } from './plan.js';
import { validateActions, describeAction, applyActions } from './weekplan.js';
import { t, tn } from './i18n.js';
import { ic } from './icons.js';

let ctx;
export function initWeek(c) { ctx = c; }
const esc = (s) => ctx.esc(s);

const wk = { active: false, loading: null, error: null, lastRun: null, data: null, wctx: null, valid: [], dropped: 0, selected: [] };

export const weekActive = () => wk.active;
export const weekBusy = () => !!wk.loading;

function close() {
  wk.loading?.abort.abort();
  Object.assign(wk, { active: false, loading: null, error: null, lastRun: null, data: null, wctx: null, valid: [], dropped: 0, selected: [] });
}

/** Al cambiar de pestaña con propuestas sin decidir, se pregunta antes de perderlas. */
export function weekLeave(next) {
  if (wk.data && wk.valid.length && !wk.loading) {
    ctx.ask(t('¿Salir sin aplicar las propuestas?'), t('Salir'), () => { close(); next(); });
    return;
  }
  close();
  next();
}

async function run() {
  const abort = new AbortController();
  const wctx = ctx.weekContext();
  wk.wctx = wctx;
  wk.error = null;
  wk.loading = { since: Date.now(), pct: 0, shown: 0, phase: t('Conectando con el entrenador…'), abort };
  wk.lastRun = true;
  ctx.render();
  const onProgress = (p) => {
    if (!wk.loading) return;
    wk.loading.pct = Math.max(wk.loading.pct, p.pct);
    wk.loading.phase = p.phase;
    weekTick();
  };
  try {
    const r = await callAI('review', { context: wctx, profile: aiProfile(), plan: planBrief(), history: trainingSummary(), known_loads: ctx.knownLoads() }, { signal: abort.signal, onProgress });
    const { valid, dropped } = validateActions(r.actions, wctx);
    Object.assign(wk, { data: r, valid, dropped, selected: valid.map(() => true), lastRun: null });
  } catch (e) {
    if (!abort.signal.aborted) wk.error = e.message || t('Algo salió mal.');
  } finally {
    wk.loading = null;
    ctx.render();
  }
}

export function weekTick() {
  const l = wk.loading;
  if (!l) return;
  const secs = Math.floor((Date.now() - l.since) / 1000);
  const target = l.pct > 4 ? l.pct : Math.min(4, secs / 10);
  l.shown += (target - l.shown) * 0.35;
  if (Math.abs(target - l.shown) < 0.2) l.shown = target;
  const set = (id, fn) => { const n = document.getElementById(id); if (n) fn(n); };
  set('wk-elapsed', (n) => { n.textContent = ctx.fmtSecs(secs); });
  set('wk-bar', (n) => { n.style.width = `${l.shown.toFixed(1)}%`; });
  set('wk-pct', (n) => { n.textContent = `${Math.round(l.shown)} %`; });
  set('wk-phase', (n) => { if (n.textContent !== l.phase) n.textContent = l.phase; });
}

const verdict = (v) => ({ sin_cambios: t('Sin cambios'), reprogramar: t('Reprogramar'), compensar: t('Compensar') }[v] || '');

export function viewWeek() {
  if (wk.loading) {
    const l = wk.loading;
    return `<div class="card ai-loading" role="status">
      <h3>${t('Revisando tu semana…')}</h3>
      <div class="progress" aria-hidden="true"><i id="wk-bar" style="width:${Math.round(l.shown)}%"></i></div>
      <div class="skel" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="row between"><span id="wk-phase" class="phase">${esc(l.phase)}</span><b id="wk-pct" class="timer">${Math.round(l.shown)} %</b></div>
      <div class="row between small-line muted"><span>${ic('clock')} <b id="wk-elapsed" class="timer">0:00</b></span><span>${t('Mantén la pantalla abierta')}</span></div>
      <button class="ghost block" style="margin-top:8px" data-action="wk-cancel-ai">${t('Cancelar')}</button>
    </div>`;
  }
  if (wk.error) {
    return `<div class="card error" role="alert"><p style="margin:0 0 8px">${ic('alert')} ${esc(wk.error)}</p>
      <div class="row"><button class="primary" data-action="wk-retry">${t('Reintentar')}</button><button data-action="wk-close">${t('Cerrar')}</button></div></div>`;
  }
  const r = wk.data;
  if (!r) return '';
  const n = wk.selected.filter(Boolean).length;
  const acts = wk.valid.map((a, i) => {
    const d = describeAction(a, wk.wctx);
    return `<div class="act">
      <label class="row"><input type="checkbox" data-wk-act="${i}" ${wk.selected[i] ? 'checked' : ''}><span>${d.icon} ${d.html}</span></label>
      ${a.reason ? `<details class="why"><summary>${t('¿Por qué?')}</summary><p class="muted" style="margin:4px 0 0">${esc(a.reason)}</p></details>` : ''}
    </div>`;
  }).join('');
  return `
    <div class="card">
      <div class="row between"><h3>${t('Tu semana')}</h3><span class="pill">${esc(verdict(r.verdict))}</span></div>
      <p style="margin:8px 0 0">${esc(r.message)}</p>
    </div>
    ${acts ? `<div class="card stack">${acts}</div>` : ''}
    ${wk.dropped ? `<p class="muted" style="font-size:0.82rem">${tn(wk.dropped, '{n} propuesta no encajaba con tu calendario y se descartó.', '{n} propuestas no encajaban con tu calendario y se descartaron.')}</p>` : ''}
    ${wk.valid.length
    ? `<button class="primary block" data-action="wk-apply" ${n ? '' : 'disabled'}>${tn(n, 'Aplicar {n} cambio', 'Aplicar {n} cambios')}</button>
       <button class="ghost block" data-action="wk-close">${t('Dejarlo como está')}</button>`
    : `<button class="primary block" data-action="wk-close">${t('Entendido')}</button>`}`;
}

export function onWeekChange(el) {
  if (el.dataset.wkAct === undefined) return;
  wk.selected[+el.dataset.wkAct] = el.checked;
  const b = document.querySelector('[data-action=wk-apply]');
  const n = wk.selected.filter(Boolean).length;
  if (b) { b.disabled = !n; b.textContent = tn(n, 'Aplicar {n} cambio', 'Aplicar {n} cambios'); }
}

export const weekActions = {
  'week-review'() {
    Object.assign(wk, { active: true, data: null, valid: [], dropped: 0, selected: [] });
    run();
    return false;
  },
  'wk-retry'() { run(); return false; },
  'wk-cancel-ai'() { wk.loading?.abort.abort(); close(); ctx.render(); return false; },
  'wk-close'() { close(); ctx.render(); return false; },
  'wk-apply'() {
    const chosen = wk.valid.filter((_, i) => wk.selected[i]);
    applyActions(ctx.state(), chosen, wk.wctx, { uid: ctx.uid });
    close();
    ctx.commit();
    ctx.toast(chosen.length ? t('Semana actualizada') : t('Sin cambios'));
    return false;
  },
};
