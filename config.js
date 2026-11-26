// Configuración pública de Firebase (no es secreta: Firebase la diseña para ir en el navegador;
// la seguridad la ponen las reglas de Firestore y los dominios autorizados).
// Si es null, la app funciona solo en el dispositivo, sin cuentas ni sincronización.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCKslvT7zrEgfjDsPnQ9xWp8dxeQuj_3iA',
  authDomain: 'gymonkey.firebaseapp.com',
  projectId: 'gymonkey',
  storageBucket: 'gymonkey.firebasestorage.app',
  messagingSenderId: '61365734498',
  appId: '1:61365734498:web:6a3514424d3f0a101ed53b',
};

// true = la IA se simula con planes de ejemplo (para probar la app sin servidor).
export const DEMO_AI = false;
