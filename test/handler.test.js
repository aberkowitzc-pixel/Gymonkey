import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePlanRequest } from '../lib/handler.js';
import Anthropic from '@anthropic-ai/sdk';

process.env.ALLOW_ANONYMOUS = 'true';
delete process.env.FIREBASE_PROJECT_ID;

const req = (body, init = {}) => new Request('http://x/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init });
const profile = { weeks: 8, days: ['Lunes', 'Miércoles', 'Viernes'], minutes: 60 };

function fakeClient({ chunks, final, fail }) {
  const handlers = {};
  return {
    beta: { messages: { stream: (_params, opts) => ({
      on(ev, fn) { handlers[ev] = fn; return this; },
      async finalMessage() {
        handlers.streamEvent?.({ type: 'content_block_start', content_block: { type: 'thinking' } });
        let snap = '';
        for (const c of chunks || []) {
          if (opts?.signal?.aborted) throw new Error('abortado');
          await new Promise((r) => setTimeout(r, 30));
          snap += c;
          handlers.text?.(c, snap);
        }
        if (fail) throw fail;
        return final;
      },
    }) } },
  };
}

async function readLines(res) {
  const out = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      assert.ok(frame.startsWith('data: '), 'formato SSE');
      out.push(JSON.parse(frame.slice(6)));
    }
  }
  return out;
}

test('responde en streaming: start, progreso creciente y resultado', async () => {
  const chunks = ['{"message":"hola","changes":[],"plan":{"title":"t","total_weeks":8,"days_per_week":3,', '"mesocycles":[{"name":"Acum","weeks":4,"focus":"f",', '"days":[{"name":"D1","weekday":"Lunes"},{"name":"D2","weekday":"Miércoles"},{"name":"D3","weekday":"Viernes"}]}'];
  const client = fakeClient({ chunks, final: { stop_reason: 'end_turn', parsed_output: { message: 'ok', changes: [], plan: { title: 't' } }, model: 'm', usage: {} } });
  const res = await handlePlanRequest(req({ mode: 'generate', input: { profile, today: '2026-11-27' } }), { client });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const lines = await readLines(res);
  assert.equal(lines[0].type, 'start');
  const prog = lines.filter((l) => l.type === 'progress');
  assert.ok(prog.length >= 2);
  for (let i = 1; i < prog.length; i++) assert.ok(prog[i].pct >= prog[i - 1].pct);
  assert.ok(prog.some((p) => /mesociclo 1: Acum/.test(p.phase)));
  const last = lines.at(-1);
  assert.equal(last.type, 'result');
  assert.equal(last.data.message, 'ok');
});

test('un fallo de la IA llega como evento de error con mensaje claro', async () => {
  const err = new Anthropic.RateLimitError(429, { error: { message: 'x' } }, 'x', new Headers());
  const res = await handlePlanRequest(req({ mode: 'generate', input: { profile } }), { client: fakeClient({ fail: err }) });
  const lines = await readLines(res);
  const last = lines.at(-1);
  assert.equal(last.type, 'error');
  assert.match(last.error, /saturada/);
});

test('rechazo de seguridad y respuesta cortada se explican', async () => {
  for (const [stop, re] of [['refusal', /no pudo procesar/], ['max_tokens', /incompleta/]]) {
    const res = await handlePlanRequest(req({ mode: 'questions', input: { profile } }), { client: fakeClient({ final: { stop_reason: stop } }) });
    const last = (await readLines(res)).at(-1);
    assert.equal(last.type, 'error');
    assert.match(last.error, re);
  }
});

test('errores previos al streaming usan códigos HTTP', async () => {
  assert.equal((await handlePlanRequest(new Request('http://x', { method: 'GET' }))).status, 405);
  assert.equal((await handlePlanRequest(new Request('http://x', { method: 'POST', body: 'no json' }), { client: {} })).status, 400);
  assert.equal((await handlePlanRequest(req({ pad: 'x'.repeat(250000) }), { client: {} })).status, 413);
  process.env.FIREBASE_PROJECT_ID = 'gymonkey';
  const res = await handlePlanRequest(req({ mode: 'generate', input: { profile } }), { client: {} });
  assert.equal(res.status, 401);
  delete process.env.FIREBASE_PROJECT_ID;
});

test('si el cliente corta la conexión, se cancela la generación', async () => {
  let aborted = false;
  const client = { beta: { messages: { stream: (_p, opts) => ({
    on() { return this; },
    async finalMessage() {
      await new Promise((resolve) => opts.signal.addEventListener('abort', () => { aborted = true; resolve(); }));
      throw new Error('abortado');
    },
  }) } } };
  const res = await handlePlanRequest(req({ mode: 'generate', input: { profile } }), { client });
  const reader = res.body.getReader();
  await reader.read();            // start
  await reader.cancel();          // el móvil cierra la conexión
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(aborted, true);
});

test('las respuestas ya generadas (cortadas, rechazadas o con formato raro) no devuelven la cuota', async () => {
  for (const final of [{ stop_reason: 'max_tokens' }, { stop_reason: 'refusal' }, { stop_reason: 'end_turn' }]) {
    let refunds = 0;
    const quota = async () => ({ ok: true, limit: 2, used: 1, refund: async () => { refunds++; } });
    const res = await handlePlanRequest(req({ mode: 'questions', input: { profile } }), { client: fakeClient({ final }), quota });
    assert.equal((await readLines(res)).at(-1).type, 'error');
    assert.equal(refunds, 0, final.stop_reason);
  }
  // Un fallo de la IA antes de responder sí la devuelve.
  let refunds = 0;
  const quota = async () => ({ ok: true, limit: 2, used: 1, refund: async () => { refunds++; } });
  const err = new Anthropic.RateLimitError(429, { error: { message: 'x' } }, 'x', new Headers());
  await readLines(await handlePlanRequest(req({ mode: 'questions', input: { profile } }), { client: fakeClient({ fail: err }), quota }));
  assert.equal(refunds, 1);
});

test('si no se puede contar la cuota de una tarea cara, responde 503', async () => {
  const quota = async () => ({ ok: false, unavailable: true, limit: 2, used: 0, refund: async () => {} });
  const res = await handlePlanRequest(req({ mode: 'generate', input: { profile } }), { client: fakeClient({}), quota });
  assert.equal(res.status, 503);
});

test('ALLOW_ANONYMOUS no abre la IA en producción', async () => {
  process.env.VERCEL_ENV = 'production';
  try {
    const res = await handlePlanRequest(req({ mode: 'generate', input: { profile } }), { client: fakeClient({}) });
    assert.equal(res.status, 500);
  } finally { delete process.env.VERCEL_ENV; }
});
