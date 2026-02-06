try {
    const ocr = require('node-windows-ocr');
    console.log("Exports:", ocr);
} catch (e) {
    console.error("Error requiring package:", e.message);
}
