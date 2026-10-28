import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// 윙_발주 앱(wing-order) Firestore — 가구매 명단·일괄 입금목록 자동 연동용 (웹 설정값이라 공개돼도 됨)
const wingApp = initializeApp({
    apiKey: 'AIzaSyD8x9WQ9FV48nzlO8u_ioUhJH8NhrGy9Ps',
    authDomain: 'wing-order-3ab84.firebaseapp.com',
    projectId: 'wing-order-3ab84',
    storageBucket: 'wing-order-3ab84.firebasestorage.app',
    messagingSenderId: '1034544724929',
    appId: '1:1034544724929:web:f4c76de1854a9f4d170d40',
}, 'wing');
export const wingDb = getFirestore(wingApp);
