
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyBKVIc3tVt3kpCYmwudTZIjd3tcfqNO_io",
    authDomain: "mission-84840.firebaseapp.co",
    projectId: "mission-84840",
    storageBucket: "mission-84840.firebasestorage.app",
    messagingSenderId: "702323235874",
    appId: "1:702323235874:web:f42534ac69deac8b567e7b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkTypes() {
    console.log("Fetching manualEntries...");
    const snap = await getDocs(collection(db, "manualEntries"));
    console.log(`Total documents: ${snap.size}`);

    let addressNumbers = 0;
    let contactNumbers = 0;
    let addressExamples = [];
    let contactExamples = [];

    snap.forEach(doc => {
        const data = doc.data();

        if (typeof data.address === 'number') {
            addressNumbers++;
            if (addressExamples.length < 3) addressExamples.push({ id: doc.id, val: data.address });
        }

        if (typeof data.emergencyContact === 'number') {
            contactNumbers++;
            if (contactExamples.length < 3) contactExamples.push({ id: doc.id, val: data.emergencyContact });
        }
    });

    console.log("Analysis Result:");
    console.log(`Address fields as Number: ${addressNumbers}`);
    if (addressExamples.length > 0) console.log("Examples:", addressExamples);

    console.log(`EmergencyContact fields as Number: ${contactNumbers}`);
    if (contactExamples.length > 0) console.log("Examples:", contactExamples);

    if (addressNumbers > 0 || contactNumbers > 0) {
        console.log("\nCONFIRMED: Logic crash is likely due to these numeric numbers.");
    } else {
        console.log("\nDistribution looks clean (no numbers found in target fields). Logic crash might be elsewhere (e.g. null/undefined handling).");
    }
    process.exit(0);
}

checkTypes();
