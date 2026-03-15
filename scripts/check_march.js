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
  // 1) salesDaily for March 2026
  const salesSnap = await getDocs(collection(db, 'salesDaily'));
  const marchSales = [];
  salesSnap.forEach(d => {
    const data = d.data();
    if (data.date && data.date.startsWith('2026-03')) {
      marchSales.push({ id: d.id, ...data });
    }
  });
  marchSales.sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product));

  console.log('=== 2026년 3월 salesDaily (매출현황) ===');
  for (const e of marchSales) {
    const hp = e.housePurchase || 0;
    console.log(`  ${e.date} | ${e.product} | 가구매: ${hp.toLocaleString()} | 마진: ${(e.totalMargin||0).toLocaleString()} | 수량: ${e.quantity||0}`);
  }
  console.log(`  총 ${marchSales.length}건\n`);

  // 2) manualEntries for March 2026
  const manualSnap = await getDocs(collection(db, 'manualEntries'));
  const marchManual = [];
  manualSnap.forEach(d => {
    const data = d.data();
    if (data.date && data.date.startsWith('2026-03')) {
      marchManual.push({ id: d.id, date: data.date, product: data.product, name1: data.name1 || '', ordererName: data.ordererName || '' });
    }
  });
  marchManual.sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product));

  console.log('=== 2026년 3월 manualEntries (구매목록) ===');
  const byDateProduct = {};
  for (const e of marchManual) {
    const key = `${e.date}_${e.product}`;
    if (!byDateProduct[key]) byDateProduct[key] = 0;
    byDateProduct[key]++;
  }
  for (const [key, count] of Object.entries(byDateProduct)) {
    const [date, product] = [key.substring(0, 10), key.substring(11)];
    console.log(`  ${date} | ${product} | ${count}건`);
  }
  console.log(`  총 ${marchManual.length}건`);

  process.exit(0);
}

check().catch(err => { console.error(err); process.exit(1); });
