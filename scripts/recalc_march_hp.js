import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, setDoc, doc } from "firebase/firestore";

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
  // 1) productPrices 조회
  const ppSnap = await getDocs(collection(db, "productPrices"));
  const ppMap = {};
  ppSnap.forEach(d => {
    const data = d.data();
    if (data.name) ppMap[data.name] = data;
  });

  // 2) 3월 manualEntries 날짜+품목별 건수
  const manualSnap = await getDocs(collection(db, "manualEntries"));
  const combos = {};
  manualSnap.forEach(d => {
    const data = d.data();
    if (data.date && data.date.startsWith("2026-03") && data.product) {
      const key = `${data.date}|||${data.product}`;
      combos[key] = (combos[key] || 0) + 1;
    }
  });

  // 3) 3월 salesDaily 조회
  const sdSnap = await getDocs(collection(db, "salesDaily"));
  const sdMap = {};
  sdSnap.forEach(d => {
    const data = d.data();
    if (data.date && data.date.startsWith("2026-03")) {
      sdMap[`${data.date}|||${data.product}`] = { id: d.id, ...data };
    }
  });

  // 4) 새 공식으로 재계산
  console.log("=== 3월 가구매 재계산 (공식: 1000 + 공급가*11.66% + 2300) ===\n");

  for (const [key, count] of Object.entries(combos)) {
    const date = key.substring(0, 10);
    const product = key.substring(13);
    const pp = ppMap[product];
    const supPrice = pp?.supplyPrice || ((pp?.price || 0) - 1000);

    if (supPrice <= 0) {
      console.log(`  SKIP: ${date} | ${product} | 공급가 없음`);
      continue;
    }

    const unitCost = Math.round(1000 + supPrice * 0.1166 + 2300);
    const hp = -(count * unitCost);

    const existing = sdMap[key];
    if (existing) {
      const oldHp = existing.housePurchase || 0;
      if (oldHp !== hp) {
        await updateDoc(doc(db, "salesDaily", existing.id), { housePurchase: hp });
        console.log(`  업데이트: ${date} | ${product} | ${count}건 | ${oldHp} → ${hp}`);
      } else {
        console.log(`  동일: ${date} | ${product} | ${count}건 | ${hp}`);
      }
    } else {
      const docId = `${date}_${product}`;
      await setDoc(doc(db, "salesDaily", docId), {
        date, product, productDetail: "", quantity: 0, sellingPrice: 0,
        supplyPrice: 0, marginPerUnit: 0, totalMargin: 0,
        adCost: 0, housePurchase: hp, solution: 0,
      });
      console.log(`  생성: ${date} | ${product} | ${count}건 | ${hp}`);
    }
  }

  console.log("\n완료!");
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
