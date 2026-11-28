// Cuenta de usuario (Google) y sincronización de datos con Firestore.
// Estructura en Firestore:
//   users/{uid}                 → ajustes, ejercicios, rutinas, plan, perfil, entreno en curso
//   users/{uid}/workouts/{id}   → un documento por entreno terminado
import { FIREBASE_CONFIG } from './config.js';

export const cloudConfigured = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey);

let fb = null, auth = null, db = null, user = null;
let remoteWorkoutIds = new Set();

export async function initCloud(onUserChange) {
  if (!cloudConfigured) return;
  fb = await import('./vendor/firebase.js');
  const app = fb.initializeApp(FIREBASE_CONFIG);
  auth = fb.getAuth(app);
  db = fb.getFirestore(app);
  fb.getRedirectResult(auth).catch(() => {});
  fb.onAuthStateChanged(auth, (u) => { user = u; onUserChange(u); });
}

export const currentUser = () => user;

export async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await fb.signInWithRedirect(auth, provider);
    } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      throw e;
    }
  }
}

export async function signOutCloud() { dropCalendarToken(); await fb.signOut(auth); remoteWorkoutIds = new Set(); }

// Acceso a Google Calendar: un token de OAuth (dura ~1 h) pedido con un permiso extra sobre la misma cuenta.
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CAL_KEY = 'gymonkey-cal-token';
let calToken = null;

/**
 * Token para la API de Calendar. Si no hay uno vigente y `interactive`, abre la ventana de Google
 * (la primera vez pide permiso para el calendario; después solo confirma la cuenta).
 */
export async function calendarToken({ interactive = true } = {}) {
  if (!user) throw new Error('not-signed-in');
  if (!calToken) { try { calToken = JSON.parse(sessionStorage.getItem(CAL_KEY)); } catch (_) { calToken = null; } }
  if (calToken && calToken.uid === user.uid && calToken.exp > Date.now() + 120e3) return calToken.token;
  if (!interactive) return null;
  const provider = new fb.GoogleAuthProvider();
  provider.addScope(CAL_SCOPE);
  if (user.email) provider.setCustomParameters({ login_hint: user.email });
  const res = await fb.reauthenticateWithPopup(user, provider);
  const token = fb.GoogleAuthProvider.credentialFromResult(res)?.accessToken;
  if (!token) throw new Error('no-token');
  calToken = { token, uid: user.uid, exp: Date.now() + 55 * 60e3 };
  try { sessionStorage.setItem(CAL_KEY, JSON.stringify(calToken)); } catch (_) { /* ignorar */ }
  return token;
}

/** El token guardado dejó de valer (caducado o permiso retirado): la próxima vez se pide otro. */
export function dropCalendarToken() { calToken = null; try { sessionStorage.removeItem(CAL_KEY); } catch (_) { /* ignorar */ } }

export async function idToken() { return user ? user.getIdToken() : null; }

// Firestore no admite valores `undefined`.
const clean = (o) => JSON.parse(JSON.stringify(o));

export async function pullRemote() {
  const uid = user.uid;
  const snap = await fb.getDoc(fb.doc(db, 'users', uid));
  const ws = await fb.getDocs(fb.collection(db, 'users', uid, 'workouts'));
  const workouts = ws.docs.map((d) => d.data());
  remoteWorkoutIds = new Set(workouts.map((w) => w.id));
  return { main: snap.exists() ? snap.data() : null, workouts };
}

/** Sube el estado: el documento principal entero y solo los entrenos nuevos o borrados. */
export async function pushState(state) {
  const uid = user.uid;
  const { workouts, ...main } = state;
  const ops = [(b) => b.set(fb.doc(db, 'users', uid), clean(main))];
  const ids = new Set(workouts.map((w) => w.id));
  for (const w of workouts) if (!remoteWorkoutIds.has(w.id)) ops.push((b) => b.set(fb.doc(db, 'users', uid, 'workouts', w.id), clean(w)));
  for (const id of remoteWorkoutIds) if (!ids.has(id)) ops.push((b) => b.delete(fb.doc(db, 'users', uid, 'workouts', id)));
  // Un lote de Firestore admite como máximo 500 operaciones.
  for (let i = 0; i < ops.length; i += 400) {
    const batch = fb.writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  remoteWorkoutIds = ids;
}
