
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

// Configuration from .env.local (Updated)
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

async function clearData() {
    console.log("Fetching documents to delete...");
    const colRef = collection(db, "manualEntries");
    const snapshot = await getDocs(colRef);

    console.log(`Found ${snapshot.size} documents. Deleting...`);

    let deletedCount = 0;
    const promises = [];

    snapshot.forEach((document) => {
        promises.push(
            deleteDoc(doc(db, "manualEntries", document.id))
                .then(() => {
                    deletedCount++;
                    if (deletedCount % 100 === 0) process.stdout.write('.');
                })
        );
    });

    await Promise.all(promises);
    console.log(`\n\nDeleted ${deletedCount} documents.`);
    process.exit(0);
}

clearData();
