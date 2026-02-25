import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch } from "firebase/firestore";

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

// Helper: create entry
function e(date, product, supplyPrice, totalMargin, quantity, adCost, housePurchase, solution) {
  return {
    date,
    product,
    productDetail: '',
    quantity: quantity || 0,
    sellingPrice: 0,
    supplyPrice: supplyPrice || 0,
    marginPerUnit: 0,
    totalMargin: totalMargin || 0,
    adCost: adCost || 0,
    housePurchase: housePurchase || 0,
    solution: solution || 0,
  };
}

function d(day) {
  return `2026-01-${String(day).padStart(2, '0')}`;
}

async function importData() {
  const allEntries = [];

  // ===== 고랭지김치 =====
  const p1 = '고랭지김치';
  allEntries.push(e(d(1), p1, 0, 0, 0, -101343, 0, 0));
  allEntries.push(e(d(2), p1, 0, 0, 0, -98423, -6819, 0));
  allEntries.push(e(d(3), p1, 0, 0, 0, -99579, -13637, 0));
  allEntries.push(e(d(4), p1, 0, 0, 0, -91934, -13637, 0));
  allEntries.push(e(d(5), p1, 3071900, 1183639, 107, -29570, 0, 0));
  allEntries.push(e(d(6), p1, 244500, 92782, 9, 0, -20456, 0));
  allEntries.push(e(d(7), p1, 263200, 92987, 10, 0, -20456, 0));
  allEntries.push(e(d(8), p1, 115300, 43712, 4, 0, -13637, 0));
  allEntries.push(e(d(9), p1, 33000, 0, 1, 0, -13637, -220000));
  allEntries.push(e(d(10), p1, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(11), p1, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(12), p1, 486600, 188141, 18, -1305, 0, 0));
  allEntries.push(e(d(13), p1, 161400, 46552, 8, -3036, 0, 0));
  allEntries.push(e(d(14), p1, 70200, 11163, 4, -21808, 0, 0));
  allEntries.push(e(d(15), p1, 107900, 13400, 4, -20382, 0, 0));
  allEntries.push(e(d(16), p1, 124500, 38752, 6, -24399, 0, 0));
  allEntries.push(e(d(17), p1, 0, 0, 0, -43781, 0, 0));
  allEntries.push(e(d(18), p1, 0, 0, 0, -85939, -6819, 0));
  allEntries.push(e(d(19), p1, 680100, 257011, 24, -36596, -6819, 0));
  allEntries.push(e(d(20), p1, 305800, 109751, 12, -16858, -20456, 0));
  allEntries.push(e(d(21), p1, 194800, 68277, 8, -13573, -27274, 0));
  allEntries.push(e(d(22), p1, 172700, 27044, 9, -11060, -6819, 0));
  allEntries.push(e(d(23), p1, 164600, 60137, 6, 0, 0, 0));
  allEntries.push(e(d(24), p1, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(25), p1, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(26), p1, 415700, 139782, 17, 0, -13637, 0));
  allEntries.push(e(d(27), p1, 65200, 11126, 4, 0, -6819, 0));
  allEntries.push(e(d(28), p1, 159400, 57210, 7, 0, -13637, 0));
  allEntries.push(e(d(29), p1, 133400, 38510, 7, 0, -6819, 0));
  allEntries.push(e(d(30), p1, 180100, 46757, 9, 0, -6819, 0));
  allEntries.push(e(d(31), p1, 0, 0, 0, 0, 0, 0));

  // ===== 포기김치 =====
  const p2 = '포기김치';
  allEntries.push(e(d(1), p2, 0, 0, 0, -111650, 0, 0));
  allEntries.push(e(d(2), p2, 2649200, 549569, 86, -104568, -13565, 0));
  allEntries.push(e(d(3), p2, 0, 0, 0, -112400, -20347, 0));
  allEntries.push(e(d(4), p2, 0, 0, 0, -111724, -13565, 0));
  allEntries.push(e(d(5), p2, 2333400, 476598, 82, -112394, 0, 0));
  allEntries.push(e(d(6), p2, 1056400, 219521, 35, -110128, 0, 0));
  allEntries.push(e(d(7), p2, 980800, 204520, 32, -113798, -13565, 0));
  allEntries.push(e(d(8), p2, 935700, 192534, 32, -115093, -13565, 0));
  allEntries.push(e(d(9), p2, 931100, 193027, 31, -111175, -13565, 0));
  allEntries.push(e(d(10), p2, 0, 0, 0, -113568, 0, 0));
  allEntries.push(e(d(11), p2, 0, 0, 0, -111650, -6782, 0));
  allEntries.push(e(d(12), p2, 2549400, 527597, 85, -108008, -27130, 0));
  allEntries.push(e(d(13), p2, 1299500, 267033, 45, -112346, -13565, 0));
  allEntries.push(e(d(14), p2, 0, 0, 0, -114596, -13565, 0));
  allEntries.push(e(d(15), p2, 1960800, 405069, 66, -111650, -6782, 0));
  allEntries.push(e(d(16), p2, 730600, 153516, 23, -102158, 0, 0));
  allEntries.push(e(d(17), p2, 0, 0, 0, -115815, 0, 0));
  allEntries.push(e(d(18), p2, 0, 0, 0, -105443, -13565, 0));
  allEntries.push(e(d(19), p2, 2092800, 433070, 70, -104922, 0, -220000));
  allEntries.push(e(d(20), p2, 862200, 173056, 32, -115100, 0, 0));
  allEntries.push(e(d(21), p2, 950300, 195028, 33, -110085, -13565, 0));
  allEntries.push(e(d(22), p2, 2447000, 500093, 86, -109083, -13565, 0));
  allEntries.push(e(d(23), p2, 1076900, 226027, 34, -98739, 0, 0));
  allEntries.push(e(d(24), p2, 0, 0, 0, -118140, -27130, 0));
  allEntries.push(e(d(25), p2, 0, 0, 0, -124251, 0, 0));
  allEntries.push(e(d(26), p2, 2797900, 578587, 94, -117281, -13565, 0));
  allEntries.push(e(d(27), p2, 1267800, 264537, 41, -114304, -13565, 0));
  allEntries.push(e(d(28), p2, 1037200, 217520, 33, -109440, -13565, 0));
  allEntries.push(e(d(29), p2, 707200, 147516, 23, 0, -6782, 0));
  allEntries.push(e(d(30), p2, 990400, 205520, 33, 0, -13565, 0));
  allEntries.push(e(d(31), p2, 0, 0, 0, 0, 0, 0));

  // ===== 총각김치 =====
  const p3 = '총각김치';
  allEntries.push(e(d(1), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(2), p3, 213000, 33927, 15, 0, -12285, 0));
  allEntries.push(e(d(3), p3, 0, 0, 0, 0, -12285, 0));
  allEntries.push(e(d(4), p3, 0, 0, 0, 0, -6142, 0));
  allEntries.push(e(d(5), p3, 90600, 16291, 5, 0, 0, 0));
  allEntries.push(e(d(6), p3, 35400, 6473, 3, 0, 0, 0));
  allEntries.push(e(d(7), p3, 11800, 2158, 1, 0, -12285, 0));
  allEntries.push(e(d(8), p3, 71000, 12923, 5, 0, -36854, 0));
  allEntries.push(e(d(9), p3, 0, 0, 0, 0, -6142, 0));
  allEntries.push(e(d(10), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(11), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(12), p3, 106800, 19350, 6, 0, 0, 0));
  allEntries.push(e(d(13), p3, 59400, 10742, 3, 0, 0, 0));
  allEntries.push(e(d(14), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(15), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(16), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(17), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(18), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(19), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(20), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(21), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(22), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(23), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(24), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(25), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(26), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(27), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(28), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(29), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(30), p3, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(31), p3, 0, 0, 0, 0, 0, 0));

  // ===== 굴_제이 (1월) =====
  const p4 = '굴_제이 (1월)';
  allEntries.push(e(d(1), p4, 0, 0, 0, -139113, 0, 0));
  allEntries.push(e(d(2), p4, 0, 0, 0, -118656, 0, 0));
  allEntries.push(e(d(3), p4, 0, 0, 0, -130645, -17867, 0));
  allEntries.push(e(d(4), p4, 0, 0, 0, -140558, -17867, 0));
  allEntries.push(e(d(5), p4, 0, 0, 0, -150781, 0, 0));
  allEntries.push(e(d(6), p4, 781000, 229963, 40, -139024, -77424, 0));
  allEntries.push(e(d(7), p4, 401000, 113139, 35, -138167, -35734, 0));
  allEntries.push(e(d(8), p4, 667000, 212513, 41, -153770, -59557, 0));
  allEntries.push(e(d(9), p4, 1297000, 372626, 80, -138719, -29779, 0));
  allEntries.push(e(d(10), p4, 0, 0, 0, -112763, 0, 0));
  allEntries.push(e(d(11), p4, 0, 0, 0, -151248, -11911, 0));
  allEntries.push(e(d(12), p4, 2115500, 661998, 111, -157376, -41690, 0));
  allEntries.push(e(d(13), p4, 1279000, 358117, 81, -145126, -23823, 0));
  allEntries.push(e(d(14), p4, 0, 0, 0, -128156, -29779, 0));
  allEntries.push(e(d(15), p4, 1738000, 565200, 96, -146476, -11911, 0));
  allEntries.push(e(d(16), p4, 905500, 285765, 48, -132816, 0, 0));
  allEntries.push(e(d(17), p4, 0, 0, 0, -137297, 0, 0));
  allEntries.push(e(d(18), p4, 0, 0, 0, -140810, 0, 0));
  allEntries.push(e(d(19), p4, 2179000, 648057, 118, -128828, -5956, 0));
  allEntries.push(e(d(20), p4, 0, 0, 0, -137264, 0, 0));
  allEntries.push(e(d(21), p4, 1234500, 349525, 69, -155030, 0, 0));
  allEntries.push(e(d(22), p4, 2328000, 676267, 134, -71141, 0, 0));
  allEntries.push(e(d(23), p4, 13000, 3961, 1, 0, 0, 0));
  allEntries.push(e(d(24), p4, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(25), p4, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(26), p4, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(27), p4, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(28), p4, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(29), p4, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(30), p4, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(31), p4, 0, 0, 0, 0, 0, 0));

  // ===== 굴_신선 (1월) =====
  const p5 = '굴_신선 (1월)';
  allEntries.push(e(d(1), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(2), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(3), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(4), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(5), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(6), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(7), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(8), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(9), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(10), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(11), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(12), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(13), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(14), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(15), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(16), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(17), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(18), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(19), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(20), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(21), p5, 3949700, 3026591, 402, 0, 0, 0));
  allEntries.push(e(d(22), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(23), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(24), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(25), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(26), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(27), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(28), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(29), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(30), p5, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(31), p5, 0, 0, 0, 0, 0, 0));

  // ===== 굴_초록 (1월) =====
  const p6 = '굴_초록 (1월)';
  allEntries.push(e(d(1), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(2), p6, 4105200, 629068, 187, 0, 0, 0));
  allEntries.push(e(d(3), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(4), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(5), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(6), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(7), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(8), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(9), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(10), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(11), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(12), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(13), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(14), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(15), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(16), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(17), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(18), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(19), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(20), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(21), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(22), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(23), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(24), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(25), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(26), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(27), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(28), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(29), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(30), p6, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(31), p6, 0, 0, 0, 0, 0, 0));

  // ===== 한라봉_답도 =====
  const p7 = '한라봉_답도';
  allEntries.push(e(d(1), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(2), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(3), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(4), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(5), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(6), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(7), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(8), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(9), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(10), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(11), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(12), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(13), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(14), p7, 0, 0, 0, 0, -14383, 0));
  allEntries.push(e(d(15), p7, 0, 0, 0, 0, -50342, 0));
  allEntries.push(e(d(16), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(17), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(18), p7, 0, 0, 0, 0, -35958, 0));
  allEntries.push(e(d(19), p7, 0, 0, 0, 0, -14383, -220000));
  allEntries.push(e(d(20), p7, 0, 0, 5, 0, -43150, 0));
  allEntries.push(e(d(21), p7, 0, 0, 1, 0, -35958, 0));
  allEntries.push(e(d(22), p7, 0, 0, 0, 0, -64725, 0));
  allEntries.push(e(d(23), p7, 0, 0, 0, 0, -64725, 0));
  allEntries.push(e(d(24), p7, 0, 0, 0, 0, -43150, 0));
  allEntries.push(e(d(25), p7, 0, 0, 0, 0, -35958, 0));
  allEntries.push(e(d(26), p7, 38500, 7083, 2, 0, -21575, 0));
  allEntries.push(e(d(27), p7, 20000, 3675, 1, 0, 0, 0));
  allEntries.push(e(d(28), p7, 18500, 3408, 4, 0, -14383, 0));
  allEntries.push(e(d(29), p7, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(30), p7, 20000, 3675, 3, 0, -43150, 0));
  allEntries.push(e(d(31), p7, 0, 0, 0, 0, 0, 0));

  // ===== 순살 갈치 (1월 합계) =====
  const p8 = '순살 갈치 (1월 합계)';
  allEntries.push(e(d(1), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(2), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(3), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(4), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(5), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(6), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(7), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(8), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(9), p8, 0, 0, 0, 0, -220000, 0));
  allEntries.push(e(d(10), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(11), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(12), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(13), p8, 0, 0, 0, 0, -77826, 0));
  allEntries.push(e(d(14), p8, 0, 0, 0, 0, -28300, 0));
  allEntries.push(e(d(15), p8, 31000, 11050, 2, 0, -21225, 0));
  allEntries.push(e(d(16), p8, 31000, 11050, 2, 0, 0, 0));
  allEntries.push(e(d(17), p8, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(18), p8, 0, 0, 0, 0, -14150, 0));
  allEntries.push(e(d(19), p8, 124000, 44199, 8, 0, -21225, 0));
  allEntries.push(e(d(20), p8, 0, 0, 0, 0, -35375, 0));
  allEntries.push(e(d(21), p8, 124000, 44199, 8, 0, -21225, 0));
  allEntries.push(e(d(22), p8, 248000, 88399, 16, 0, -35375, 0));
  allEntries.push(e(d(23), p8, 139500, 49724, 9, 0, -28300, 0));
  allEntries.push(e(d(24), p8, 0, 0, 0, 0, -42450, 0));
  allEntries.push(e(d(25), p8, 0, 0, 0, 0, -14150, 0));
  allEntries.push(e(d(26), p8, 1023000, 364645, 66, 0, -49526, 0));
  allEntries.push(e(d(27), p8, 294500, 93973, 17, 0, -49526, 0));
  allEntries.push(e(d(28), p8, 325500, 116023, 21, 0, -35375, 0));
  allEntries.push(e(d(29), p8, 480500, 171273, 31, 0, -28300, 0));
  allEntries.push(e(d(30), p8, 248000, 88399, 16, 0, -14150, 0));
  allEntries.push(e(d(31), p8, 0, 0, 0, 0, 0, 0));

  // ===== 은갈치 (1월) =====
  const p9 = '은갈치 (1월)';
  allEntries.push(e(d(1), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(2), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(3), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(4), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(5), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(6), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(7), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(8), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(9), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(10), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(11), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(12), p9, 0, 0, 0, 0, -81674, 0));
  allEntries.push(e(d(13), p9, 0, 0, 0, 0, -81674, 0));
  allEntries.push(e(d(14), p9, 0, 0, 0, 0, -29700, -220000));
  allEntries.push(e(d(15), p9, 109000, 20506, 4, 0, -74249, 0));
  allEntries.push(e(d(16), p9, 76000, 18700, 4, 0, -81674, 0));
  allEntries.push(e(d(17), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(18), p9, 0, 0, 0, 0, -22275, 0));
  allEntries.push(e(d(19), p9, 76000, 18700, 4, 0, -14850, 0));
  allEntries.push(e(d(20), p9, 0, 0, 0, 0, -44549, 0));
  allEntries.push(e(d(21), p9, 130500, 28954, 6, 0, -29700, 0));
  allEntries.push(e(d(22), p9, 180000, 31663, 6, 0, -29700, 0));
  allEntries.push(e(d(23), p9, 92500, 19603, 4, 0, -51974, 0));
  allEntries.push(e(d(24), p9, 0, 0, 0, 0, -29700, 0));
  allEntries.push(e(d(25), p9, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(26), p9, 272500, 51266, 10, 0, -29700, 0));
  allEntries.push(e(d(27), p9, 54500, 10253, 2, 0, -22275, 0));
  allEntries.push(e(d(28), p9, 147000, 29857, 6, 0, -44549, 0));
  allEntries.push(e(d(29), p9, 57000, 14025, 3, 0, -22275, 0));
  allEntries.push(e(d(30), p9, 38000, 9350, 2, 0, -22275, 0));
  allEntries.push(e(d(31), p9, 0, 0, 0, 0, -7425, 0));

  // ===== 구좌 당근 =====
  const p10 = '구좌 당근';
  allEntries.push(e(d(1), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(2), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(3), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(4), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(5), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(6), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(7), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(8), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(9), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(10), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(11), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(12), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(13), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(14), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(15), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(16), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(17), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(18), p10, 0, 0, 0, 0, 0, 0));
  allEntries.push(e(d(19), p10, 0, 0, 0, 0, -12646, -220000));
  allEntries.push(e(d(20), p10, 0, 0, 0, 0, -4215, 0));
  allEntries.push(e(d(21), p10, 0, 0, 0, 0, -21077, 0));
  allEntries.push(e(d(22), p10, 0, 0, 0, 0, -25292, 0));
  allEntries.push(e(d(23), p10, 0, 0, 0, 0, -8431, 0));
  allEntries.push(e(d(24), p10, 0, 0, 0, 0, -16861, 0));
  allEntries.push(e(d(25), p10, 0, 0, 0, 0, -12646, 0));
  allEntries.push(e(d(26), p10, 47900, 11367, 7, 0, -33722, 0));
  allEntries.push(e(d(27), p10, 57200, 16961, 9, 0, -42153, 0));
  allEntries.push(e(d(28), p10, 56500, 17485, 9, 0, -25292, 0));
  allEntries.push(e(d(29), p10, 33000, 9668, 6, 0, -4215, 0));
  allEntries.push(e(d(30), p10, 100000, 29877, 16, 0, -29507, 0));
  allEntries.push(e(d(31), p10, 0, 0, 0, 0, -29507, 0));

  // Write to Firebase in batches (500 max per batch)
  console.log(`총 ${allEntries.length}개 엔트리 입력 시작...`);

  const BATCH_SIZE = 450;
  for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = allEntries.slice(i, i + BATCH_SIZE);

    for (const entry of chunk) {
      const docId = `${entry.date}_${entry.product}`;
      batch.set(doc(db, 'salesDaily', docId), entry);
    }

    await batch.commit();
    console.log(`배치 ${Math.floor(i / BATCH_SIZE) + 1} 완료 (${Math.min(i + BATCH_SIZE, allEntries.length)}/${allEntries.length})`);
  }

  console.log('1월 매출현황 데이터 입력 완료!');
  process.exit(0);
}

importData().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
