import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { runPlanner, PlannerError, planSchema } from '../lib/planner.js';

const profile = { goal: 'Hipertrofia', experience: 'Intermedio', days: ['Lunes', 'Miércoles', 'Viernes'], minutes: 60, weeks: 8, equipment: ['Mancuernas'] };

test('el SDK envía modelo, esquema JSON, effort y fallbacks correctos', async () => {
  let captured;
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c));
    req.on('end', () => {
      captured = { headers: req.headers, body: JSON.parse(b), url: req.url };
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'capturado' } }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  const client = new Anthropic({ apiKey: 'test', baseURL: `http://127.0.0.1:${server.address().port}`, maxRetries: 0 });
  await assert.rejects(runPlanner(client, 'generate', { profile, answers: [], today: '2026-11-26', library: ['Press de banca'] }), Anthropic.BadRequestError);
  server.close();
  const { body, headers, url } = captured;
  assert.match(url, /^\/v1\/messages/);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.stream, true);
  assert.equal(body.fallbacks, 'default');
  assert.match(headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(body.output_config.effort, 'high');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.format.schema.properties.plan.properties.mesocycles.type, 'array');
  assert.equal(body.thinking, undefined);
  assert.match(body.messages[0].content, /Press de banca/);
});

test('todos los objetos del esquema tienen additionalProperties:false y required completo', () => {
  const walk = (s) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(walk);
    } else if (s.type === 'array') walk(s.items);
  };
  walk(planSchema);
});

const fake = (message) => ({ beta: { messages: { stream: () => ({ finalMessage: async () => message }) } } });

test('devuelve el JSON validado', async () => {
  const out = await runPlanner(fake({ stop_reason: 'end_turn', parsed_output: { intro: 'Hola', questions: [] }, model: 'm', usage: {} }), 'questions', { profile });
  assert.equal(out.intro, 'Hola');
});

test('errores claros: rechazo, respuesta cortada, modo inválido, sin perfil', async () => {
  await assert.rejects(runPlanner(fake({ stop_reason: 'refusal' }), 'generate', { profile }), PlannerError);
  await assert.rejects(runPlanner(fake({ stop_reason: 'max_tokens' }), 'generate', { profile }), PlannerError);
  await assert.rejects(runPlanner(fake({}), 'hack', { profile }), PlannerError);
  await assert.rejects(runPlanner(fake({}), 'generate', {}), PlannerError);
});
