import test from 'node:test';
import assert from 'node:assert/strict';
import { takeQuota, limitFor, quotaConfigured, DEFAULT_LIMITS } from '../lib/quota.js';
import { handlePlanRequest } from '../lib/handler.js';

const ENV = { KV_REST_API_URL: 'https://redis.example', KV_REST_API_TOKEN: 'tok' };
// Redis simulado: INCR / EXPIRE / DECR por pipeline.
function fakeRedis() {
  const store = new Map(); const calls = [];
  const fetchImpl = async (url, init) => {
    assert.match(url, /\/pipeline$/);
    assert.equal(init.headers.Authorization, 'Bearer tok');
    const cmds = JSON.parse(init.body); calls.push(cmds);
    const out = cmds.map(([c, k]) => {
      if (c === 'INCR') { store.set(k, (store.get(k) || 0) + 1); return { result: store.get(k) }; }
      if (c === 'DECR') { store.set(k, (store.get(k) || 0) - 1); return { result: store.get(k) }; }
      return { result: 1 };
    });
    return { ok: true, json: async () => out };
  };
  return { fetchImpl, store, calls };
}

test('límites por defecto y cambio por variable de entorno', () => {
  assert.equal(limitFor('generate', {}), DEFAULT_LIMITS.generate);
  assert.equal(limitFor('generate', { QUOTA_GENERATE: '5' }), 5);
  assert.equal(limitFor('desconocido', {}), 10);
  assert.equal(quotaConfigured({}), false);
  assert.equal(quotaConfigured(ENV), true);
  assert.equal(quotaConfigured({ UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }), true);
});

test('cuenta por persona, modo y día; se bloquea al pasar el límite', async () => {
  const r = fakeRedis();
  const opts = { env: { ...ENV, QUOTA_GENERATE: '2' }, fetchImpl: r.fetchImpl, now: Date.UTC(2026, 10, 27, 12) };
  assert.equal((await takeQuota('ana', 'generate', opts)).ok, true);
  assert.equal((await takeQuota('ana', 'generate', opts)).ok, true);
  const third = await takeQuota('ana', 'generate', opts);
  assert.equal(third.ok, false);
  assert.equal(third.limit, 2);
  // otra persona y otro modo tienen su propio contador
  assert.equal((await takeQuota('luis', 'generate', opts)).ok, true);
  assert.equal((await takeQuota('ana', 'chat', opts)).ok, true);
  assert.ok(r.store.has('quota:ana:generate:2026-11-27'));
  // al día siguiente se empieza de cero
  assert.equal((await takeQuota('ana', 'generate', { ...opts, now: Date.UTC(2026, 10, 28, 1) })).ok, true);
});

test('devolver el intento cuando la IA falla', async () => {
  const r = fakeRedis();
  const opts = { env: { ...ENV, QUOTA_GENERATE: '1' }, fetchImpl: r.fetchImpl, now: Date.UTC(2026, 10, 27) };
  const a = await takeQuota('ana', 'generate', opts);
  await a.refund();
  assert.equal((await takeQuota('ana', 'generate', opts)).ok, true);
});

test('sin contadores configurados no limita; si el servicio falla, deja pasar', async () => {
  assert.equal((await takeQuota('ana', 'generate', { env: {} })).ok, true);
  const rota = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const origErr = console.error; console.error = () => {};
  try { assert.equal((await takeQuota('ana', 'generate', { env: ENV, fetchImpl: rota })).ok, true); } finally { console.error = origErr; }
});

test('el servidor responde 429 con mensaje en el idioma cuando se pasa la cuota', async () => {
  process.env.ALLOW_ANONYMOUS = 'true'; delete process.env.FIREBASE_PROJECT_ID;
  const body = { mode: 'chat', input: { chat: [{ role: 'user', text: 'hola' }] } };
  const mk = (lang) => new Request('http://x/api/plan', { method: 'POST', headers: { 'content-type': 'application/json', 'x-app-lang': lang }, body: JSON.stringify(body) });
  const denied = async () => ({ ok: false, limit: 60, used: 61, refund: async () => {} });
  const res = await handlePlanRequest(mk('en'), { client: {}, quota: denied });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /limit for this feature \(60 per day\)/);
  const es = await handlePlanRequest(mk('es'), { client: {}, quota: denied });
  assert.match((await es.json()).error, /límite diario/);
});

test('acceso abierto sin contadores en un servidor real: se bloquea (503)', async () => {
  const saved = { ...process.env };
  try {
    process.env.FIREBASE_PROJECT_ID = 'proj';
    for (const k of ['ALLOWED_EMAILS', 'ALLOWED_EMAILS_EXTRA', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete process.env[k];
    const verify = async () => ({ uid: 'ana', email: 'ana@x.com' });
    const r = new Request('http://x/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'chat', input: {} }) });
    const res = await handlePlanRequest(r, { client: {}, verify });
    assert.equal(res.status, 503);
    // con una lista de correos, o con contadores, sí se permite seguir
    process.env.ALLOWED_EMAILS = 'ana@x.com';
    const ok = await handlePlanRequest(new Request('http://x/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'chat', input: {} }) }), { client: {}, verify, quota: async () => ({ ok: true, refund: async () => {} }) });
    assert.equal(ok.status, 200);
  } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
});
