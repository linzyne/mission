
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import pkg from "xlsx";
const { readFile, utils } = pkg;
import { join } from "path";
import { existsSync, readdirSync } from "fs";

// Configuration from .env.local
const firebaseConfig = {
    apiKey: "AIzaSyBKVIc3tVt3kpCYmwudTZIjd3tcfqNO_io",
    authDomain: "mission-84840.firebaseapp.co",
    projectId: "mission-84840",
    storageBucket: "mission-84840.firebasestorage.app",
    messagingSenderId: "702323235874",
    appId: "1:702323235874:web:f42534ac69deac8b567e7b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Excel Date Converter
function excelDateToJSDate(serial) {
    if (!serial) return new Date().toISOString().split('T')[0]; // Default today
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toISOString().split('T')[0];
}

async function importExcel() {
    let filePath = join(process.cwd(), '통합 문서1.xlsx');

    // Fallback search
    if (!existsSync(filePath)) {
        const files = readdirSync(process.cwd());
        const found = files.find(f => f.includes('통합') && f.endsWith('.xlsx'));
        if (found) filePath = join(process.cwd(), found);
        else {
            console.error("Excel file not found!");
            process.exit(1);
        }
    }

    console.log(`Reading file: ${filePath}`);
    const wb = readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = utils.sheet_to_json(ws); // Convert to JSON objects

    console.log(`Found ${rawData.length} rows. Starting upload to 'manualEntries'...`);

    let successCount = 0;
    let failCount = 0;

    for (const row of rawData) {
        try {
            // Map fields
            // Headers: 순번, 갯수, 품목, 날짜, 이름1, 이름2 주문자명, 주문번호, 주소, 비고, 결제금액, 비상연락망, 계좌번호, 입금전

            const entry = {
                id: Math.random().toString(36).substr(2, 9), // Client-side ID generation or let Firestore do it? 
                // App uses string IDs. Let's start with this.
                count: row['갯수'] || 0,
                product: row['품목'] || '',
                date: typeof row['날짜'] === 'number' ? excelDateToJSDate(row['날짜']) : (row['날짜'] || ''),
                name1: row['이름1'] || '',
                name2: row['이름2 주문자명'] || '',
                orderNumber: row['주문번호'] || '',
                address: row['주소'] || '',
                memo: row['비고'] || '',
                paymentAmount: row['결제금액'] || 0,
                emergencyContact: row['비상연락망'] || '',
                accountNumber: row['계좌번호'] || '',
                beforeDeposit: !!row['입금전'],
                afterDeposit: row['입금완료'] === '완료',
                isManualCheck: false,
                proofImage: ''
            };

            await addDoc(collection(db, "manualEntries"), entry);
            process.stdout.write('.');
            successCount++;
        } catch (e) {
            console.error(`\nError uploading row:`, row, e);
            failCount++;
        }
    }

    console.log(`\n\nImport Complete!`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    process.exit(0);
}

importExcel();
