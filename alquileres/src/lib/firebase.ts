import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

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

export function stripUndef(obj: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj))
}
