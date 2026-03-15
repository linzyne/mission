import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, orderBy } from "firebase/firestore";

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

async function checkData() {
  const snap = await getDocs(collection(db, 'salesDaily'));

  const novEntries = [];
  const decEntries = [];

  snap.forEach(docSnap => {
    const data = docSnap.data();
    const date = data.date || '';

    // Only entries with non-zero housePurchase in 2025-11 or 2025-12
    if (date.startsWith('2025-11') && data.housePurchase !== 0) {
      novEntries.push({ id: docSnap.id, date: data.date, product: data.product, housePurchase: data.housePurchase });
    }
    if (date.startsWith('2025-12') && data.housePurchase !== 0) {
      decEntries.push({ id: docSnap.id, date: data.date, product: data.product, housePurchase: data.housePurchase });
    }
  });

  // Sort by date
  novEntries.sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product));
  decEntries.sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product));

  console.log('=== 2025년 11월 가구매 데이터 (housePurchase ≠ 0) ===');
  if (novEntries.length === 0) {
    console.log('  (없음)');
  } else {
    let novTotal = 0;
    for (const e of novEntries) {
      console.log(`  ${e.date} | ${e.product} | 가구매: ${e.housePurchase.toLocaleString()}원`);
      novTotal += e.housePurchase;
    }
    console.log(`  --- 11월 합계: ${novTotal.toLocaleString()}원 (${novEntries.length}건) ---`);
  }

  console.log('');
  console.log('=== 2025년 12월 가구매 데이터 (housePurchase ≠ 0) ===');
  if (decEntries.length === 0) {
    console.log('  (없음)');
  } else {
    let decTotal = 0;
    for (const e of decEntries) {
      console.log(`  ${e.date} | ${e.product} | 가구매: ${e.housePurchase.toLocaleString()}원`);
      decTotal += e.housePurchase;
    }
    console.log(`  --- 12월 합계: ${decTotal.toLocaleString()}원 (${decEntries.length}건) ---`);
  }

  console.log('');
  console.log(`총 영향받는 문서: ${novEntries.length + decEntries.length}건`);

  process.exit(0);
}

checkData().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
