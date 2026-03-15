import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

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

const toDelete = new Set([
  // 총각김치2 (3건)
  "총각김치2 2kg",
  "총각김치2 5kg",
  "총각김치2 10kg",
  // 제이제이 (3건)
  "제주 순살 갈치 5마리",
  "제주 은갈치 5마리 (중)",
  "제주 은갈치 5마리 (대)",
  // 웰그린 - 당근 (12건)
  "제주 구좌 당근 중 3kg",
  "제주 구좌 당근 상 3kg",
  "제주 구좌 당근 특 3kg",
  "제주 구좌 당근 중 5kg",
  "제주 구좌 당근 상 5kg",
  "제주 구좌 당근 특 5kg",
  "제주 구좌 당근 중 10kg",
  "제주 구좌 당근 상 10kg",
  "제주 구좌 당근 특 10kg",
  "제주 구좌 당근 왕 3kg",
  "제주 구좌 당근 왕 5kg",
  "제주 구좌 당근 왕 10kg",
  // 웰그린 - ★A급 부사 사과 (4건)
  "★A급 부사 사과 10kg",
  "★A급 부사 사과 2kg",
  "★A급 부사 사과 5kg",
  "★A급 부사 사과 3kg",
]);

async function revert() {
  const snap = await getDocs(collection(db, 'productPrices'));
  let deleted = 0;

  for (const docSnap of snap.docs) {
    const name = docSnap.data().name;
    if (toDelete.has(name)) {
      await deleteDoc(doc(db, 'productPrices', docSnap.id));
      console.log(`  삭제: ${name}`);
      deleted++;
    }
  }

  console.log(`\n총 ${deleted}건 삭제 완료`);
  process.exit(0);
}

revert().catch(err => { console.error(err); process.exit(1); });
