// Configuración pública de Firebase (no es secreta: Firebase la diseña para ir en el navegador;
// la seguridad la ponen las reglas de Firestore y los dominios autorizados).
// Cópiala desde Firebase → Configuración del proyecto → Tus apps → Configuración del SDK.
// Mientras sea null, la app funciona solo en el dispositivo, sin cuentas ni sincronización.
export const FIREBASE_CONFIG = null;

// true = la IA se simula con planes de ejemplo (para probar la app sin servidor).
export const DEMO_AI = false;
/* Ejemplo:
export const FIREBASE_CONFIG = {
  apiKey: '...',
  authDomain: 'tu-proyecto.firebaseapp.com',
  projectId: 'tu-proyecto',
  storageBucket: 'tu-proyecto.firebasestorage.app',
  messagingSenderId: '...',
  appId: '...',
};
*/
