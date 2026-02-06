const { Jimp } = require('jimp');
const ort = require('onnxruntime-node');
const path = require('path');
const fs = require('fs');

async function runInference(imagePath, modelPath) {
    try {
        console.log(`\n=== ML DETECTION PROTOTYPE ===`);
        console.log(`Image: ${imagePath.split('\\').pop()}`);
        console.log(`Model: ${modelPath}`);

        // 1. Load Image
        const image = await Jimp.read(imagePath);
        const originalWidth = image.bitmap.width;
        const originalHeight = image.bitmap.height;

        // Resize to YOLOv8 input size (640x640)
        image.resize({ w: 640, h: 640 });

        // 2. Preprocess (Normalization & Float32 Tensor)
        const float32Data = new Float32Array(3 * 640 * 640);
        const imageData = image.bitmap.data; // RGBA buffer

        for (let i = 0; i < 640 * 640; i++) {
            // YOLO expects R, G, B channels flattened
            float32Data[i] = imageData[i * 4] / 255.0;           // R
            float32Data[i + 640 * 640] = imageData[i * 4 + 1] / 255.0; // G
            float32Data[i + 2 * 640 * 640] = imageData[i * 4 + 2] / 255.0; // B
        }

        const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);

        // 3. Load Model and Run Inference
        console.log("Loading model...");
        const session = await ort.InferenceSession.create(modelPath);

        console.log("Running inference...");
        const start = Date.now();
        const outputs = await session.run({ [session.inputNames[0]]: inputTensor });
        const end = Date.now();
        console.log(`Inference complete in ${end - start}ms`);

        // 4. Parse Output (YOLOv8 format: [1, 84, 8400])
        // 84 = 4 (bbox) + 80 (classes)
        const output = outputs[session.outputNames[0]];
        const data = output.data;
        const [batch, dims, numBoxes] = output.dims; // [1, 84, 8400]

        let detections = [];
        const confidenceThreshold = 0.3;

        for (let i = 0; i < numBoxes; i++) {
            // YOLOv8 output is flattened column-major or similar
            // x_center = data[i + 0 * 8400]
            // y_center = data[i + 1 * 8400]
            // width    = data[i + 2 * 8400]
            // height   = data[i + 3 * 8400]

            let maxScore = 0;
            let classId = -1;
            for (let c = 0; c < 80; c++) {
                const score = data[i + (c + 4) * numBoxes];
                if (score > maxScore) {
                    maxScore = score;
                    classId = c;
                }
            }

            if (maxScore > confidenceThreshold) {
                const xc = data[i + 0 * numBoxes];
                const yc = data[i + 1 * numBoxes];
                const w = data[i + 2 * numBoxes];
                const h = data[i + 3 * numBoxes];

                // Map back to original image size
                const x0 = (xc - w / 2) * (originalWidth / 640);
                const y0 = (yc - h / 2) * (originalHeight / 640);
                const x1 = (xc + w / 2) * (originalWidth / 640);
                const y1 = (yc + h / 2) * (originalHeight / 640);

                detections.push({ classId, score: maxScore, bbox: [x0, y0, x1, y1] });
            }
        }

        // Apply NMS (Simple version: just take highest scores if they overlap heavily)
        detections.sort((a, b) => b.score - a.score);
        const finalDetections = [];
        for (const det of detections) {
            let keep = true;
            for (const kept of finalDetections) {
                // Simplified IoU or distance check
                const dx = Math.abs(det.bbox[0] - kept.bbox[0]);
                const dy = Math.abs(det.bbox[1] - kept.bbox[1]);
                if (dx < 50 && dy < 50) { keep = false; break; }
            }
            if (keep) finalDetections.push(det);
        }

        console.log(`Detected ${finalDetections.length} candidate UI regions:`);
        finalDetections.forEach((d, idx) => {
            console.log(` [${idx}] Class ${d.classId}: Conf ${Math.round(d.score * 100)}% | BBox: [${Math.round(d.bbox[0])}, ${Math.round(d.bbox[1])}, ${Math.round(d.bbox[2])}, ${Math.round(d.bbox[3])}]`);
        });

    } catch (e) {
        console.error("ML Inference Failed:", e);
    }
}

const IMAGE = "C:\\Users\\Alec Gougebas\\AppData\\Roaming\\Wildgate Stat Tracker\\ocr-debug\\capture_2026-02-04T08-22-04-350Z.png";
const MODEL = "yolov8n.onnx";

if (fs.existsSync(MODEL)) {
    runInference(IMAGE, MODEL);
} else {
    console.error(`Model file not found: ${MODEL}. Please download it first.`);
}
