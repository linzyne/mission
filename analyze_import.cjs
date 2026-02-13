const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(process.cwd(), '통합 문서1.xlsx');
// Assuming Korean filename. If this fails, I'll list dir again to find exact name.
// Check if file exists first.
if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    // Try finding any xlsx file
    const files = fs.readdirSync(process.cwd());
    const xlsxFile = files.find(f => f.endsWith('.xlsx') && f.includes('통합'));
    if (xlsxFile) {
        console.log("Found similar file:", xlsxFile);
        const wb = xlsx.readFile(path.join(process.cwd(), xlsxFile));
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(ws, { header: 1 });
        console.log("Headers:", data[0]);
        console.log("Row 1:", data[1]);
    } else {
        process.exit(1);
    }
} else {
    const wb = xlsx.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = xlsx.utils.sheet_to_json(ws, { header: 1 }); // Array of arrays
    console.log("Headers:", jsonData[0]);
    if (jsonData.length > 1) {
        console.log("Row 1:", jsonData[1]);
    }
}
