import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";

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

async function clearHousePurchase() {
  const snap = await getDocs(collection(db, 'salesDaily'));

  const toUpdate = [];

  snap.forEach(docSnap => {
    const data = docSnap.data();
    const date = data.date || '';

    // Only 2025-11 and 2025-12 entries with non-zero housePurchase
    if ((date.startsWith('2025-11') || date.startsWith('2025-12')) && data.housePurchase !== 0) {
      toUpdate.push({ id: docSnap.id, date: data.date, product: data.product, oldValue: data.housePurchase });
    }
  });

  if (toUpdate.length === 0) {
    console.log('변경할 데이터가 없습니다.');
    process.exit(0);
    return;
  }

  console.log(`총 ${toUpdate.length}건의 housePurchase를 0으로 변경합니다...`);

  // Batch update (max 500 per batch)
  const BATCH_SIZE = 450;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);

    for (const entry of chunk) {
      batch.update(doc(db, 'salesDaily', entry.id), { housePurchase: 0 });
    }

    await batch.commit();
    console.log(`배치 ${Math.floor(i / BATCH_SIZE) + 1} 완료 (${Math.min(i + BATCH_SIZE, toUpdate.length)}/${toUpdate.length})`);
  }

  console.log('');
  console.log('=== 완료 ===');
  console.log(`${toUpdate.length}건의 housePurchase가 0으로 변경되었습니다.`);
  console.log('다른 필드(공급가, 마진, 수량, 광고비, 솔룻)는 변경되지 않았습니다.');

  process.exit(0);
}

clearHousePurchase().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
