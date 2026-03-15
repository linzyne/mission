import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBKVIc3tVt3kpCYmwudTZIjd3tcfqNO_io",
  authDomain: "mission-84840.firebaseapp.co",
  projectId: "mission-84840",
  storageBucket: "mission-84840.firebasestorage.app",
  messagingSenderId: "702323235874",
  appId: "1:702323235874:web:f42534ac69deac8b567e7b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  // Check manualEntries for product names containing ★ or A급 or 부사
  const snap = await getDocs(collection(db, 'manualEntries'));
  const productNames = new Set();
  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (d.product) productNames.add(d.product);
  });

  console.log('=== manualEntries 품목명 중 부사/★/A급 포함 ===');
  for (const name of [...productNames].sort()) {
    if (name.includes('★') || name.includes('A급') || name.includes('부사')) {
      console.log(`  ${name}`);
    }
  }

  console.log('\n=== manualEntries 전체 품목명 ===');
  for (const name of [...productNames].sort()) {
    console.log(`  ${name}`);
  }

  process.exit(0);
}

check().catch(err => { console.error(err); process.exit(1); });
