// Función serverless (Vercel): POST /api/plan  { mode, input }
import { verifyUser, HttpError } from '../lib/auth.js';
import { runPlanner, PlannerError, Anthropic } from '../lib/planner.js';

let client = null;
const MAX_BODY = 200_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  try {
    await verifyUser(req.headers.authorization);
  } catch (e) {
    return res.status(e instanceof HttpError ? e.status : 401).json({ error: e.message });
  }

  let body = req.body;
  try {
    if (typeof body === 'string') body = JSON.parse(body);
  } catch {
    return res.status(400).json({ error: 'Petición no válida.' });
  }
  if (!body || JSON.stringify(body).length > MAX_BODY) return res.status(413).json({ error: 'La petición es demasiado grande.' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'El servidor no tiene configurada la clave de la IA (ANTHROPIC_API_KEY).' });
  client ||= new Anthropic();

  try {
    const result = await runPlanner(client, body.mode, body.input);
    return res.status(200).json(result);
  } catch (e) {
    if (e instanceof PlannerError) return res.status(422).json({ error: e.message });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'La IA está saturada. Espera un minuto y vuelve a intentarlo.' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'La clave de la IA del servidor no es válida.' });
    if (e instanceof Anthropic.APIError) {
      console.error('Anthropic API error', e.status, e.message);
      return res.status(502).json({ error: 'La IA no está disponible ahora mismo. Inténtalo más tarde.' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Error inesperado en el servidor.' });
  }
}
