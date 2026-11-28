// Gestiona POST /api/plan. Responde en streaming con eventos SSE ("data: {json}\n\n"):
//   {"type":"start"} · {"type":"ping"} · {"type":"progress","pct":42,"phase":"…"}
//   {"type":"result","data":{…}} · {"type":"error","error":"…"}
// Así la conexión no queda en silencio durante minutos (las redes móviles la cortan)
// y la app puede mostrar el avance real.
import { verifyUser, HttpError } from './auth.js';
import { runPlanner, PlannerError, Anthropic } from './planner.js';
import { normLang, sm, phaseText } from './i18n.js';
import { takeQuota, quotaConfigured } from './quota.js';
import { allowedEmails } from './auth.js';

const MAX_BODY = 200_000;
const PING_MS = 8000;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function friendlyError(e, lang) {
  if (e instanceof PlannerError) return sm(lang, e.key ?? e.message, e.params);
  if (e instanceof Anthropic.RateLimitError) return sm(lang, 'La IA está saturada. Espera un minuto y vuelve a intentarlo.');
  if (e instanceof Anthropic.AuthenticationError) return sm(lang, 'La clave de la IA del servidor no es válida.');
  if (e instanceof Anthropic.APIError) return sm(lang, 'La IA no está disponible ahora mismo. Inténtalo más tarde.');
  return sm(lang, 'Error inesperado en el servidor.');
}

export async function handlePlanRequest(request, { client, quota = takeQuota, verify = verifyUser } = {}) {
  // El idioma llega en una cabecera para poder avisar también de los errores de acceso.
  let lang = normLang(request.headers.get('x-app-lang'));
  if (request.method !== 'POST') return json(405, { error: sm(lang, 'Método no permitido.') });

  let user;
  try {
    user = await verify(request.headers.get('authorization'));
  } catch (e) {
    return json(e instanceof HttpError ? e.status : 401, { error: sm(lang, e.message) });
  }

  let raw;
  try { raw = await request.text(); } catch { return json(400, { error: sm(lang, 'Petición no válida.') }); }
  if (raw.length > MAX_BODY) return json(413, { error: sm(lang, 'La petición es demasiado grande.') });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: sm(lang, 'Petición no válida.') }); }
  if (!request.headers.get('x-app-lang')) lang = normLang(body?.lang);

  if (!client && !process.env.ANTHROPIC_API_KEY) return json(500, { error: sm(lang, 'El servidor no tiene configurada la clave de la IA (ANTHROPIC_API_KEY).') });
  const api = client || new Anthropic();

  // Acceso abierto sin contadores = gasto sin freno: en un servidor real no se permite.
  if ((process.env.FIREBASE_PROJECT_ID || process.env.VERCEL_ENV === 'production') && !allowedEmails().length && !quotaConfigured()) {
    return json(503, { error: sm(lang, 'La IA no está disponible todavía en este servidor (faltan los límites de uso).') });
  }
  // Cuota diaria por persona y tipo de petición.
  let slot = await quota(user.uid, body.mode);
  if (!slot.ok && slot.unavailable) {
    return json(503, { error: sm(lang, 'El control de uso no está disponible ahora mismo. Inténtalo en unos minutos.') });
  }
  if (!slot.ok) {
    return json(429, { error: sm(lang, 'Has llegado al límite diario de esta función ({n} al día). Vuelve mañana.', { n: slot.limit }) });
  }

  const enc = new TextEncoder();
  const abort = new AbortController();
  let ping;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj) => { if (!closed) { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { closed = true; } } };
      request.signal?.addEventListener('abort', () => abort.abort());
      send({ type: 'start' });
      ping = setInterval(() => send({ type: 'ping' }), PING_MS);
      try {
        const data = await runPlanner(api, body.mode, body.input, { signal: abort.signal, lang, onProgress: (p) => send({ type: 'progress', ...p, phase: phaseText(lang, p.phase) }) });
        send({ type: 'result', data });
        slot = null;
      } catch (e) {
        // Un fallo de la IA o de la red no consume la cuota del día. Sí la consumen cancelar a mitad y las
        // respuestas que la IA ya generó aunque no sirvan (cortada, rechazada, formato raro): ya se pagaron,
        // y si se devolvieran, cualquiera podría forzarlas para generar sin límite.
        if (!abort.signal.aborted && !e?.billed) await slot?.refund();
        if (!abort.signal.aborted) {
          if (!(e instanceof PlannerError)) console.error('plan error', e?.status, e?.message);
          send({ type: 'error', error: friendlyError(e, lang) });
        }
      } finally {
        clearInterval(ping);
        closed = true;
        try { controller.close(); } catch { /* ya cerrado */ }
      }
    },
    cancel() {
      // La persona cerró la app o cortó la conexión: no se sigue generando (ni pagando).
      clearInterval(ping);
      abort.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' },
  });
}
