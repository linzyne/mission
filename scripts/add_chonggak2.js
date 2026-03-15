import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

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

const entries = [
  { name: "총각김치2 2kg", price: 19800, supplyPrice: 12600, sellingPrice: 19800, margin: 2309 },
  { name: "총각김치2 5kg", price: 39800, supplyPrice: 23800, sellingPrice: 39800, margin: 4641 },
  { name: "총각김치2 10kg", price: 69800, supplyPrice: 44000, sellingPrice: 69800, margin: 8139 },
];

async function add() {
  const colRef = collection(db, 'productPrices');

  for (const entry of entries) {
    await addDoc(colRef, entry);
    console.log(`추가됨: ${entry.name} | price: ${entry.price} | supply: ${entry.supplyPrice} | margin: ${entry.margin}`);
  }

  console.log('\n총각김치2 3개 중량 추가 완료!');
  process.exit(0);
}

add().catch(err => { console.error(err); process.exit(1); });
