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
  const sdSnap = await getDocs(collection(db, "salesDaily"));
  let fixed = 0;

  // 1) 2025년 11월, 12월: housePurchase를 0으로 (이전에 삭제한 것)
  console.log("=== 2025-11, 2025-12 → housePurchase 0으로 복원 ===");
  for (const d of sdSnap.docs) {
    const data = d.data();
    if (data.date && (data.date.startsWith("2025-11") || data.date.startsWith("2025-12"))) {
      if (data.housePurchase !== 0) {
        await updateDoc(doc(db, "salesDaily", d.id), { housePurchase: 0 });
        console.log(`  ${data.date} | ${data.product} | ${data.housePurchase} → 0`);
        fixed++;
      }
    }
  }
  console.log(`  ${fixed}건 수정\n`);

  console.log("완료!");
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
