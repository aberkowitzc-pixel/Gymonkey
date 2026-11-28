// Punto de entrada para empaquetar solo las partes de Firebase que usa la app.
// Regenerar con: npm run build:firebase
export { initializeApp } from 'firebase/app';
export {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, reauthenticateWithPopup,
} from 'firebase/auth';
export { getFirestore, doc, getDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
