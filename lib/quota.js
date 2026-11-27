// Cuota diaria por persona y por tipo de petición, para que el acceso abierto no dispare el gasto de la IA.
// Los contadores viven en Upstash Redis (se añade desde Vercel → Storage); aquí se usa su API REST, sin dependencias.
// Cada contador es del tipo quota:<uid>:<modo>:<día UTC> y caduca solo a los dos días.

/** Peticiones por persona y día. Se pueden cambiar con variables QUOTA_<MODO> (p. ej. QUOTA_GENERATE=3). */
export const DEFAULT_LIMITS = {
  questions: 4,   // preguntas previas al plan
  generate: 2,    // planes nuevos (lo más caro)
  adapt: 8,       // ajustes del plan
  chat: 60,       // mensajes al coach
  sessions: 20,   // dictado o importación de sesiones
  review: 6,      // revisión de la semana
  loads: 6,       // estimación de cargas
};

export const limitFor = (mode, env = process.env) => {
  const own = Number(env[`QUOTA_${String(mode).toUpperCase()}`]);
  return Number.isFinite(own) && own >= 0 ? own : DEFAULT_LIMITS[mode] ?? 10;
};

const backend = (env = process.env) => {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
};
export const quotaConfigured = (env = process.env) => !!backend(env);

const day = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/**
 * Cuenta una petición. Devuelve { ok, limit, used, refund() }.
 * Si el servicio de contadores falla, se deja pasar (y se registra): una caída no debe dejar sin IA a todo el mundo.
 */
export async function takeQuota(uid, mode, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const be = backend(env);
  const limit = limitFor(mode, env);
  if (!be) return { ok: true, limit, used: 0, refund: async () => {} };
  const key = `quota:${uid}:${mode}:${day(now)}`;
  const call = (commands) => fetchImpl(`${be.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${be.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  }).then(async (r) => { if (!r.ok) throw new Error(`quota ${r.status}`); return r.json(); });
  try {
    const out = await call([['INCR', key], ['EXPIRE', key, 172800]]);
    const used = Number(out?.[0]?.result);
    if (!Number.isFinite(used)) throw new Error('quota: respuesta inesperada');
    // Si falla la IA, la petición no cuenta: se devuelve el intento.
    const refund = async () => { try { await call([['DECR', key]]); } catch (e) { console.error('quota refund', e?.message); } };
    return { ok: used <= limit, limit, used, refund };
  } catch (e) {
    console.error('quota error', e?.message);
    return { ok: true, limit, used: 0, refund: async () => {} };
  }
}
