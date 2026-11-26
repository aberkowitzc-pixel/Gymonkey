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

export async function signOutCloud() { await fb.signOut(auth); remoteWorkoutIds = new Set(); }

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
