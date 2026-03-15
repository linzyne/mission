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
  console.log('=== 현재 productPrices 목록 ===');
  snap.forEach(docSnap => {
    const d = docSnap.data();
    console.log(`  ${d.name} | price: ${d.price} | supplyPrice: ${d.supplyPrice || '-'} | sellingPrice: ${d.sellingPrice || '-'} | margin: ${d.margin || '-'}`);
  });
  console.log(`\n총 ${snap.size}개 품목`);

  // Check if 총각김치2 exists
  const has = snap.docs.some(d => d.data().name === '총각김치2');
  console.log(`\n총각김치2 존재 여부: ${has ? '있음' : '없음'}`);

  process.exit(0);
}

check().catch(err => { console.error(err); process.exit(1); });
