import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

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

// El acceso real vive en lib/auth.ts: Luis y Rober entran con Firebase Auth
// (email interno + contraseña). Antes se abría aquí una sesión anónima para
// cumplir las reglas de Firestore, pero eso dejaba el agujero que las reglas
// pretendían cerrar: cualquiera podía crear una sesión anónima con la clave
// pública del bundle y leer o escribir toda la base de datos. Ya no se usa.

export function stripUndef(obj: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj))
}
