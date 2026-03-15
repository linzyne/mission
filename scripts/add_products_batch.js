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
  // === 제이제이 ===
  { name: "제주 순살 갈치 5마리", price: 23800, supplyPrice: 15500, sellingPrice: 23800, margin: 2775 },
  { name: "제주 은갈치 5마리 (중)", price: 26800, supplyPrice: 19000, sellingPrice: 26800, margin: 3125 },
  { name: "제주 은갈치 5마리 (대)", price: 46500, supplyPrice: 35500, sellingPrice: 46500, margin: 5422 },

  // === 웰그린 - 제주 구좌 당근 ===
  { name: "제주 구좌 당근 중 3kg", price: 8040, supplyPrice: 5400, sellingPrice: 8040, margin: 937 },
  { name: "제주 구좌 당근 상 3kg", price: 8650, supplyPrice: 5700, sellingPrice: 8650, margin: 1009 },
  { name: "제주 구좌 당근 특 3kg", price: 8250, supplyPrice: 6000, sellingPrice: 8250, margin: 962 },
  { name: "제주 구좌 당근 중 5kg", price: 11230, supplyPrice: 7000, sellingPrice: 11230, margin: 1309 },
  { name: "제주 구좌 당근 상 5kg", price: 11890, supplyPrice: 7700, sellingPrice: 11890, margin: 1386 },
  { name: "제주 구좌 당근 특 5kg", price: 11730, supplyPrice: 8400, sellingPrice: 11730, margin: 1368 },
  { name: "제주 구좌 당근 중 10kg", price: 14800, supplyPrice: 10500, sellingPrice: 14800, margin: 1726 },
  { name: "제주 구좌 당근 상 10kg", price: 16800, supplyPrice: 11500, sellingPrice: 16800, margin: 1959 },
  { name: "제주 구좌 당근 특 10kg", price: 17800, supplyPrice: 12500, sellingPrice: 17800, margin: 2075 },
  { name: "제주 구좌 당근 왕 3kg", price: 7850, supplyPrice: 5000, sellingPrice: 7850, margin: 915 },
  { name: "제주 구좌 당근 왕 5kg", price: 9400, supplyPrice: 6300, sellingPrice: 9400, margin: 1096 },
  { name: "제주 구좌 당근 왕 10kg", price: 13800, supplyPrice: 9500, sellingPrice: 13800, margin: 1609 },

  // === 웰그린 - ★A급 부사 사과 ===
  { name: "★A급 부사 사과 10kg", price: 43500, supplyPrice: 32500, sellingPrice: 43500, margin: 5072 },
  { name: "★A급 부사 사과 2kg", price: 10900, supplyPrice: 8250, sellingPrice: 10900, margin: 1271 },
  { name: "★A급 부사 사과 5kg", price: 23800, supplyPrice: 17650, sellingPrice: 23800, margin: 2775 },
  { name: "★A급 부사 사과 3kg", price: 17800, supplyPrice: 12450, sellingPrice: 17800, margin: 2075 },
];

async function add() {
  const colRef = collection(db, 'productPrices');

  console.log(`총 ${entries.length}개 품목 추가 시작...\n`);

  for (const entry of entries) {
    await addDoc(colRef, entry);
    console.log(`  추가: ${entry.name} | 판매가: ${entry.price.toLocaleString()} | 공급가: ${entry.supplyPrice.toLocaleString()} | 마진: ${entry.margin.toLocaleString()}`);
  }

  console.log(`\n${entries.length}개 품목 추가 완료!`);
  process.exit(0);
}

add().catch(err => { console.error(err); process.exit(1); });
