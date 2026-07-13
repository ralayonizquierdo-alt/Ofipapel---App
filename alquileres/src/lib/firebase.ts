import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyDLqPoqiMgiqbk5Uv-4RoYrbA-5Yfc1A_s',
  authDomain: 'ofipapelvv.firebaseapp.com',
  projectId: 'ofipapelvv',
  storageBucket: 'ofipapelvv.firebasestorage.app',
  messagingSenderId: '174682944426',
  appId: '1:174682944426:web:13527b8128ffb85aa2b1d3',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const db = getFirestore(firebaseApp)
export const auth = getAuth(firebaseApp)

// La app no tiene login con usuario real de Firebase (la pantalla de
// Luis/Rober solo bloquea la UI, no los datos): esto abre una sesión anónima
// para que las reglas de Firestore (ver firestore.rules, exigen
// request.auth != null) puedan bloquear el acceso directo a la API usando
// solo la clave pública. Se llama en paralelo al arrancar, sin bloquear la
// carga de datos — mientras el proveedor "Anonymous" no esté activado en
// Firebase Console > Authentication > Sign-in method (o las reglas sigan en
// modo abierto), esto falla en silencio y la app sigue funcionando igual
// que hoy; en cuanto se activen ambas cosas, empieza a autenticar de verdad
// sin necesidad de tocar el código otra vez.
export function ensureAnonSession(): Promise<void> {
  if (auth.currentUser) return Promise.resolve()
  return signInAnonymously(auth).then(() => undefined)
}

export function stripUndef(obj: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj))
}
