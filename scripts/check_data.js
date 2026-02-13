
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBKVIc3tVt3kpCYmwudTZIjd3tcfqNO_io",
    authDomain: "mission-84840.firebaseapp.co", // Updated domain
    projectId: "mission-84840", // Updated project ID
    storageBucket: "mission-84840.firebasestorage.app",
    messagingSenderId: "702323235874",
    appId: "1:702323235874:web:f42534ac69deac8b567e7b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkData() {
    console.log("Checking first 5 manual entries...");
    const q = query(collection(db, "manualEntries"), limit(5));
    const snapshot = await getDocs(q);

    snapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`ID: ${doc.id}, Product: '${data.product}', Date: ${data.date}, AfterDeposit: ${data.afterDeposit}`);
    });
    process.exit(0);
}

checkData();
