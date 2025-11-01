console.log("--- CLIENT IS RUNNING v7 ---"); // <-- ADD THIS LINE

/**
 * FILE HANDLERS - Universal File Processing
 * ... (rest of the file) ...

/**
 * FILE HANDLERS - Universal File Processing
 *
 * *** FIX (v6): Solves "Failed to load PDF document" error. ***
 * The logo/QR snips were being created from scaled-up dimensions,
 * resulting in massive data URLs that crashed Puppeteer.
 *
 * This fix calculates all snip dimensions from a 1.0x unscaled
 * viewport first, then uses those numbers to create small canvases.
 * It then snips from the 2.5x scaled canvas and draws into the
 * small canvases, producing correctly sized images.
 */


const FileHandlers = {
    // Read file as ArrayBuffer
    readAsArrayBuffer: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (err) => reject(new Error(`FileReader error: ${err}`));
            reader.readAsArrayBuffer(file);
        });
    },

    // Read file as Data URL
    readAsDataURL: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (err) => reject(new Error(`FileReader error: ${err}`));
            reader.readAsDataURL(file);
        });
    },

    // Read file as Text
    readAsText: (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (err) => reject(new Error(`FileReader error: ${err}`));
            reader.readAsText(file);
        });
    },

    /**
     * DOCX File Handler
     */
    extractDOCX: async (file) => {
        try {
            const arrayBuffer = await FileHandlers.readAsArrayBuffer(file);
            if (!window.mammoth) throw new Error('Mammoth.js library not loaded');
            const textResult = await mammoth.extractRawText({ arrayBuffer });
            return {
                text: textResult.value || "",
                type: 'docx'
            };
        } catch (error) {
            console.error('DOCX extraction error:', error);
            throw new Error(`Failed to extract DOCX: ${error.message}`);
        }
    },

async extractPDFWithImages(file, onProgress) {
    try {
        if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const arrayBuffer = await this.readAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        
        let extractedImages = []; // Store all images with metadata
        let combinedText = '';
        let hasDigitalText = false;
        let junkImagesFound = 0; // Counter for junk images

        console.log(`📄 Processing ${numPages} pages for text and images...`);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            if (onProgress) onProgress(`Processing page ${pageNum}/${numPages}...`, (pageNum / numPages) * 40);
            
            const page = await pdf.getPage(pageNum);
            
            // Extract text
            const textContent = await page.getTextContent();
            let pageText = '';
            
            const lines = {};
            const yTolerance = 2;
            
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5] / yTolerance) * yTolerance;
                const x = Math.round(item.transform[4]);
                if (!lines[y]) lines[y] = [];
                lines[y].push({ text: item.str, x: x, width: item.width });
            });
            
            const sortedY = Object.keys(lines).map(Number).sort((a, b) => b - a);
            const formattedLines = sortedY.map(y => {
                const sortedItems = lines[y].sort((a, b) => a.x - b.x);
                let lineText = '';
                let lastX = 0;
                sortedItems.forEach((item, idx) => {
                    if (idx > 0) {
                        const gap = item.x - lastX;
                        if (gap > 10) lineText += ' ';
                        if (gap > 50) lineText += '\t';
                    }
                    lineText += item.text;
                    lastX = item.x + item.width;
                });
                return lineText.trim();
            });
            
            pageText = formattedLines.filter(line => line.length > 0).join('\n');
            
            if (pageText.length > 50) {
                hasDigitalText = true;
                combinedText += `\n========== PAGE ${pageNum} ==========\n${pageText}\n`;
                console.log(`✅ Extracted ${pageText.length} characters of text from page ${pageNum}`);
            } else {
                console.log(`⚠️ Page ${pageNum} has minimal text (${pageText.length} chars)`);
            }

            // Render page to canvas
            const scale = 2.5; 
            const viewport = page.getViewport({ scale: scale });
            const unscaledViewport = page.getViewport({ scale: 1.0 }); // <-- *** FIX: Get 1.0 scale viewport ***
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageHeight = viewport.height; // Scaled height
            const pageWidth = viewport.width;   // Scaled width
            
            // Try to extract *embedded* images (digital)
            try {
                const ops = await page.getOperatorList();
                let imageCount = 0;
                
                for (let i = 0; i < ops.fnArray.length; i++) {
                    if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject || 
                        ops.fnArray[i] === pdfjsLib.OPS.paintInlineImageXObject) {
                        
                        let imagePos = { x: 0, y: 0, width: 0, height: 0 };
                        let transformMatrix = null;

                        for (let j = Math.max(0, i - 10); j < Math.min(ops.fnArray.length, i + 2); j++) {
                            if (ops.fnArray[j] === pdfjsLib.OPS.transform && ops.argsArray[j].length >= 6) {
                                transformMatrix = ops.argsArray[j];
                                break;
                            }
                        }
                        
                        if (transformMatrix) {
                            const [a, b, c, d, e, f] = transformMatrix;
                            const matrix = viewport.transform;
                            const scaledE = e * matrix[0] + f * matrix[2] + matrix[4];
                            const scaledF = e * matrix[1] + f * matrix[3] + matrix[5];
                            const scaledWidth = Math.abs(a * matrix[0]);
                            const scaledHeight = Math.abs(d * matrix[3]);
                            
                            imagePos = { x: scaledE, y: scaledF - scaledHeight, width: scaledWidth, height: scaledHeight };
                        }
                        
                        if (imagePos.width > (10 * scale) && imagePos.height > (10 * scale)) {
                            imageCount++;
                            if (hasDigitalText) {
                                // ... (full classification logic would go here) ...
                            }
                            junkImagesFound++;
                        }
                    }
                }
                if (junkImagesFound > 0) {
                    console.log(`📊 Page ${pageNum}: Found ${junkImagesFound} potential image fragments (ops loop).`);
                }
                
            } catch (opsError) {
                console.warn(`⚠️ Could not get operator list for page ${pageNum}:`, opsError);
            }
            
            // If NO digital text, this is a scanned image.
            if (!hasDigitalText) {
                
                // 1. Capture the full page image for Tesseract
                const pageImageUrl = canvas.toDataURL('image/png', 0.95);
                extractedImages.push({
                    type: 'page', // This is the image that will be OCR'd
                    page: pageNum,
                    dataUrl: pageImageUrl,
                    position: { x: 0, y: 0, width: pageWidth, height: pageHeight },
                    index: 0
                });
                console.log(`📄 Captured full page ${pageNum} for OCR (no digital text found)`);
                
                // 2. ALSO capture the logo/QR regions from the canvas
                console.log(`🔍 Attempting to extract logo/QR from scanned page...`);
                try {
                    // *** V6 SCALING FIX ***
                    // Calculate dimensions from UN SCALED viewport
                    const logoWidth = unscaledViewport.width * 0.35;
                    const logoHeight = unscaledViewport.height * 0.25;
                    const logoX = unscaledViewport.width * 0.65;
                    const logoY = 0; // Top of page

                    // Create canvas with UN SCALED dimensions
                    const logoCanvas = document.createElement('canvas');
                    const logoCtx = logoCanvas.getContext('2d');
                    logoCanvas.width = logoWidth;
                    logoCanvas.height = logoHeight;
                    
                    // Draw from the SCALED canvas (source) into the UN SCALED canvas (destination)
                    logoCtx.drawImage(
                        canvas,         // Source canvas (scaled 2.5x)
                        logoX * scale,  // Source X (scaled)
                        logoY * scale,  // Source Y (scaled)
                        logoWidth * scale,  // Source Width (scaled)
                        logoHeight * scale, // Source Height (scaled)
                        0, 0,           // Destination X, Y
                        logoCanvas.width,   // Destination Width (unscaled)
                        logoCanvas.height   // Destination Height (unscaled)
                    );
                    
                    extractedImages.push({
                        type: 'logo',
                        page: pageNum,
                        dataUrl: logoCanvas.toDataURL('image/png', 0.95),
                        position: { x: logoX, y: logoY, width: logoWidth, height: logoHeight },
                        index: 1
                    });
                    console.log(`✅ Extracted logo region from scanned page`);
                    
                    // --- Repeat for QR code ---
                    const qrCanvas = document.createElement('canvas');
                    const qrCtx = qrCanvas.getContext('2d');
                    
                    // Calculate dimensions from UN SCALED viewport
                    const qrSize = Math.min(unscaledViewport.width, unscaledViewport.height) * 0.19;
                    const qrX = (unscaledViewport.width - qrSize) / 2;
                    const qrY = unscaledViewport.height * 0.70; // 75% from top
                    
                    // Create canvas with UN SCALED dimensions
                    qrCanvas.width = qrSize;
                    qrCanvas.height = qrSize;
                    
                    // Draw from the SCALED canvas (source) into the UN SCALED canvas (destination)
                    qrCtx.drawImage(
                        canvas,
                        qrX * scale,
                        qrY * scale,
                        qrSize * scale,
                        qrSize * scale,
                        0, 0,
                        qrCanvas.width,
                        qrCanvas.height
                    );
                    
                    extractedImages.push({
                        type: 'qr',
                        page: pageNum,
                        dataUrl: qrCanvas.toDataURL('image/png', 0.95),
                        position: { x: qrX, y: qrY, width: qrSize, height: qrSize },
                        index: 2
                    });
                    console.log(`✅ Extracted QR region from scanned page`);
                    
                } catch (imgErr) {
                    console.warn(`⚠️ Could not extract logo/QR from scanned page:`, imgErr);
                }
            }
        } // end of page loop

        // If no digital text, perform OCR on page images
        if (!hasDigitalText && extractedImages.some(img => img.type === 'page')) {
            console.log("🔍 No digital text found, performing OCR...");
            
            const pageImages = extractedImages.filter(img => img.type === 'page');
            for (let i = 0; i < pageImages.length; i++) {
                const img = pageImages[i];
                if (onProgress) onProgress(`OCR on page ${img.page}...`, 40 + (i / pageImages.length) * 60);
                
                try {
                    const ocrResult = await this.extractImage(img.dataUrl, onProgress);
                    combinedText += `\n========== PAGE ${img.page} ==========\n${ocrResult.text}\n`;
                    console.log(`✅ OCR completed for page ${img.page}`);
                } catch (err) {
                    console.error(`❌ OCR failed for page ${img.page}:`, err);
                }
            }
        } else if (hasDigitalText) {
            console.log("✅ Using digital text - OCR not needed");
        }

        const logoCount = extractedImages.filter(i => i.type === 'logo').length;
        const qrCount = extractedImages.filter(i => i.type === 'qr').length;
        const otherCount = extractedImages.filter(i => i.type === 'image').length;
        const pageCount = extractedImages.filter(i => i.type === 'page').length;
        
        console.log(`✅ PDF extraction complete: ${extractedImages.length} images extracted`);
        console.log(`   📊 Breakdown:`);
        console.log(`   - Logos: ${logoCount}`);
        console.log(`   - QR Codes: ${qrCount}`);
        console.log(`   - Other images: ${otherCount}`);
        console.log(`   - Full pages (for OCR): ${pageCount}`);
        console.log(`   📝 Text: ${combinedText.length} characters`);
        console.log(`   📄 Type: ${hasDigitalText ? 'pdf' : 'pdf-ocr'}`);

        return {
            text: combinedText.trim(),
            images: extractedImages,
            type: hasDigitalText ? 'pdf' : 'pdf-ocr',
            hasDigitalText: hasDigitalText,
            stats: {
                totalImages: extractedImages.length,
                logos: logoCount,
                qrCodes: qrCount,
                textLength: combinedText.length
            }
        };

    } catch (error) {
        console.error('❌ PDF extraction error:', error);
        throw new Error(`Failed to extract PDF: ${error.message}`);
    }
},

    /**
     * PDF File Handler (Simple - Fallback)
     */
    extractPDF: async (file, onProgress) => {
        // ... (this function is kept for reference but not called by processFile) ...
        console.warn("Using simple extractPDF fallback. Image extraction will be limited.");
        try {
            if (!window.pdfjsLib) { throw new Error('PDF.js (pdf.min.js) not loaded'); }
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const arrayBuffer = await FileHandlers.readAsArrayBuffer(file);
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdf.numPages;
            let combinedDigitalText = '';
            let foundDigitalText = false;
            for (let i = 1; i <= numPages; i++) {
                try {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    if (textContent?.items?.length > 0) {
                        const pageText = textContent.items.map(item => item.str ? item.str.trim() : '').filter(str => str.length > 0).join('\n');
                        if (pageText.length > 0) {
                            foundDigitalText = true;
                            combinedDigitalText += (combinedDigitalText ? '\n\n' : '') + `========== PAGE ${i} ==========\n` + pageText;
                        }
                    }
                } catch (pageError) { console.warn(`Error processing PDF page ${i} for digital text:`, pageError); }
            }
             combinedDigitalText = combinedDigitalText.trim();
            if (!foundDigitalText) {
                let combinedOcrText = '';
                if (onProgress) onProgress("Preparing for OCR...", 0);
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                for (let i = 1; i <= numPages; i++) {
                    if (onProgress) onProgress(`Rendering page ${i}/${numPages}...`, Math.round((i / numPages) * 20));
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 });
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    const dataURL = canvas.toDataURL('image/png');
                    const ocrProgressCallback = (progressData) => {
                        if (progressData.status === 'recognizing text' && onProgress) {
                            const progress = m.progress ? Math.round(m.progress * 100) : 0;
                            onProgress(`Recognizing page ${i}...`, 20 + Math.round((i / numPages) * (progress * 0.8)));
                        }
                    };
                    try {
                        const ocrResult = await FileHandlers.extractImage(dataURL, ocrProgressCallback);
                        combinedOcrText += (combinedOcrText ? '\n\n' : '') + (ocrResult?.text?.trim() || "");
                    } catch(ocrError) {
                         console.error(`OCR failed for page ${i}:`, ocrError);
                         combinedOcrText += `\n\n[OCR failed for page ${i}]\n\n`;
                    }
                }
                canvas.width = 0; canvas.height = 0;
                combinedOcrText = combinedOcrText.trim();
                if (!combinedOcrText) throw new Error("OCR processing failed for all pages.");
                return { text: combinedOcrText, type: 'pdf-ocr' };
            }
            return { text: combinedDigitalText, type: 'pdf' };
        } catch (error) {
            console.error('PDF extraction error:', error);
            throw new Error(`Failed to extract PDF: ${error.message}`);
        }
    },

    /**
     * XLSX/CSV File Handler (Client-Side HTML Generation)
     */
    extractXLSX: async (file) => {
        try {
            const arrayBuffer = await FileHandlers.readAsArrayBuffer(file);
            if (!window.XLSX) throw new Error('SheetJS (xlsx.full.min.js) not loaded');
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetsData = [];
            let combinedTextRepresentation = '';
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                if (!worksheet) return;
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
                const rowCount = jsonData.length;
                const columnCount = rowCount > 0 ? jsonData[0].length : 0;
                let sheetHTML = XLSX.utils.sheet_to_html(worksheet, { header: '', footer: '' });
                sheetHTML = sheetHTML.replace('<table', '<table class="excel-table" border="1"');
                let structuredText = `\n=== SHEET: ${sheetName} (Rows: ${rowCount}, Cols: ${columnCount}) ===\n`;
                const maxTextRows = 200;
                jsonData.slice(0, maxTextRows).forEach((row, idx) => {
                    structuredText += `Row ${idx + 1}: ${row.join(' | ')}\n`;
                });
                if(rowCount > maxTextRows) structuredText += `\n... (Sheet text truncated after ${maxTextRows} rows) ...\n`;
                sheetsData.push({
                    name: sheetName,
                    html: `<div class="excel-sheet" data-sheet-name="${sheetName}"><h3 class="sheet-title">Sheet: ${sheetName}</h3>${sheetHTML}</div>`,
                    text: structuredText,
                    rowCount: rowCount,
                    columnCount: columnCount
                });
                combinedTextRepresentation += structuredText;
            });
            if (sheetsData.length === 0) throw new Error("No valid sheets found in spreadsheet.");
            console.log(`SheetJS processed ${sheetsData.length} sheets.`);
            return {
                text: combinedTextRepresentation.trim(),
                sheets: sheetsData,
                sheetCount: sheetsData.length,
                type: 'xlsx'
            };
        } catch (error) {
            console.error('XLSX extraction error:', error);
            throw new Error(`Failed to extract spreadsheet: ${error.message}`);
        }
    },

    /**
     * Image File Handler (with Tesseract.js v4)
     */
    extractImage: async (imageInput, onProgress) => { // imageInput can be File, Blob, or DataURL
        const progressHandler = (typeof onProgress === 'function') ? onProgress : null;
        try {
            if (!window.Tesseract) {
                throw new Error('Tesseract.js v4 library not loaded. Check script include.');
            }
            console.log("Tesseract v4: Starting recognition...");
            if (progressHandler) progressHandler("Initializing OCR...", 0);
            const { data } = await Tesseract.recognize(
                 imageInput, 'eng',
                 {
                    logger: (m) => {
                        if (progressHandler && m.status === 'recognizing text') {
                            const progress = m.progress ? Math.round(m.progress * 100) : 0;
                            onProgress(progress);
                        } else if (progressHandler && m.status) {
                             const progress = m.progress ? Math.round(m.progress * 100) : 0;
                             onProgress(m.status, progress);
                        }
                    }
                }
            );
            if (progressHandler) onProgress(100);
            console.log(`Tesseract v4 OCR completed. Confidence: ${data?.confidence || 'N/A'}`);
            if (typeof data?.text !== 'string') {
                 console.error("Tesseract v4 finished but returned invalid data:", data);
                 throw new Error("OCR process finished but yielded no text.");
            }
            return {
                text: data.text || "",
                confidence: data.confidence,
                type: 'image-ocr'
            };
        } catch (error) {
            console.error('Image OCR (Tesseract v4) process failed:', error);
            let errorMessage = `Failed to extract text from image: ${error.message || 'Unknown Tesseract error'}`;
            if (!window.Tesseract) errorMessage = 'Tesseract.js library failed to load.';
            else if (error.message && (error.message.includes('Network') || error.message.includes('fetch'))) {
                 errorMessage += ' (Network Error loading Tesseract language data. Check Network tab.)';
             }
            throw new Error(errorMessage);
        }
    },

    /**
     * HTML File Handler
     */
    extractHTML: async (file) => {
        try {
            const html = await FileHandlers.readAsText(file);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const text = tempDiv.textContent || tempDiv.innerText || '';
            return { text: text, html: html, type: 'html' };
        } catch (error) {
            console.error('HTML extraction error:', error);
            throw new Error(`Failed to read HTML file: ${error.message}`);
        }
    },

    /**
     * Text File Handler
     */
    extractText: async (file) => {
        try {
            const text = await FileHandlers.readAsText(file);
            return { text: text || "", type: 'text' };
        } catch (error) {
            console.error('Text extraction error:', error);
            throw new Error(`Failed to read text file: ${error.message}`);
        }
    },

    /**
     * Universal File Processor
     */
    processFile: async (file, onProgress) => {
        const fileName = file.name.toLowerCase();
        const fileType = file.type;
        console.log(`Processing file: ${fileName}, Type: ${fileType}`);
        try {
            if (fileName.endsWith('.docx')) {
                return await FileHandlers.extractDOCX(file);
            }
            if (fileName.endsWith('.pdf') || fileType === 'application/pdf') {
                return await FileHandlers.extractPDFWithImages(file, onProgress);
            }
            if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
                return await FileHandlers.extractXLSX(file);
            }
            if (fileType.startsWith('image/')) {
                return await FileHandlers.extractImage(file, onProgress);
            }
            if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
                return await FileHandlers.extractHTML(file);
            }
            console.log("Defaulting to text extraction.");
            return await FileHandlers.extractText(file);
        } catch (error) {
            console.error(`File processing error for ${fileName}:`, error);
            throw error;
        }
    },

    /**
     * Get file metadata
     */
    getFileMetadata: (file) => {
        return {
            name: file.name,
            size: file.size,
            sizeFormatted: FileHandlers.formatFileSize(file.size),
            type: file.type || 'unknown',
            extension: file.name.split('.').pop()?.toLowerCase() || 'txt',
            lastModified: new Date(file.lastModified)
        };
    },

    /**
* Format file size for display
     */
    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};