import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

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

async function run() {
  // 1) productPrices
  const ppSnap = await getDocs(collection(db, "productPrices"));
  const ppMap = {};
  ppSnap.forEach(d => {
    const data = d.data();
    if (data.name) ppMap[data.name] = data;
  });

  // 2) 3월 제외 manualEntries 날짜+품목별 건수
  const manualSnap = await getDocs(collection(db, "manualEntries"));
  const combos = {};
  manualSnap.forEach(d => {
    const data = d.data();
    if (data.date && data.product && !data.date.startsWith("2026-03")) {
      const key = `${data.date}|||${data.product}`;
      combos[key] = (combos[key] || 0) + 1;
    }
  });

  // 3) 3월 제외 salesDaily 조회
  const sdSnap = await getDocs(collection(db, "salesDaily"));
  const sdMap = {};
  sdSnap.forEach(d => {
    const data = d.data();
    if (data.date && !data.date.startsWith("2026-03")) {
      sdMap[`${data.date}|||${data.product}`] = { id: d.id, ...data };
    }
  });

  // 4) 원래 공식으로 복구: -(count * Math.round(판매가 * 0.88 - 1000 - 2300))
  console.log("=== 3월 제외 가구매 복구 (원래 공식: 판매가*0.88 - 1000 - 2300) ===\n");
  let updated = 0;

  for (const [key, count] of Object.entries(combos)) {
    const date = key.substring(0, 10);
    const product = key.substring(13);
    const pp = ppMap[product];
    const sellingPrice = pp?.sellingPrice || pp?.price || 0;
    if (sellingPrice === 0) continue;

    const oldHp = -(count * Math.round(sellingPrice * 0.88 - 1000 - 2300));

    const existing = sdMap[key];
    if (existing && existing.housePurchase !== oldHp) {
      await updateDoc(doc(db, "salesDaily", existing.id), { housePurchase: oldHp });
      console.log(`  복구: ${date} | ${product} | ${count}건 | ${existing.housePurchase} → ${oldHp}`);
      updated++;
    }
  }

  console.log(`\n총 ${updated}건 복구 완료!`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
