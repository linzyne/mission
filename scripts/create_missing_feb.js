import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, setDoc, doc } from "firebase/firestore";

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

// 부사 사과 2월 누락 데이터
const missing = {
  "2026-02-09": [0,0,0,0,-66941,0],
  "2026-02-10": [0,0,0,0,-73027,0],
  "2026-02-11": [0,0,0,0,-79112,0],
  "2026-02-12": [0,0,0,0,-54770,0],
  "2026-02-13": [0,0,0,0,-12171,0],
  "2026-02-14": [0,0,0,0,-36513,0],
  "2026-02-16": [0,0,0,0,-42599,0],
  "2026-02-17": [0,0,0,0,-30428,0],
};

async function run() {
  // 기존 부사 사과 2월 항목 확인
  const snap = await getDocs(collection(db, "salesDaily"));
  const existing = new Set();
  snap.forEach(d => {
    const e = d.data();
    if (e.product === "부사 사과" && e.date && e.date.startsWith("2026-02")) {
      existing.add(e.date);
    }
  });

  let created = 0;
  for (const [date, vals] of Object.entries(missing)) {
    if (existing.has(date)) {
      console.log(`  이미 존재: ${date}`);
      continue;
    }
    const docId = `${date}_부사 사과`;
    await setDoc(doc(db, "salesDaily", docId), {
      date, product: "부사 사과", productDetail: "",
      quantity: vals[2], sellingPrice: 0,
      supplyPrice: vals[0], marginPerUnit: 0, totalMargin: vals[1],
      adCost: vals[3], housePurchase: vals[4], solution: vals[5],
    });
    console.log(`  생성: ${date} | 부사 사과 | 가구매: ${vals[4]}`);
    created++;
  }

  console.log(`\n${created}건 생성 완료!`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
