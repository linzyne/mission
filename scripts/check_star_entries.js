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
  const snap = await getDocs(collection(db, 'productPrices'));

  console.log('=== ★A급 또는 부사 관련 항목 ===');
  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (d.name && (d.name.includes('★') || d.name.includes('A급') || d.name.includes('부사'))) {
      console.log(`  [${docSnap.id}] ${d.name} | price: ${d.price} | supply: ${d.supplyPrice || '-'} | selling: ${d.sellingPrice || '-'}`);
    }
  });

  console.log('\n=== 갈치/은갈치/당근 관련 항목 ===');
  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (d.name && (d.name.includes('갈치') || d.name.includes('당근'))) {
      console.log(`  [${docSnap.id}] ${d.name} | price: ${d.price} | supply: ${d.supplyPrice || '-'} | selling: ${d.sellingPrice || '-'}`);
    }
  });

  process.exit(0);
}

check().catch(err => { console.error(err); process.exit(1); });
