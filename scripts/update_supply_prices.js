import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, addDoc, doc } from "firebase/firestore";

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
  const snap = await getDocs(collection(db, "productPrices"));

  // 기존 품목에 supplyPrice 추가 (판매가 - 1000)
  for (const d of snap.docs) {
    const data = d.data();
    if (data.price && !data.supplyPrice) {
      const sp = data.price - 1000;
      await updateDoc(doc(db, "productPrices", d.id), { supplyPrice: sp });
      console.log(`  업데이트: ${data.name} | 공급가: ${sp}`);
    }
  }

  // 총각김치 있는지 확인
  let hasChonggak = false;
  snap.forEach(d => { if (d.data().name === "총각김치") hasChonggak = true; });

  if (!hasChonggak) {
    await addDoc(collection(db, "productPrices"), { name: "총각김치", price: 20800, supplyPrice: 19800 });
    console.log("  추가: 총각김치 | 판매가: 20800 | 공급가: 19800");
  }

  console.log("\n완료!");
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
