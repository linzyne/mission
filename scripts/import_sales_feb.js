import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch, collection, getDocs, query, where, deleteDoc } from "firebase/firestore";

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

function e(date, product, supplyPrice, totalMargin, quantity, adCost, housePurchase, solution) {
  return {
    date, product, productDetail: '',
    quantity: quantity || 0, sellingPrice: 0, supplyPrice: supplyPrice || 0,
    marginPerUnit: 0, totalMargin: totalMargin || 0,
    adCost: adCost || 0, housePurchase: housePurchase || 0, solution: solution || 0,
  };
}

function d(day) { return `2026-02-${String(day).padStart(2, '0')}`; }

async function importData() {
  // 1) 기존 2월 데이터 삭제
  console.log('기존 2월 데이터 삭제 중...');
  const snapshot = await getDocs(collection(db, 'salesDaily'));
  const febDocs = snapshot.docs.filter(d => {
    const data = d.data();
    return data.date && data.date.startsWith('2026-02');
  });
  if (febDocs.length > 0) {
    const BATCH_SIZE = 450;
    for (let i = 0; i < febDocs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      febDocs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    console.log(`기존 2월 데이터 ${febDocs.length}건 삭제 완료`);
  }

  const all = [];

  // ===== 고랭지김치 =====
  const p1 = '고랭지김치';
  all.push(e(d(1),p1,0,0,0,0,0,0));
  all.push(e(d(2),p1,452900,170152,22,0,0,0));
  all.push(e(d(3),p1,86900,27589,4,0,-6819,0));
  all.push(e(d(4),p1,205100,74761,9,0,-6819,0));
  all.push(e(d(5),p1,136200,44014,6,0,-13637,0));
  all.push(e(d(6),p1,49300,16425,2,0,-13637,0));
  all.push(e(d(7),p1,0,0,0,0,0,0));
  all.push(e(d(8),p1,0,0,0,0,-27274,0));
  all.push(e(d(9),p1,477100,154708,22,0,-6819,0));
  all.push(e(d(10),p1,183100,63015,8,0,-13637,0));
  all.push(e(d(11),p1,145100,43771,7,0,0,0));
  all.push(e(d(12),p1,81500,13907,5,0,-27274,0));
  all.push(e(d(13),p1,0,0,0,0,0,0));
  all.push(e(d(14),p1,0,0,0,0,-27274,0));
  all.push(e(d(15),p1,0,0,0,0,0,0));
  all.push(e(d(16),p1,0,0,0,0,-40911,0));
  all.push(e(d(17),p1,0,0,0,0,0,0));
  all.push(e(d(18),p1,0,0,0,0,-6819,0));
  all.push(e(d(19),p1,574000,208339,22,0,-34093,-220000));
  all.push(e(d(20),p1,174200,63258,7,0,-6819,0));
  all.push(e(d(21),p1,0,0,0,0,-20456,0));
  all.push(e(d(22),p1,0,0,0,0,-13637,0));
  all.push(e(d(23),p1,482100,175150,18,0,0,0));
  all.push(e(d(24),p1,98600,32850,4,0,0,0));
  all.push(e(d(25),p1,0,0,0,0,0,0));
  all.push(e(d(26),p1,0,0,0,0,0,0));
  all.push(e(d(27),p1,0,0,0,0,0,0));
  all.push(e(d(28),p1,0,0,0,0,0,0));

  // ===== 포기김치 =====
  const p2 = '포기김치';
  all.push(e(d(1),p2,0,0,0,-111650,-6782,0));
  all.push(e(d(2),p2,2662500,557034,86,-111650,0,0));
  all.push(e(d(3),p2,848800,176518,28,-108012,-33912,0));
  all.push(e(d(4),p2,997100,207027,33,-113698,-13565,0));
  all.push(e(d(5),p2,810400,166040,28,-109231,-13565,0));
  all.push(e(d(6),p2,796600,167516,25,-114738,-20347,0));
  all.push(e(d(7),p2,0,0,0,-108871,-6782,0));
  all.push(e(d(8),p2,0,0,0,-113115,0,0));
  all.push(e(d(9),p2,2746500,573556,89,-112300,-13565,0));
  all.push(e(d(10),p2,827500,172518,27,-113128,-6782,0));
  all.push(e(d(11),p2,1258200,263536,40,-111757,-13565,0));
  all.push(e(d(12),p2,761500,158517,25,-102728,0,0));
  all.push(e(d(13),p2,0,0,0,-107322,0,0));
  all.push(e(d(14),p2,0,0,0,-108422,0,0));
  all.push(e(d(15),p2,0,0,0,-48528,0,0));
  all.push(e(d(16),p2,0,0,0,-41712,-13565,0));
  all.push(e(d(17),p2,0,0,0,-43443,0,0));
  all.push(e(d(18),p2,0,0,0,-73262,0,0));
  all.push(e(d(19),p2,2509700,519090,84,0,-13565,-220000));
  all.push(e(d(20),p2,850900,178517,27,0,-13565,0));
  all.push(e(d(21),p2,0,0,0,0,-13565,0));
  all.push(e(d(22),p2,0,0,0,0,-20347,0));
  all.push(e(d(23),p2,1789500,370546,60,0,0,0));
  all.push(e(d(24),p2,923600,194025,29,0,0,0));
  all.push(e(d(25),p2,0,0,0,0,0,0));
  all.push(e(d(26),p2,0,0,0,0,0,0));
  all.push(e(d(27),p2,0,0,0,0,0,0));
  all.push(e(d(28),p2,0,0,0,0,0,0));

  // ===== 순살 갈치 =====
  const p3 = '순살 갈치';
  all.push(e(d(1),p3,0,0,0,0,-21225,0));
  all.push(e(d(2),p3,496000,176797,32,0,-7075,0));
  all.push(e(d(3),p3,155000,55249,10,0,-63676,0));
  all.push(e(d(4),p3,186000,66299,12,0,-63676,0));
  all.push(e(d(5),p3,480500,171273,31,0,-14150,0));
  all.push(e(d(6),p3,62000,22100,4,0,-21225,0));
  all.push(e(d(7),p3,0,0,0,0,0,0));
  all.push(e(d(8),p3,0,0,0,0,-7075,0));
  all.push(e(d(9),p3,945500,337020,61,0,-14150,0));
  all.push(e(d(10),p3,372000,132598,24,0,-14150,0));
  all.push(e(d(11),p3,434000,154698,28,0,-28300,0));
  all.push(e(d(12),p3,294500,104973,19,0,-14150,0));
  all.push(e(d(13),p3,0,0,0,0,0,0));
  all.push(e(d(14),p3,0,0,0,0,0,0));
  all.push(e(d(15),p3,0,0,0,0,0,0));
  all.push(e(d(16),p3,0,0,0,0,-14150,0));
  all.push(e(d(17),p3,0,0,0,0,-21225,0));
  all.push(e(d(18),p3,0,0,0,0,-7075,0));
  all.push(e(d(19),p3,3177500,1132609,205,0,-28300,0));
  all.push(e(d(20),p3,325500,116023,21,0,0,0));
  all.push(e(d(21),p3,0,0,0,0,-14150,0));
  all.push(e(d(22),p3,0,0,0,0,0,0));
  all.push(e(d(23),p3,1116000,397794,72,0,0,0));
  all.push(e(d(24),p3,325500,116023,21,0,0,0));
  all.push(e(d(25),p3,0,0,0,0,0,0));
  all.push(e(d(26),p3,0,0,0,0,0,0));
  all.push(e(d(27),p3,0,0,0,0,0,0));
  all.push(e(d(28),p3,0,0,0,0,0,0));

  // ===== 은갈치 =====
  const p4 = '은갈치';
  all.push(e(d(1),p4,0,0,0,0,-7425,0));
  all.push(e(d(2),p4,358500,85055,18,0,-29700,0));
  all.push(e(d(3),p4,204000,43882,9,0,0,0));
  all.push(e(d(4),p4,73500,14928,3,0,-22275,0));
  all.push(e(d(5),p4,54500,10253,2,0,-14850,0));
  all.push(e(d(6),p4,71000,11156,2,0,-14850,0));
  all.push(e(d(7),p4,0,0,0,0,-22275,0));
  all.push(e(d(8),p4,0,0,0,0,-22275,0));
  all.push(e(d(9),p4,234500,41916,8,0,-14850,0));
  all.push(e(d(10),p4,109000,20506,4,0,-14850,0));
  all.push(e(d(11),p4,128000,25182,5,0,0,0));
  all.push(e(d(12),p4,215500,37241,7,0,-14850,0));
  all.push(e(d(13),p4,0,0,0,0,0,0));
  all.push(e(d(14),p4,0,0,0,0,-7425,0));
  all.push(e(d(15),p4,0,0,0,0,0,0));
  all.push(e(d(16),p4,0,0,0,0,0,0));
  all.push(e(d(17),p4,0,0,0,0,0,0));
  all.push(e(d(18),p4,0,0,0,0,0,0));
  all.push(e(d(19),p4,253500,46591,9,0,0,0));
  all.push(e(d(20),p4,0,0,0,0,0,0));
  all.push(e(d(21),p4,0,0,0,0,0,0));
  all.push(e(d(22),p4,0,0,0,0,0,0));
  all.push(e(d(23),p4,204000,43882,9,0,0,0));
  all.push(e(d(24),p4,57000,14025,3,0,0,0));
  all.push(e(d(25),p4,0,0,0,0,0,0));
  all.push(e(d(26),p4,0,0,0,0,0,0));
  all.push(e(d(27),p4,0,0,0,0,0,0));
  all.push(e(d(28),p4,0,0,0,0,0,0));

  // ===== 구좌 당근 =====
  const p5 = '구좌 당근';
  all.push(e(d(1),p5,0,0,0,0,-25292,0));
  all.push(e(d(2),p5,171700,51579,29,0,-4215,0));
  all.push(e(d(3),p5,127800,36300,18,0,-16861,0));
  all.push(e(d(4),p5,96000,28144,14,0,-16861,0));
  all.push(e(d(5),p5,66500,19985,11,0,-12646,0));
  all.push(e(d(6),p5,80900,26203,14,0,-21077,0));
  all.push(e(d(7),p5,0,0,0,0,-12646,0));
  all.push(e(d(8),p5,0,0,0,0,0,0));
  all.push(e(d(9),p5,155900,51540,27,0,-8431,0));
  all.push(e(d(10),p5,72800,24383,11,0,-8431,0));
  all.push(e(d(11),p5,87700,33149,16,0,0,0));
  all.push(e(d(12),p5,64400,23569,12,0,-8431,0));
  all.push(e(d(13),p5,0,0,0,0,0,0));
  all.push(e(d(14),p5,0,0,0,0,0,0));
  all.push(e(d(15),p5,0,0,0,0,0,0));
  all.push(e(d(16),p5,0,0,0,0,-21077,0));
  all.push(e(d(17),p5,0,0,0,0,0,0));
  all.push(e(d(18),p5,0,0,0,0,0,0));
  all.push(e(d(19),p5,194300,64943,32,0,0,0));
  all.push(e(d(20),p5,32400,10975,6,0,0,0));
  all.push(e(d(21),p5,0,0,0,0,0,0));
  all.push(e(d(22),p5,0,0,0,0,0,0));
  all.push(e(d(23),p5,122600,42631,21,0,0,0));
  all.push(e(d(24),p5,21400,7752,4,0,0,0));
  all.push(e(d(25),p5,0,0,0,0,0,0));
  all.push(e(d(26),p5,0,0,0,0,0,0));
  all.push(e(d(27),p5,0,0,0,0,0,0));
  all.push(e(d(28),p5,0,0,0,0,0,0));

  // ===== 부사 사과 =====
  const p6 = '부사 사과';
  all.push(e(d(1),p6,0,0,0,0,0,0));
  all.push(e(d(2),p6,0,0,0,0,0,0));
  all.push(e(d(3),p6,0,0,0,0,0,0));
  all.push(e(d(4),p6,0,0,0,0,0,0));
  all.push(e(d(5),p6,0,0,0,0,0,0));
  all.push(e(d(6),p6,0,0,0,0,0,0));
  all.push(e(d(7),p6,0,0,0,0,0,0));
  all.push(e(d(8),p6,0,0,0,0,0,0));
  all.push(e(d(9),p6,0,0,0,0,-66941,0));
  all.push(e(d(10),p6,0,0,0,0,-73027,0));
  all.push(e(d(11),p6,0,0,0,0,-79112,0));
  all.push(e(d(12),p6,0,0,0,0,-54770,0));
  all.push(e(d(13),p6,0,0,0,0,-12171,0));
  all.push(e(d(14),p6,0,0,0,0,-36513,0));
  all.push(e(d(15),p6,0,0,0,0,0,0));
  all.push(e(d(16),p6,0,0,0,0,-42599,0));
  all.push(e(d(17),p6,0,0,0,0,-30428,0));
  all.push(e(d(18),p6,0,0,0,0,-30428,0));
  all.push(e(d(19),p6,252300,49646,17,0,-54770,0));
  all.push(e(d(20),p6,131800,25004,8,0,-42599,0));
  all.push(e(d(21),p6,0,0,0,0,-24342,0));
  all.push(e(d(22),p6,0,0,0,0,-24342,0));
  all.push(e(d(23),p6,184350,34557,15,0,0,0));
  all.push(e(d(24),p6,34150,6133,3,0,0,0));
  all.push(e(d(25),p6,0,0,0,0,0,0));
  all.push(e(d(26),p6,0,0,0,0,0,0));
  all.push(e(d(27),p6,0,0,0,0,0,0));
  all.push(e(d(28),p6,0,0,0,0,0,0));

  // 2) Firebase에 입력
  console.log(`총 ${all.length}개 엔트리 입력 시작...`);
  const BATCH_SIZE = 450;
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    all.slice(i, i + BATCH_SIZE).forEach(entry => {
      const docId = `${entry.date}_${entry.product}`;
      batch.set(doc(db, 'salesDaily', docId), entry);
    });
    await batch.commit();
    console.log(`배치 ${Math.floor(i / BATCH_SIZE) + 1} 완료 (${Math.min(i + BATCH_SIZE, all.length)}/${all.length})`);
  }

  console.log('2월 매출현황 데이터 입력 완료!');
  process.exit(0);
}

importData().catch(err => { console.error('오류:', err); process.exit(1); });
