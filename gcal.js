// Google Calendar: una sesión del plan con hora → un evento en el calendario principal de la cuenta.
// `buildEvent` es lógica pura (para probarla); el resto son llamadas a la API REST con el token de acceso.

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const pad = (n) => String(n).padStart(2, '0');

/** "2026-12-01" + "19:30" + 75 min → fecha y hora local de fin ("2026-12-01T20:45:00"), cruzando medianoche si hace falta. */
export function endOf(iso, time, minutes) {
  const [y, m, d] = iso.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const e = new Date(y, m - 1, d, h, mi + minutes);
  return `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}T${pad(e.getHours())}:${pad(e.getMinutes())}:00`;
}

/**
 * Cuerpo del evento. `lines`: el resumen de la sesión (una línea por ejercicio), ya traducido.
 * `appUrl` se añade al final para volver a la app desde el evento.
 */
export function buildEvent({ iso, time, minutes = 60, title, lines = [], note = '', appUrl = '', timeZone }) {
  const description = [note, lines.map((l) => `• ${l}`).join('\n'), appUrl].filter(Boolean).join('\n\n');
  return {
    summary: title,
    status: 'confirmed',
    description,
    start: { dateTime: `${iso}T${time}:00`, timeZone },
    end: { dateTime: endOf(iso, time, minutes), timeZone },
    reminders: { useDefault: true },
    extendedProperties: { private: { gymonkey: '1' } },
  };
}

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204 || (method === 'DELETE' && (res.status === 404 || res.status === 410))) return null;
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error?.message || msg; } catch (_) { /* sin cuerpo */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Crea el evento, o lo actualiza si ya existía (si se borró desde el calendario, se crea de nuevo). */
export async function upsertEvent(token, eventId, event) {
  if (eventId) {
    try { return await call(token, 'PUT', `/${encodeURIComponent(eventId)}`, event); } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
  }
  return call(token, 'POST', '', event);
}

export const deleteEvent = (token, eventId) => call(token, 'DELETE', `/${encodeURIComponent(eventId)}`);
