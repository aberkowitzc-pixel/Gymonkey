// Verifica el token de sesión de Firebase (inicio de sesión con Google) en el servidor.
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Correos con acceso a la IA: ALLOWED_EMAILS (tuyos) y ALLOWED_EMAILS_EXTRA (invitados), separados por comas. Vacío = cualquiera con sesión. */
export function allowedEmails(env = process.env) {
  return `${env.ALLOWED_EMAILS || ''},${env.ALLOWED_EMAILS_EXTRA || ''}`.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function verifyUser(authorization) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    // Solo para desarrollo local: en producción (Vercel) nunca se abre la IA sin sesión.
    if (process.env.ALLOW_ANONYMOUS === 'true' && process.env.VERCEL_ENV !== 'production') return { uid: 'anonimo', email: null };
    throw new HttpError(500, 'El servidor no está configurado (falta FIREBASE_PROJECT_ID).');
  }
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) throw new HttpError(401, 'Inicia sesión con Google para usar la IA.');

  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    }));
  } catch {
    throw new HttpError(401, 'Tu sesión ha caducado. Vuelve a iniciar sesión.');
  }

  // Lista opcional de correos autorizados para controlar el gasto de la IA.
  const allowed = allowedEmails();
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  if (allowed.length && (!email || payload.email_verified !== true || !allowed.includes(email))) {
    throw new HttpError(403, 'Tu cuenta no tiene acceso a la IA de Gymonkey.');
  }
  return { uid: payload.sub, email };
}
