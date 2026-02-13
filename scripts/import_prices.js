
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";

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

const prices = [
    { name: "포기김치", price: 22290 },
    { name: "귤", price: 15200 },
    { name: "고랭지김치", price: 22600 },
    { name: "홍게", price: 30600 },
    { name: "황금향", price: 14400 },
    { name: "총각김치", price: 16800 },
    { name: "과메기", price: 14900 },
    { name: "귤_제이", price: 15200 },
    { name: "순살 갈치", price: 24800 },
    { name: "은갈치", price: 27800 },
    { name: "한라봉_답도", price: 25800 },
    { name: "구좌 당근", price: 8850 },
    { name: "과일선물세트", price: 60700 },
    { name: "한라봉_답도선물세트", price: 48800 },
    { name: "부사 사과", price: 34060 }
];

async function importPrices() {
    console.log("Clearing existing product prices...");
    const colRef = collection(db, "productPrices");
    const snapshot = await getDocs(colRef);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    console.log(`Deleted ${deletePromises.length} existing prices.`);

    console.log("Importing new prices...");
    for (const p of prices) {
        await addDoc(colRef, p);
        process.stdout.write('.');
    }
    console.log("\nPrice import complete!");
    process.exit(0);
}

importPrices();
