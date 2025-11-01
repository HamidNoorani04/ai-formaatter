/**
 * AI DOCUMENT FORMATTER - FINALIZED VERSION (v5)
 *
 * This file is complete and includes all fixes:
 * 1.  'sanitizeAIOutput' function to fix raw text from AI.
 * 2.  'handleAIFormat' now calls the sanitizer.
 * 3.  'generateExportHTML' now correctly uses documentData.
 * 4.  Corrected table parsing logic.
 * 5.  Server-side PDF download function with better error handling.
 * 6.  REMOVED STRAY '}' AT THE END OF THE FILE.
 */

// --- Constants and Global Variables ---
const BACKEND_CONFIG = {
    apiURL: '', // Base URL
    maxTokens: 16000,
    temperature: 0.3,
    defaultProvider: 'gemini'
};
let selectedAIProvider = 'gemini';
let documentData = resetDocumentData();
let currentFile = null;
let originalFileData = null;
let extractedImages = []; // Store for logos/QRs


// --- Templates ---
const templates = {
    professional: { name: 'Professional', description: 'Clean corporate style', styles: { header: { bgColor: '#ffffff', textColor: '#1a1a1a', font: 'Georgia', fontSize: 28, padding: 20, align: 'center' }, body: { bgColor: '#ffffff', textColor: '#333333', font: 'Arial', fontSize: 16, lineHeight: 1.8, margin: 20, align: 'left' }, footer: { bgColor: '#f8f9fa', textColor: '#666666', font: 'Arial', fontSize: 14, padding: 20, align: 'center' }}},
    modern: { name: 'Modern', description: 'Bold and contemporary', styles: { header: { bgColor: '#667eea', textColor: '#ffffff', font: 'Helvetica', fontSize: 32, padding: 25, align: 'left' }, body: { bgColor: '#ffffff', textColor: '#2d3748', font: 'Helvetica', fontSize: 15, lineHeight: 1.9, margin: 25, align: 'left' }, footer: { bgColor: '#667eea', textColor: '#ffffff', font: 'Helvetica', fontSize: 12, padding: 20, align: 'center' }}},
    elegant: { name: 'Elegant', description: 'Sophisticated serif design', styles: { header: { bgColor: '#f8f9fa', textColor: '#2c3e50', font: 'Georgia', fontSize: 30, padding: 25, align: 'center' }, body: { bgColor: '#ffffff', textColor: '#34495e', font: 'Georgia', fontSize: 17, lineHeight: 2.0, margin: 30, align: 'justify' }, footer: { bgColor: '#f8f9fa', textColor: '#7f8c8d', font: 'Georgia', fontSize: 13, padding: 20, align: 'center' }}},
    minimal: { name: 'Minimal', description: 'Simple and focused', styles: { header: { bgColor: '#ffffff', textColor: '#000000', font: 'Arial', fontSize: 24, padding: 15, align: 'left' }, body: { bgColor: '#ffffff', textColor: '#000000', font: 'Arial', fontSize: 14, lineHeight: 1.6, margin: 15, align: 'left' }, footer: { bgColor: '#ffffff', textColor: '#666666', font: 'Arial', fontSize: 10, padding: 15, align: 'right' }}},
    creative: { name: 'Creative', description: 'Vibrant and artistic', styles: { header: { bgColor: '#764ba2', textColor: '#ffffff', font: 'Verdana', fontSize: 26, padding: 25, align: 'center' }, body: { bgColor: '#fdfcfb', textColor: '#2d3436', font: 'Verdana', fontSize: 15, lineHeight: 1.7, margin: 25, align: 'left' }, footer: { bgColor: '#764ba2', textColor: '#ffffff', font: 'Verdana', fontSize: 11, padding: 20, align: 'center' }}},
    invoice: { name: 'Invoice', description: 'Professional billing layout', styles: { header: { bgColor: '#ffffff', textColor: '#000000', font: 'Arial', fontSize: 24, padding: 20, align: 'right' }, body: { bgColor: '#ffffff', textColor: '#333333', font: 'Arial', fontSize: 14, lineHeight: 1.6, margin: 20, align: 'left' }, footer: { bgColor: '#f4f4f4', textColor: '#555555', font: 'Arial', fontSize: 12, padding: 20, align: 'center' }}},
    resume: { name: 'Resume/CV', description: 'Professional resume layout', styles: { header: { bgColor: '#2c3e50', textColor: '#ffffff', font: 'Arial', fontSize: 26, padding: 20, align: 'center' }, body: { bgColor: '#ffffff', textColor: '#2c3e50', font: 'Arial', fontSize: 14, lineHeight: 1.6, margin: 20, align: 'left' }, footer: { bgColor: '#ecf0f1', textColor: '#7f8c8d', font: 'Arial', fontSize: 11, padding: 15, align: 'center' }}},
    report: { name: 'Business Report', description: 'Formal report structure', styles: { header: { bgColor: '#f8f9fa', textColor: '#1a1a1a', font: 'Georgia', fontSize: 32, padding: 30, align: 'left' }, body: { bgColor: '#ffffff', textColor: '#333333', font: 'Georgia', fontSize: 16, lineHeight: 1.8, margin: 30, align: 'justify' }, footer: { bgColor: '#f8f9fa', textColor: '#666666', font: 'Arial', fontSize: 12, padding: 20, align: 'left' }}}
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showStatus(message, type, duration = 3000) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-toast status-${type}`;
    statusDiv.textContent = message;
    document.body.appendChild(statusDiv);
    setTimeout(() => { statusDiv.style.opacity = '0'; setTimeout(() => statusDiv.remove(), 500); }, duration);
}
function showToast(message, type) { showStatus(message, type); }

function showAIStatus(message, progress) {
    const statusDiv = document.getElementById('aiStatus');
    if (!statusDiv) return;
    const msgEl = document.getElementById('aiStatusMessage');
    if (msgEl) msgEl.textContent = message;
    const fillEl = document.getElementById('progressFill');
    if (fillEl) fillEl.style.width = progress + '%';
    statusDiv.style.display = 'block';
}

function hideAIStatus() {
    setTimeout(() => {
        const statusDiv = document.getElementById('aiStatus');
        if (statusDiv) statusDiv.style.display = 'none';
    }, 1500);
}

function resetDocumentData() {
    return {
        header: '', body: '', footer: '', logoData: null, logoPosition: { x: 20, y: 20 },
        originalFileType: null, originalFileName: null,
        styles: {
            header: { bgColor: '#ffffff', textColor: '#1a1a1a', font: 'Georgia', fontSize: 28, padding: 20, align: 'center' },
            body: { bgColor: '#ffffff', textColor: '#333333', font: 'Arial', fontSize: 16, lineHeight: 1.8, margin: 20, align: 'left' },
            footer: { bgColor: '#f8f9fa', textColor: '#666666', font: 'Arial', fontSize: 14, padding: 20, align: 'center' },
            logo: { size: 100, opacity: 100, rotation: 0 }
        },
        aiMetadata: null, xlsxMetadata: null
    };
}

function sanitizeAIOutput(htmlString) {
    htmlString = htmlString.replace(/[%¥]/g, '₹');

    if (!htmlString) return '';
    const trimmedString = htmlString.trim();

    // If AI already sent HTML, keep it intact
    if (trimmedString.startsWith('<') && trimmedString.endsWith('>')) {
        return trimmedString.replace(/\n/g, '');
    }

    // Detect invoice-like structure
    const isInvoice = /(invoice|billed to|qty|quantity|rate|amount|total|gstin|pan|bill no|invoice no)/i.test(trimmedString);
    if (isInvoice) {
        console.log("🧾 Detected invoice structure — applying layout formatting.");
        const lines = trimmedString.split(/\n+/).map(line => line.trim()).filter(Boolean);

        let html = `
        <div class="invoice-wrapper">
            <div class="invoice-header">
                <div class="invoice-left">
                    <div class="invoice-logo">🧾</div>
                </div>
                <div class="invoice-right">
                    <h2>INVOICE</h2>
                </div>
            </div>
            <div class="invoice-body">
        `;

        lines.forEach(line => {
            if (/^(total|subtotal|amount|balance)/i.test(line)) {
                html += `<p class="invoice-total"><strong>${line}</strong></p>`;
            } else if (/^(billed|bill to|invoice no|invoice date)/i.test(line)) {
                html += `<p class="invoice-section"><strong>${line}</strong></p>`;
            } else {
                html += `<p>${line}</p>`;
            }
        });

        html += `
            </div>
        </div>
        <style>
            .invoice-wrapper {
                font-family: 'Arial', sans-serif;
                background: #fff;
                padding: 25px 40px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                max-width: 800px;
                margin: 20px auto;
            }
            .invoice-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 2px solid #667eea;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .invoice-header h2 {
                margin: 0;
                color: #667eea;
                font-size: 28px;
            }
            .invoice-body p {
                line-height: 1.8;
                margin: 5px 0;
                font-size: 15px;
            }
            .invoice-section {
                margin-top: 15px;
                color: #111;
            }
            .invoice-total {
                text-align: right;
                font-weight: bold;
                margin-top: 20px;
                font-size: 16px;
                border-top: 1px solid #ddd;
                padding-top: 8px;
            }
        </style>
        `;

        return html;
    }
    htmlString = htmlString.replace(/(Bank Details[\s\S]+)/i, '<div class="bank-box">$1</div>');

    // Default for other documents
    return '<div>' + htmlString.replace(/\n/g, '<br>') + '</div>';
}


// ============================================
// AI API COMMUNICATION
// ============================================
const SecureAI = {
    async callAPI(prompt, onProgress, fileType) {
        let lastError = null;
        
        // Try each provider in order
        for (const provider of AI_PROVIDER_ORDER) {
            try {
                console.log(`Trying AI provider: ${provider}`);
                if (onProgress) onProgress(`Connecting to AI (${provider})...`, 20);
                
                const response = await fetch(`/api/format`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: prompt,
                        maxTokens: BACKEND_CONFIG.maxTokens,
                        temperature: BACKEND_CONFIG.temperature,
                        provider: provider,
                        fileType: fileType || 'unknown'
                    })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`${provider} API Error:`, errorText);
                    let errorMsg = `${provider} error: ${response.status}`;
                    try { errorMsg = JSON.parse(errorText).error || errorMsg; } catch (e) {}
                    throw new Error(errorMsg);
                }
                
                if (onProgress) onProgress(`Processing with ${provider}...`, 70);
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'AI processing failed');
                }
                
                if (onProgress) onProgress('Formatting complete!', 100);
                console.log(`✅ Success with ${provider}`);
                selectedAIProvider = provider; // Remember working provider
                return { success: true, text: data.text, provider: data.provider, documentType: data.documentType };
                
            } catch (error) {
                console.error(`❌ ${provider} failed:`, error.message);
                lastError = error;
                // Try next provider
                continue;
            }
        }
        
        // All providers failed
        throw new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
    },

    parseResponse(jsonString) {
        const cleanedString = jsonString.trim();
        try {
            console.log("Attempting to parse JSON string (length " + cleanedString.length + "):", cleanedString.substring(0, 400) + "...");
            const parsed = JSON.parse(cleanedString);
            if (!parsed || typeof parsed !== 'object' || !parsed.sections) {
                console.error('Parsed JSON lacks expected structure:', parsed);
                throw new Error("Invalid JSON structure (missing 'sections' key).");
            }
            parsed.sections.header = String(parsed.sections.header || '');
            parsed.sections.body = String(parsed.sections.body || '');
            parsed.sections.footer = String(parsed.sections.footer || '');
            console.log("JSON parsed successfully.");
            return parsed;
        } catch (error) {
            console.error('JSON.parse failed client-side:', error.message);
            console.error('--- Invalid JSON String Received ---');
            console.error(cleanedString);
            console.error('--- End Invalid JSON String ---');
            return this.createFallbackResponse(cleanedString, error.message);
        }
    },

    createFallbackResponse(rawText, parseErrorMessage = "AI response could not be parsed.") {
        console.error("Creating fallback response. Parse error:", parseErrorMessage);
        const escapedText = (rawText || "No content available.").replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const fallbackBody = `<p style="color: red; font-weight: bold;">Formatting Error: ${parseErrorMessage}</p><p>The AI response was not valid JSON. Raw response received:</p><hr><pre style="white-space: pre-wrap; word-wrap: break-word; background: #eee; padding: 10px; border: 1px solid #ccc;">${escapedText}</pre>`;
        return {
            documentType: 'document', confidence: 0.50,
            sections: { header: '<p style="color: red;">Formatting Error</p>', body: fallbackBody, footer: '' },
            metadata: { title: 'Formatting Error' }
        };
     }
};



// ============================================
// BACKEND CONNECTION TEST
// ============================================
async function testBackendConnection() {
    try {
        showToast(`Testing connection...`, 'info', 1500);
        const response = await fetch(`/api/health`, { method: 'GET' });
        const data = await response.json();
        if (response.ok && data.status === 'ok') {
             console.log(`✅ Backend test OK: ${data.message}`);
             showToast(`Connection OK`, 'success'); return true;
        } else {
             console.warn(`⚠️ Backend test issue:`, data.message || `Server responded ${response.status}`);
             showToast(`Connection Error: ${data.message || `Server responded ${response.status}`}`, 'error', 5000); return false;
        }
    } catch (error) {
        console.error(`❌ Backend connection error:`, error);
        if (error instanceof TypeError) { showToast(`Connection Failed: Server not reachable at ${BACKEND_CONFIG.apiURL}`, 'error', 5000);
        } else { showToast(`Connection Failed: ${error.message}`, 'error', 5000); }
        return false;
    }
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    try {
        initializeApp();
        loadTemplates();
        setupCustomizationControls();
        setupLogoControls();
        testBackendConnection();
    } catch (error) {
        console.error("Initialization failed:", error);
        alert("Error initializing the application. Please check the console.");
    }
});

function initializeApp() {
    console.log("Initializing app...");
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            const contentEl = document.querySelector(`[data-content="${targetTab}"]`);
            if (contentEl) contentEl.classList.add('active');
        });
    });

    // --- Button Listeners ---
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => { fileInput.click(); });
        fileInput.addEventListener('change', handleFileUpload);
        console.log("✅ Upload button listener attached.");
    } else { console.error("❌ Upload button or file input not found!"); }

    const aiFormatBtn = document.getElementById('aiFormatBtn');
    if (aiFormatBtn) {
        aiFormatBtn.addEventListener('click', handleAIFormat);
        console.log("✅ Format button listener attached.");
    } else { console.error("❌ Format button (#aiFormatBtn) not found!"); }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearDocument);
        console.log("✅ Clear button listener attached.");
    } else { console.error("❌ Clear button (#clearBtn) not found!"); }

    // Other setup
    setupEditablePreview();
    loadAIPreference();
    console.log("App initialized.");
}

// ============================================
// UI SETUP FUNCTIONS
// ============================================
function loadTemplates() {
    const grid = document.getElementById('templateGrid');
    if (!grid) { console.error("#templateGrid not found!"); return; }
    grid.innerHTML = '';
    Object.entries(templates).forEach(([key, template]) => {
        const card = document.createElement('div');
        card.className = 'template-card'; card.dataset.templateKey = key;
        card.innerHTML = `
            <div class="template-preview" style="background:${template.styles.header.bgColor}; color:${template.styles.header.textColor}; font-family:${template.styles.header.font}; font-size:0.85rem; padding:10px; border-radius:8px 8px 0 0; display:flex; align-items:center; justify-content:center; min-height:60px;">
                <strong>${template.name}</strong>
            </div>
            <h3>${template.name}</h3> <p>${template.description}</p> <span class="template-badge">Click to Apply</span>`;
        card.addEventListener('click', (e) => {
            const clickedKey = e.currentTarget.dataset.templateKey; applyTemplate(clickedKey);
            document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active')); e.currentTarget.classList.add('active');
        });
        grid.appendChild(card);
    });
}
function applyTemplate(templateKey) {
    const template = templates[templateKey];
    if (!template?.styles) { console.error(`Template "${templateKey}" invalid.`); return; }
    console.log(`Applying template: ${template.name}`);
    documentData.styles.header = { ...documentData.styles.header, ...template.styles.header };
    documentData.styles.body = { ...documentData.styles.body, ...template.styles.body };
    documentData.styles.footer = { ...documentData.styles.footer, ...template.styles.footer };
    updateCustomizationUI(); updatePreview(); showToast(`Applied ${template.name} template`, 'success');
}
function setupCustomizationControls() {
    const setupControl = (inputId, dataPath, valueDisplayId = null, isFloat = false) => {
        const element = document.getElementById(inputId); if (!element) { console.warn(`Control ${inputId} not found`); return; }
        const eventType = (element.type === 'range' || element.type === 'color') ? 'input' : 'change';
        element.addEventListener(eventType, (e) => {
            let value = e.target.value; if (element.type === 'range') value = isFloat ? parseFloat(value) : parseInt(value);
            let current = documentData; const parts = dataPath.split('.');
            for (let i = 0; i < parts.length - 1; i++) current = current[parts[i]];
            current[parts[parts.length - 1]] = value;
            if (valueDisplayId) document.getElementById(valueDisplayId).textContent = value;
            updatePreview();
        });
    };
    setupControl('headerBgColor', 'styles.header.bgColor'); setupControl('headerTextColor', 'styles.header.textColor');
    setupControl('headerFont', 'styles.header.font'); setupControl('headerFontSize', 'styles.header.fontSize', 'headerFontSizeValue');
    setupControl('headerPadding', 'styles.header.padding', 'headerPaddingValue');
    setupControl('bodyBgColor', 'styles.body.bgColor'); setupControl('bodyTextColor', 'styles.body.textColor');
    setupControl('bodyFont', 'styles.body.font'); setupControl('bodyFontSize', 'styles.body.fontSize', 'bodyFontSizeValue');
    setupControl('bodyLineHeight', 'styles.body.lineHeight', 'bodyLineHeightValue', true);
    setupControl('bodyMargin', 'styles.body.margin', 'bodyMarginValue');
    setupControl('footerBgColor', 'styles.footer.bgColor'); setupControl('footerTextColor', 'styles.footer.textColor');
    setupControl('footerFont', 'styles.footer.font'); setupControl('footerFontSize', 'styles.footer.fontSize', 'footerFontSizeValue');
    setupControl('footerPadding', 'styles.footer.padding', 'footerPaddingValue');
    document.querySelectorAll('.align-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const section = this.dataset.section; const align = this.dataset.align;
            if (documentData.styles[section]) {
                documentData.styles[section].align = align;
                this.parentElement.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active')); this.classList.add('active');
                updatePreview();
            }
        });
    });
}
function updateCustomizationUI() {
    const setControlValue = (inputId, dataPath, valueDisplayId = null) => {
         const element = document.getElementById(inputId); if (!element) return;
         let current = documentData; const parts = dataPath.split('.'); let value = current;
         try { for (const part of parts) value = value[part]; } catch (e) { return; }
         element.value = value;
         if (valueDisplayId) { const display = document.getElementById(valueDisplayId); if (display) display.textContent = value; }
    };
    const setActiveAlignButton = (section) => {
        const align = documentData.styles[section]?.align || 'left';
        document.querySelectorAll(`.align-btn[data-section="${section}"]`).forEach(btn => btn.classList.toggle('active', btn.dataset.align === align));
    };
    setControlValue('headerBgColor', 'styles.header.bgColor'); setControlValue('headerTextColor', 'styles.header.textColor');
    setControlValue('headerFont', 'styles.header.font'); setControlValue('headerFontSize', 'styles.header.fontSize', 'headerFontSizeValue');
    setControlValue('headerPadding', 'styles.header.padding', 'headerPaddingValue'); setActiveAlignButton('header');
    setControlValue('bodyBgColor', 'styles.body.bgColor'); setControlValue('bodyTextColor', 'styles.body.textColor');
    setControlValue('bodyFont', 'styles.body.font'); setControlValue('bodyFontSize', 'styles.body.fontSize', 'bodyFontSizeValue');
    setControlValue('bodyLineHeight', 'styles.body.lineHeight', 'bodyLineHeightValue'); setControlValue('bodyMargin', 'styles.body.margin', 'bodyMarginValue');
    setActiveAlignButton('body');
    setControlValue('footerBgColor', 'styles.footer.bgColor'); setControlValue('footerTextColor', 'styles.footer.textColor');
    setControlValue('footerFont', 'styles.footer.font'); setControlValue('footerFontSize', 'styles.footer.fontSize', 'footerFontSizeValue');
    setControlValue('footerPadding', 'styles.footer.padding', 'footerPaddingValue'); setActiveAlignButton('footer');
    setControlValue('logoSize', 'styles.logo.size', 'logoSizeValue'); setControlValue('logoOpacity', 'styles.logo.opacity', 'logoOpacityValue');
    setControlValue('logoRotation', 'styles.logo.rotation', 'logoRotationValue');
}
function setupLogoControls() {
    document.getElementById('uploadLogoBtn')?.addEventListener('click', () => document.getElementById('logoInput')?.click());
    document.getElementById('logoInput')?.addEventListener('change', handleLogoUpload);
    document.getElementById('logoSize')?.addEventListener('input', (e) => { documentData.styles.logo.size = parseInt(e.target.value); document.getElementById('logoSizeValue').textContent = e.target.value; updateLogo(); });
    document.getElementById('logoOpacity')?.addEventListener('input', (e) => { documentData.styles.logo.opacity = parseInt(e.target.value); document.getElementById('logoOpacityValue').textContent = e.target.value; updateLogo(); });
    document.getElementById('logoRotation')?.addEventListener('input', (e) => { documentData.styles.logo.rotation = parseInt(e.target.value); document.getElementById('logoRotationValue').textContent = e.target.value; updateLogo(); });
    document.getElementById('removeLogoBtn')?.addEventListener('click', removeLogo);
    setupLogoDrag();
}
function handleLogoUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        documentData.logoData = event.target.result;
        displayLogo();
        const logoControls = document.getElementById('logoControls');
        if (logoControls) logoControls.style.display = 'block';
        showToast('Logo uploaded', 'success');
    };
    reader.readAsDataURL(file);
}
function displayLogo() {
    const container = document.getElementById('logoContainer'); const img = document.getElementById('logoImage');
    if (img && container && documentData.logoData) {
        img.src = documentData.logoData; container.style.display = 'block'; updateLogo();
    }
}
function updateLogo() {
    const img = document.getElementById('logoImage'); const container = document.getElementById('logoContainer');
    if (!img || !container || !documentData.logoData) return;
    const { size, opacity, rotation } = documentData.styles.logo;
    img.style.width = size + 'px'; img.style.opacity = opacity / 100; img.style.transform = `rotate(${rotation}deg)`;
    container.style.left = documentData.logoPosition.x + 'px'; container.style.top = documentData.logoPosition.y + 'px';
}
function removeLogo() {
    documentData.logoData = null;
    const logoContainer = document.getElementById('logoContainer'); if(logoContainer) logoContainer.style.display = 'none';
    const logoControls = document.getElementById('logoControls'); if(logoControls) logoControls.style.display = 'none';
    const logoInput = document.getElementById('logoInput'); if(logoInput) logoInput.value = '';
    showToast('Logo removed', 'info');
}
function setupLogoDrag() {
    const logo = document.getElementById('logoImage'); const container = document.getElementById('logoContainer');
    if (!logo || !container) return;
    let isDragging = false, startX, startY, initialLeft, initialTop, containerRect;
    logo.addEventListener('mousedown', (e) => {
        if (!documentData.logoData) return; isDragging = true;
        startX = e.clientX; startY = e.clientY;
        containerRect = container.parentElement.getBoundingClientRect();
        initialLeft = container.offsetLeft; initialTop = container.offsetTop;
        logo.style.cursor = 'grabbing'; container.style.zIndex = '1000';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return; e.preventDefault();
        const deltaX = e.clientX - startX; const deltaY = e.clientY - startY;
        let newLeft = initialLeft + deltaX; let newTop = initialTop + deltaY;
        newLeft = Math.max(0, Math.min(containerRect.width - container.offsetWidth, newLeft));
        newTop = Math.max(0, Math.min(containerRect.height - container.offsetHeight, newTop));
        container.style.left = newLeft + 'px'; container.style.top = newTop + 'px';
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false; logo.style.cursor = 'move'; container.style.zIndex = '10';
            documentData.logoPosition.x = container.offsetLeft; documentData.logoPosition.y = container.offsetTop;
        }
    });
}

// ============================================
// FILE UPLOAD & PROCESSING
// ============================================
async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) { console.log("No file selected."); return; }
    console.log(`File selected: ${file.name}`);
    currentFile = file; originalFileData = file;
    const metadata = FileHandlers.getFileMetadata(file);

    documentData = resetDocumentData();
    documentData.originalFileName = metadata.name;
    extractedImages = []; // Clear global images

    const textInput = document.getElementById('textInput');
    if(textInput) textInput.value = 'Extracting content...';
    displayFileInfo(metadata);

    try {
        showAIStatus('Reading file...', 0);
        const progressCallback = (messageOrProgress, progressValue) => {
             let message = 'Extracting content...'; let progress = 0;
             if (typeof messageOrProgress === 'string' && typeof progressValue === 'number') { message = messageOrProgress; progress = progressValue; }
             else if (typeof messageOrProgress === 'number') { progress = messageOrProgress; }
             showAIStatus(message, Math.min(progress, 50));
        };
        
        const extracted = await FileHandlers.processFile(file, progressCallback);
        
        if (!extracted || typeof extracted.text === 'undefined') { throw new Error("File extraction failed."); }

        documentData.originalFileType = extracted.type || metadata.extension;
        console.log(`File type set to: ${documentData.originalFileType}`);

        if (extracted.images && extracted.images.length > 0) {
            extractedImages = extracted.images;
            console.log(`🖼️ Stored ${extractedImages.length} images from file.`);
        }

        textInput.value = extracted.text || '';
        showStatus(`File loaded: ${metadata.name}`, 'success');

        if (extracted.type === 'xlsx' && extracted.sheets?.length > 0) {
             documentData.xlsxMetadata = {
                 sheets: extracted.sheets, sheetCount: extracted.sheetCount,
                 totalRows: extracted.sheets[0].rowCount, totalColumns: extracted.sheets[0].columnCount,
                 firstSheetName: extracted.sheets[0].name
             };
             console.log('📊 Spreadsheet metadata stored.');
        }

        updateDownloadButtons();
        updatePreview();
    } catch (error) {
        console.error('File upload error:', error);
        showStatus(`Error reading file: ${error.message}`, 'error', 5000);
        if(textInput) textInput.value = `Error reading file: ${error.message}`;
    } finally {
         hideAIStatus();
         if(e.target) e.target.value = '';
    }
}
function displayFileInfo(metadata) {
    const fileInfo = document.getElementById('fileInfo'); if (!fileInfo) return;
    document.getElementById('fileName').textContent = metadata.name;
    document.getElementById('fileSize').textContent = metadata.sizeFormatted;
    const typeBadge = document.getElementById('fileType');
    typeBadge.textContent = metadata.extension.toUpperCase();
    typeBadge.className = 'file-type-badge type-' + metadata.extension;
    fileInfo.style.display = 'flex';
}

// ============================================
// OCR Pre-Cleaning Function
// ============================================

// ============================================
// Build HTML Table from Cleaned OCR Text (FINAL - CORRECTED)
// ============================================
// ============================================
// Build HTML Table from Cleaned OCR Text (FINAL - v6 - Preserve All Details)
// ============================================


// ============================================
// FORMATTING LOGIC
// ============================================
// ============================================
// FORMATTING LOGIC (v6 - SIMPLIFIED - AI HANDLES ALL PARSING)
// ============================================
async function handleAIFormat() {
    const textInput = document.getElementById('textInput');
    const hasTextInput = textInput && textInput.value.trim().length > 0;
    if (!currentFile && !hasTextInput) { alert('Upload file or paste text first.'); return; }

    // --- Spreadsheet Client-Side ---
    if (documentData.xlsxMetadata?.sheets?.length > 0) {
        console.log("Formatting spreadsheet client-side...");
        showAIStatus('Formatting spreadsheet locally...', 50);
        try {
            const result = formatSpreadsheetClientSide();
            applyFormattedDocument(result.document);
            const fileMeta = currentFile ? FileHandlers.getFileMetadata(currentFile) : { name: "Spreadsheet", extension: "xlsx"};
            displayAIAnalysis(result.document, fileMeta);
            document.querySelector('[data-tab="preview"]')?.click();
            showStatus('✅ Spreadsheet formatted locally!', 'success');
            updateDownloadButtons();
        } catch (error) { console.error('Client-side spreadsheet error:', error); showStatus(`Spreadsheet Error: ${error.message}`, 'error'); alert(`Spreadsheet Error:\n${error.message}`); }
        finally { hideAIStatus(); }
        return;
    }

    // --- AI Formatting (Simplified v6) ---
    console.log("Formatting with AI (v6 - Full Text Mode)...");
    let originalExtractedText = textInput ? textInput.value.trim() : '';
    let fileMetadata = {
        extension: documentData.originalFileType || (currentFile ? FileHandlers.getFileMetadata(currentFile).extension : 'txt'),
        name: documentData.originalFileName || (currentFile ? currentFile.name : 'PastedText.txt'),
        type: currentFile ? currentFile.type : 'text/plain'
    };
    
    try {
        showAIStatus('Initializing...', 0);
        if (!originalExtractedText && currentFile) {
            console.warn("Text empty, re-extracting...");
            showAIStatus('Re-reading file...', 5);
            const extracted = await FileHandlers.processFile(currentFile, (msg, prog) => showAIStatus(msg || 'Extracting...', 5 + (prog || 0) * 0.2));
            originalExtractedText = extracted?.text?.trim() || '';
            if (!originalExtractedText) throw new Error("Re-extraction failed.");
            if(textInput) textInput.value = originalExtractedText;
        }
        if (!originalExtractedText.trim()) { throw new Error("Cannot format: Content is empty."); }
// *** SIMPLIFIED: Send the full raw text to the AI ***
const textToSendToAI = originalExtractedText;
        
// Pass the original file type so the server can detect it

// Pass the original file type so the server can detect it
        const documentTypeForAI = documentData.originalFileType; 
        
        const aiProgressCallback = (message, progress) => { showAIStatus(message, progress); };

        const aiResponse = await SecureAI.callAPI(
            textToSendToAI,
            aiProgressCallback,
            documentTypeForAI
        );

        let formattedDoc = SecureAI.parseResponse(aiResponse.text);

        // *** Sanitize all text fields from AI ***
        formattedDoc.sections.header = sanitizeAIOutput(formattedDoc.sections.header || '');
        formattedDoc.sections.body = sanitizeAIOutput(formattedDoc.sections.body || '');
        formattedDoc.sections.footer = sanitizeAIOutput(formattedDoc.sections.footer || '');

        // ***** INJECT EXTRACTED IMAGES (LOGO/QR) *****
        // (This logic is still needed and works)
        if (extractedImages.length > 0) {
            console.log("Injecting extracted images...");
            const logoImg = extractedImages.find(img => img.type === 'logo');
            const qrImg = extractedImages.find(img => img.type === 'qr');
            
            if (logoImg) {
                // Added styles for better layout
                const logoHtml = `<img src="${logoImg.dataUrl}" alt="Logo" style="max-width: 150px; max-height: 100px; object-fit: contain; display: block; margin-bottom: 15px;">`;
                if (formattedDoc.sections.header.includes("[LOGO]")) {
                    // Remove placeholder text
                    formattedDoc.sections.header = formattedDoc.sections.header.replace("[LOGO]", "");
                }
                // Prepend image so text flows after it
                formattedDoc.sections.header = logoHtml + formattedDoc.sections.header;
                console.log("✅ Injected Logo at start of header.");
            }
            
            if (qrImg) {
                const qrHtml = `<div style="text-align: center; margin-top: 20px;"><img src="${qrImg.dataUrl}" alt="QR Code" style="max-width: 150px; max-height: 150px;"></div>`;
                if (formattedDoc.sections.footer.includes("[QR CODE]")) {
                    // Remove placeholder text
                    formattedDoc.sections.footer = formattedDoc.sections.footer.replace("[QR CODE]", "");
                }
                // Append image
                formattedDoc.sections.footer += qrHtml;
                console.log("✅ Injected QR at end of footer.");
            }
        }
        // ***** END IMAGE INJECTION *****

        formattedDoc.detectedType = aiResponse.documentType || formattedDoc.documentType || 'document';
        formattedDoc.originalFile = { name: fileMetadata.name, type: fileMetadata.type, extension: fileMetadata.extension };
        formattedDoc.provider = aiResponse.provider;

        applyFormattedDocument(formattedDoc);
        displayAIAnalysis(formattedDoc, fileMetadata);
        document.querySelector('[data-tab="preview"]')?.click();
        showStatus('✅ Document formatted!', 'success');
        updateDownloadButtons();

    } catch (error) {
        console.error('Formatting error:', error.message);
        const errorMessage = error.message || "An unknown error occurred.";
        showStatus(`Error: ${errorMessage}`, 'error');
        let alertMsg = `Formatting Failed:\n\n${errorMessage}`;
        if (errorMessage.toLowerCase().includes("token limit")) alertMsg += "\n\nTry a smaller document.";
        else if (errorMessage.toLowerCase().includes("invalid json") || errorMessage.toLowerCase().includes("unexpected format")) alertMsg += "\n\nAI response issue. Try again or check server logs.";
        else if (errorMessage.toLowerCase().includes("configured") || errorMessage.toLowerCase().includes("api key")) alertMsg += "\n\nCheck AI provider setup on server.";
        else if (errorMessage.toLowerCase().includes("backend error") || errorMessage.includes("fetch") || errorMessage.includes("404")) alertMsg += "\n\nCannot reach backend. Is it running?";
        else if (errorMessage.toLowerCase().includes("ocr") || errorMessage.toLowerCase().includes("image")) alertMsg += "\n\nError during OCR processing. The image might be unclear or corrupted.";
        alert(alertMsg);
    } finally {
        hideAIStatus();
    }
}


function formatSpreadsheetClientSide() {
    if (!documentData.xlsxMetadata?.sheets?.length > 0) throw new Error("Spreadsheet data missing.");
    let combinedHTML = ''; let firstSheetName = 'Spreadsheet'; let totalRows = 0; let totalCols = 0;
    documentData.xlsxMetadata.sheets.forEach((sheet, index) => {
        if (index === 0) { firstSheetName = sheet.name || `Sheet${index + 1}`; totalRows = sheet.rowCount; totalCols = sheet.columnCount; }
        combinedHTML += sheet.html || '';
    });
    if (!combinedHTML) throw new Error(`Sheet HTML generation failed.`);
    const formattedDoc = {
        documentType: "spreadsheet", confidence: 1.0,
        sections: {
            header: `<h2>Spreadsheet: ${firstSheetName} ${documentData.xlsxMetadata.sheetCount > 1 ? `(${documentData.xlsxMetadata.sheetCount - 1} more)` : ''}</h2><p>Rows: ${totalRows} | Columns: ${totalCols}</p>`,
            body: combinedHTML, footer: ""
        },
        metadata: { title: firstSheetName, rowCount: totalRows, columnCount: totalCols },
        originalFile: currentFile ? { name: currentFile.name, type: currentFile.type, extension: documentData.originalFileType } : null,
        detectedType: "spreadsheet"
    };
    return { success: true, document: formattedDoc };
}

// ============================================
// UI UPDATES & DISPLAY
// ============================================
function applyFormattedDocument(docData){
    if (!docData || !docData.sections) { console.error("applyFormattedDocument: Invalid data", docData); return; }
    documentData.header = docData.sections.header || '';
    documentData.body = docData.sections.body || '';
    documentData.footer = docData.sections.footer || '';
    documentData.aiMetadata = docData.metadata || {};
    if (docData.originalFile) {
        documentData.originalFileType = docData.originalFile.extension;
        documentData.originalFileName = docData.originalFile.name || "document";
    }
    updatePreview();
}
function displayAIAnalysis(docData, metadata){
    const analysisDiv = document.getElementById('aiAnalysis'); if (!analysisDiv || !docData) return;
    document.getElementById('detectedType').textContent = docData.detectedType || docData.documentType || 'Unknown';
    document.getElementById('confidence').textContent = Math.round((docData.confidence || 0) * 100) + '%';
    const sectionsCount = Object.values(docData.sections || {}).filter(Boolean).length;
    document.getElementById('sectionsCount').textContent = sectionsCount;
    const allText = Object.values(docData.sections || {}).join(' ');
    const tempDiv = document.createElement('div'); tempDiv.innerHTML = allText;
    const textContent = tempDiv.textContent || tempDiv.innerText || "";
    const wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
    document.getElementById('wordCount').textContent = wordCount;
    analysisDiv.style.display = 'block';
}
function setupEditablePreview(){
    const headerEl=document.getElementById('previewHeader');
    const bodyEl=document.getElementById('previewBody');
    const footerEl=document.getElementById('previewFooter');
    [headerEl,bodyEl,footerEl].forEach((el,index)=>{
        if(!el)return;
        el.addEventListener('input',function(){
            if(index===0)documentData.header=this.innerHTML;
            else if(index===1)documentData.body=this.innerHTML;
            else documentData.footer=this.innerHTML;
        });
    });
}
function updatePreview(){
    const headerEl=document.getElementById('previewHeader');
    const bodyEl=document.getElementById('previewBody');
    const footerEl=document.getElementById('previewFooter');
    if(headerEl)headerEl.innerHTML=documentData.header||'<p style="color:#999; text-align:center;">Header Area</p>';
    if(bodyEl)bodyEl.innerHTML=documentData.body||'<p style="color:#999; text-align:center;">Formatted Content Area</p>';
    if(footerEl)footerEl.innerHTML=documentData.footer||'<p style="color:#999; text-align:center;">Footer Area</p>';
    applyStylesToPreview();
}
function applyStylesToPreview(){
    if (!documentData?.styles) { console.error("Cannot apply styles: styles undefined."); return; }
    const headerEl = document.getElementById('previewHeader');
    const bodyEl = document.getElementById('previewBody');
    const footerEl = document.getElementById('previewFooter');
    if (headerEl && documentData.styles.header) Object.assign(headerEl.style, { backgroundColor: documentData.styles.header.bgColor, color: documentData.styles.header.textColor, fontFamily: documentData.styles.header.font, fontSize: documentData.styles.header.fontSize + 'px', padding: documentData.styles.header.padding + 'px', textAlign: documentData.styles.header.align });
    if (bodyEl && documentData.styles.body) Object.assign(bodyEl.style, { backgroundColor: documentData.styles.body.bgColor, color: documentData.styles.body.textColor, fontFamily: documentData.styles.body.font, fontSize: documentData.styles.body.fontSize + 'px', lineHeight: documentData.styles.body.lineHeight, padding: documentData.styles.body.margin + 'px', textAlign: documentData.styles.body.align });
    if (footerEl && documentData.styles.footer) Object.assign(footerEl.style, { backgroundColor: documentData.styles.footer.bgColor, color: documentData.styles.footer.textColor, fontFamily: documentData.styles.footer.font, fontSize: documentData.styles.footer.fontSize + 'px', padding: documentData.styles.footer.padding + 'px', textAlign: documentData.styles.footer.align });
    
    // Only update old logo system if no extracted images exist
    const hasExtractedImages = extractedImages && extractedImages.length > 0;
    if (!hasExtractedImages) {
        updateLogo();
    } else {
        // Hide old logo container when using extracted images
        const logoContainer = document.getElementById('logoContainer');
        if(logoContainer) logoContainer.style.display = 'none';
    }
}

// ============================================
// DOWNLOAD FUNCTIONS
// ============================================
// REPLACE the old updateDownloadButtons with this:
function updateDownloadButtons() {
    const container = document.querySelector('.download-buttons');
    if (!container) return;
    container.innerHTML = ''; // Clear all buttons

    const fileType = documentData.originalFileType;
    const buttons = [];
    const hasContent = documentData.body?.trim().length > 0 || documentData.header?.trim().length > 0 || documentData.footer?.trim().length > 0;

    if (!hasContent) {
        container.innerHTML = '<p style="color:#666;">Format a document to enable downloads.</p>';
        return;
    }

    // 1. Add primary download types
    if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'csv') {
        buttons.push({ id: 'downloadExcel', icon: 'fa-file-excel', text: 'Download Excel', class: 'btn-success', handler: downloadAsExcel });
    } else if (fileType === 'docx' || fileType === 'doc') {
        buttons.push({ id: 'downloadDocx', icon: 'fa-file-word', text: 'Download Word', class: 'btn-primary', handler: downloadAsDocx });
    } else if (fileType === 'txt') {
        buttons.push({ id: 'downloadTxt', icon: 'fa-file-alt', text: 'Download Text', class: 'btn-secondary', handler: downloadAsTxt });
    }

    // 2. Add PDF buttons (Main and Alt)
    buttons.push({ id: 'downloadPdf', icon: 'fa-file-pdf', text: 'Download PDF', class: 'btn-danger', handler: downloadAsPdf });
    buttons.push({ id: 'downloadPdfAlt', icon: 'fa-file-pdf', text: 'Download PDF (Alt)', class: 'btn-info', handler: downloadAsPdfAlt });

    // 3. Add other "Download As" buttons if not the primary type
    if (fileType !== 'docx' && fileType !== 'doc') {
        buttons.push({ id: 'downloadDocxAlt', icon: 'fa-file-word', text: 'Download as Word', class: 'btn-primary', handler: downloadAsDocx });
    }
    if (fileType !== 'txt') {
        buttons.push({ id: 'downloadTxtAlt', icon: 'fa-file-alt', text: 'Download as Text', class: 'btn-secondary', handler: downloadAsTxt });
    }
    
    // 4. Add HTML button
    buttons.push({ id: 'downloadHtml', icon: 'fa-code', text: 'Download HTML', class: 'btn-secondary', handler: downloadAsHtml });

    // 5. Render all buttons
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = `btn ${btn.class}`;
        button.id = btn.id;
        button.innerHTML = `<i class="fas ${btn.icon}"></i> ${btn.text}`;
        button.addEventListener('click', btn.handler);
        container.appendChild(button);
    });
}
function downloadAsExcel() {
    if(!documentData.body&&!documentData.header&&!documentData.footer){alert('No content to download.');return}
    try{
        const wb=XLSX.utils.book_new(); const tempDiv=document.createElement('div');
        tempDiv.innerHTML=documentData.header+documentData.body+documentData.footer;
        const tables=tempDiv.querySelectorAll('table.excel-table, table');
        if(tables.length>0){
            tables.forEach((table,index)=>{
                const sheetName=table.closest('.excel-sheet')?.dataset?.sheetName||`Sheet${index+1}`;
                const rows=Array.from(table.querySelectorAll('tr'));
                const data=rows.map(row=>Array.from(row.querySelectorAll('th, td')).map(cell=>cell.textContent||""));
                const ws=XLSX.utils.aoa_to_sheet(data);
                const colWidths=[];
                if(data.length>0&&data[0].length>0){
                    const numCols=data[0].length;
                    for(let i=0;i<numCols;i++){
                        let maxLen=8; data.forEach(row=>{ if(row[i]){const cellContent=String(row[i]); const lines=cellContent.split('\n'); lines.forEach(line=>{if(line.length>maxLen)maxLen=line.length})} });
                        colWidths.push({wch:Math.min(maxLen+2,60)});
                    }
                }
                ws['!cols']=colWidths; XLSX.utils.book_append_sheet(wb,ws,sheetName);
            });
        } else {
             console.warn("No table found for Excel export.");
             const textContent=(documentData.header+"\n\n"+tempDiv.textContent+"\n\n"+documentData.footer).trim();
             const ws=XLSX.utils.aoa_to_sheet([[textContent]]); XLSX.utils.book_append_sheet(wb,ws,'Content');
        }
        const fileName=(documentData.originalFileName||'document').replace(/\.[^/.]+$/,"")+'.xlsx';
        XLSX.writeFile(wb,fileName); showToast('Downloaded as Excel','success');
    }catch(error){console.error('Excel export error:',error);alert(`Excel export failed: ${error.message}`);showToast('Excel download failed','error')}
}
function downloadAsDocx(){
    if(!documentData.header&&!documentData.body&&!documentData.footer){alert('No content to download.');return}
    const htmlContent=generateExportHTML(); if(window.htmlDocx){try{const blob=window.htmlDocx.asBlob(htmlContent);const fileName=(documentData.originalFileName||'document').replace(/\.[^/.]+$/,"")+'.docx';downloadBlob(blob,fileName);showToast('Downloaded as DOCX','success')}catch(error){console.error("htmlDocx error:",error);alert(`Word export failed: ${error.message}`);showToast('Word download failed','error')}}else{alert('html-docx.js library not loaded.');showToast('DOCX download failed','error')}
}






// *** UPDATED PDF FUNCTION ***
// REPLACE your entire function with this:

// REPLACE your entire function with this:

// REPLACE your old 'downloadAsPdf' function with this:
// REPLACE your old 'downloadAsPdf' function with this:



async function downloadAsPdf() {
    try {
        console.log("[INFO] Generating PDF (Main - Puppeteer)...");
        const fullHTML = generateExportHTMLForPdf(); // <-- CALLS THE NEW PDF-SPECIFIC FUNCTION

        if (!fullHTML || !fullHTML.trim()) {
            showToast("❌ No content to generate PDF.", "error");
            return;
        }

        const response = await fetch(`/api/generate-pdf`,{ // <-- Uses main endpoint
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ htmlContent: fullHTML })
        });

        if (!response.ok) {
            const errText = await response.text();
            let errorMsg = 'Server error';
            try { errorMsg = JSON.parse(errText).error || 'Server error'; } catch(e) {}
            console.error("❌ PDF Server Error:", errText);
            throw new Error(errorMsg);
        }

        const blob = await response.blob();
        downloadBlob(blob, "document.pdf");
        showToast("✅ PDF downloaded successfully", "success");
    } catch (error) {
        console.error("❌ PDF generation failed:", error);
        showToast("PDF generation failed: " + error.message, "error");
    }
}

// REPLACE your old 'downloadAsPdfAlt' function with this:
// REPLACE your old 'downloadAsPdfAlt' function with this:
async function downloadAsPdfAlt() {
    try {
        console.log("[INFO] Generating PDF (ALT - Client-side Print)...");
        const fullHTML = generateExportHTML(); // <-- CALLS THE 'generateExportHTML' FUNCTION

        if (!fullHTML || !fullHTML.trim()) {
            showToast("❌ No content to generate PDF.", "error");
            return;
        }

        // Create a new window or iframe to print
        const printWindow = window.open('', '_blank');
        printWindow.document.open();
        printWindow.document.write(fullHTML);
        printWindow.document.close();

        // Wait for the content to be fully loaded
        setTimeout(() => {
            printWindow.print(); // Open the print dialog
            // We can't know if they saved, so we just show an info message
            showToast("Check your browser's Print dialog to 'Save as PDF'", "info");
        }, 500); // 500ms delay to ensure rendering

    } catch (error) {
        console.error("❌ (ALT) Print-to-PDF generation failed:", error);
        showToast("(ALT) Print-to-PDF failed: " + error.message, "error");
    }
}

function downloadAsTxt(){
    if(!documentData.header&&!documentData.body&&!documentData.footer){alert('No content to download.');return}
    const stripHtml=(html)=>{const tmp=document.createElement('div');tmp.innerHTML=html;return tmp.textContent||tmp.innerText||''};
    let content=''; if(documentData.header)content+=stripHtml(documentData.header)+'\n\n'; if(documentData.body)content+=stripHtml(documentData.body)+'\n\n'; if(documentData.footer)content+=stripHtml(documentData.footer);
    const blob=new Blob([content.trim()],{type:'text/plain;charset=utf-8'}); const fileName=(documentData.originalFileName||'document').replace(/\.[^/.]+$/,"")+'.txt';
    downloadBlob(blob,fileName); showToast('Downloaded as TXT','success');
}
function downloadAsHtml(){
    if(!documentData.header&&!documentData.body&&!documentData.footer){alert('No content to download.');return}
    const htmlContent=generateExportHTML(); const blob=new Blob([htmlContent],{type:'text/html;charset=utf-8'});
    const fileName=(documentData.originalFileName||'document').replace(/\.[^/.]+$/,"")+'.html';
    downloadBlob(blob,fileName); showToast('Downloaded as HTML','success');
}



// *** THIS IS THE CORRECT, FINAL VERSION OF THIS FUNCTION ***
// REPLACE your old 'generateExportHTML' function with this:
// REPLACE your old 'generateExportHTML' function with this:
function generateExportHTML() {
    // This function generates HTML and KEEPS IMAGES
    
    // 1. Get the raw HTML content
    const headerHtml = documentData.header || '';
    const bodyHtml = documentData.body || '';
    const footerHtml = documentData.footer || '';

    // 2. Get the styles
    const styles = documentData.styles;

    // 3. Create inline style strings
    const headerStyle = `background-color:${styles.header.bgColor}; color:${styles.header.textColor}; font-family:${styles.header.font}; font-size:${styles.header.fontSize}px; padding:${styles.header.padding}px; text-align:${styles.header.align}; box-sizing: border-box;`;
    const bodyStyle = `background-color:${styles.body.bgColor}; color:${styles.body.textColor}; font-family:${styles.body.font}; font-size:${styles.body.fontSize}px; line-height:${styles.body.lineHeight}; padding:${styles.body.margin}px; text-align:${styles.body.align}; box-sizing: border-box; min-height: 200px;`;
    const footerStyle = `background-color:${styles.footer.bgColor}; color:${styles.footer.textColor}; font-family:${styles.footer.font}; font-size:${styles.footer.fontSize}px; padding:${styles.footer.padding}px; text-align:${styles.footer.align}; box-sizing: border-box;`;

    // 4. Get logo (if it exists and is not from an extracted PDF)
    let logoHtml = '';
    if (documentData.logoData && extractedImages.length === 0) { // Only use logo if not from PDF
        logoHtml = `<div id="logoContainer" style="position:absolute; top:${documentData.logoPosition.y}px; left:${documentData.logoPosition.x}px; z-index: 10;">
            <img id="logoImage" src="${documentData.logoData}" alt="Logo" style="width:${styles.logo.size}px; opacity:${styles.logo.opacity / 100}; transform:rotate(${styles.logo.rotation}deg);">
        </div>`;
    }
    
    // 5. Build the full HTML document
    const fullHtmlString = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>${documentData.aiMetadata?.title || 'Document'}</title>
            <style>
                body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
                table { border-collapse: collapse; width: 100%; margin: 10px 0; }
                table, th, td { border: 1px solid #333; padding: 8px; }
                th { background: #f5f5f5; }
                .doc-container { position: relative; width: 210mm; margin: 0 auto; border: 1px solid #eee; }
                img { max-width: 100%; height: auto; } 
            </style>
        </head>
        <body>
            <div class="doc-container">
                ${logoHtml}
                <div id="previewHeader" style="${headerStyle}">${headerHtml}</div>
                <div id="previewBody" style="${bodyStyle}">${bodyHtml}</div>
                <div id="previewFooter" style="${footerStyle}">${footerHtml}</div>
            </div>
        </body>
        </html>
    `;

    // 6. Return the clean HTML *with* images
    return fullHtmlString;
}


function downloadBlob(blob,filename){
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.style.display='none'; a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); a.remove();
}





// ============================================
// CLEAR DOCUMENT
// ============================================
function clearDocument() {
     if (confirm('Clear all content, styles, and uploaded file?')) {
        documentData = resetDocumentData();
        currentFile = null; originalFileData = null;
        extractedImages = []; // Clear extracted images
        const textInput = document.getElementById('textInput'); if(textInput) textInput.value = '';
        const fileInfo = document.getElementById('fileInfo'); if(fileInfo) fileInfo.style.display = 'none';
        const aiAnalysis = document.getElementById('aiAnalysis'); if(aiAnalysis) aiAnalysis.style.display = 'none';
        removeLogo();
        updateCustomizationUI();
        updatePreview();
        updateDownloadButtons();
        document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
        document.querySelector('.tab[data-tab="editor"]')?.click();
        showToast('Document cleared', 'info');
    }
}

// ============================================
// AUTO-FALLBACK AI SYSTEM
// ============================================
const AI_PROVIDER_ORDER = ['gemini', 'openrouter', 'huggingface'];

function loadAIPreference() {
    selectedAIProvider = 'gemini'; // Always start with gemini
}

// --- ADD THIS ENTIRE NEW FUNCTION TO SCRIPT.JS ---


// --- ADD THIS NEW FUNCTION TO SCRIPT.JS ---

function generateExportHTMLForPdf() {
    // This function generates HTML and STRIPS IMAGES for Puppeteer
    
    // 1. Get the raw HTML content
    const headerHtml = documentData.header || '';
    const bodyHtml = documentData.body || '';
    const footerHtml = documentData.footer || '';

    // 2. Get the styles
    const styles = documentData.styles;

    // 3. Create inline style strings for the containers
    const headerStyle = `background-color:${styles.header.bgColor}; color:${styles.header.textColor}; font-family:${styles.header.font}; font-size:${styles.header.fontSize}px; padding:${styles.header.padding}px; text-align:${styles.header.align}; box-sizing: border-box;`;
    const bodyStyle = `background-color:${styles.body.bgColor}; color:${styles.body.textColor}; font-family:${styles.body.font}; font-size:${styles.body.fontSize}px; line-height:${styles.body.lineHeight}; padding:${styles.body.margin}px; text-align:${styles.body.align}; box-sizing: border-box; min-height: 200px;`;
    const footerStyle = `background-color:${styles.footer.bgColor}; color:${styles.footer.textColor}; font-family:${styles.footer.font}; font-size:${styles.footer.fontSize}px; padding:${styles.footer.padding}px; text-align:${styles.footer.align}; box-sizing: border-box;`;

    // 4. Get logo (if it exists and is not from an extracted PDF)
    let logoHtml = '';
    if (documentData.logoData && extractedImages.length === 0) { // Only use logo if not from PDF
        logoHtml = `<div id="logoContainer" style="position:absolute; top:${documentData.logoPosition.y}px; left:${documentData.logoPosition.x}px; z-index: 10;">
            <img id="logoImage" src="${documentData.logoData}" alt="Logo" style="width:${styles.logo.size}px; opacity:${styles.logo.opacity / 100}; transform:rotate(${styles.logo.rotation}deg);">
        </div>`;
    }
    
    // 5. Build the full HTML document
    const fullHtmlString = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-AR8">
            <title>${documentData.aiMetadata?.title || 'Document'}</title>
            <style>
                body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
                table { border-collapse: collapse; width: 100%; margin: 10px 0; }
                table, th, td { border: 1px solid #333; padding: 8px; }
                th { background: #f5f5f5; }
                .doc-container { position: relative; width: 210mm; margin: 0 auto; border: 1px solid #eee; }
                img { max-width: 100%; height: auto; } 
            </style>
        </head>
        <body>
            <div class="doc-container">
                ${logoHtml}
                <div id="previewHeader" style="${headerStyle}">${headerHtml}</div>
                <div id="previewBody" style="${bodyStyle}">${bodyHtml}</div>
                <div id="previewFooter" style="${footerStyle}">${footerHtml}</div>
            </div>
        </body>
        </html>
    `;

    // 6. Clean for PDF generation (remove base64 images as they corrupt Puppeteer)
    return fullHtmlString
        .replace(/<img[^>]+src="data:image\/[^"]*"[^>]*>/gi, '<div style="border:1px solid #ccc;padding:10px;margin:5px 0;background:#f5f5f5;">[Image removed for PDF generation]</div>')
        .replace(/data:image\/[^"'\s)]+/g, '');
}

// ============================================
// EDITING TOOLBAR FUNCTIONALITY
// ============================================
let selectedElement = null;
let isAspectLocked = false;
let originalAspectRatio = 1;
let originalImageData = {};
let cropState = {
    active: false,
    image: null,
    canvas: null,
    ctx: null,
    cropBox: { x: 50, y: 50, width: 200, height: 200 },
    isDragging: false,
    isResizing: false,
    resizeHandle: null,
    startX: 0,
    startY: 0
};

// Initialize editing toolbar
function initEditingToolbar() {
    const toolbar = document.getElementById('editingToolbar');
    const documentPreview = document.getElementById('documentPreview');
    
    // Make all text elements and images editable on click
    documentPreview.addEventListener('click', (e) => {
        const target = e.target;
        
        // Check if clicked on text element or image
        if (target.tagName === 'P' || target.tagName === 'H1' || target.tagName === 'H2' || 
            target.tagName === 'H3' || target.tagName === 'LI' || target.tagName === 'TD' || 
            target.tagName === 'TH' || target.tagName === 'SPAN' || target.tagName === 'DIV' ||
            target.tagName === 'IMG') {
            
            // Don't select if clicking on container divs
            if (target.id === 'documentPreview' || target.classList.contains('preview-section')) {
                return;
            }
            
            e.stopPropagation();
            selectElement(target);
            toolbar.style.display = 'block';
        }
    });
    
    // Close toolbar button
    document.getElementById('closeToolbarBtn')?.addEventListener('click', cancelEdit);
    
    // Text styling controls
    document.getElementById('textFontFamily')?.addEventListener('change', applyTextStyle);
    document.getElementById('textFontSize')?.addEventListener('input', applyTextStyle);
    document.getElementById('textColor')?.addEventListener('input', applyTextStyle);
    document.getElementById('textBgColor')?.addEventListener('input', applyTextStyle);
    document.getElementById('textLineHeight')?.addEventListener('input', applyTextStyle);
    document.getElementById('textLetterSpacing')?.addEventListener('input', applyTextStyle);
    
    // Text formatting buttons
    document.getElementById('boldBtn')?.addEventListener('click', () => toggleStyle('fontWeight', 'bold', 'normal'));
    document.getElementById('italicBtn')?.addEventListener('click', () => toggleStyle('fontStyle', 'italic', 'normal'));
    document.getElementById('underlineBtn')?.addEventListener('click', () => toggleStyle('textDecoration', 'underline', 'none'));
    
    // Text alignment buttons
    document.getElementById('alignLeftBtn')?.addEventListener('click', () => applyAlignment('left'));
    document.getElementById('alignCenterBtn')?.addEventListener('click', () => applyAlignment('center'));
    document.getElementById('alignRightBtn')?.addEventListener('click', () => applyAlignment('right'));
    document.getElementById('alignJustifyBtn')?.addEventListener('click', () => applyAlignment('justify'));
    
    // Image controls
    document.getElementById('imgWidth')?.addEventListener('input', applyImageStyle);
    document.getElementById('imgHeight')?.addEventListener('input', applyImageStyle);
    document.getElementById('imgBorderWidth')?.addEventListener('input', applyImageStyle);
    document.getElementById('imgBorderColor')?.addEventListener('input', applyImageStyle);
    document.getElementById('imgBorderRadius')?.addEventListener('input', applyImageStyle);
    document.getElementById('imgOpacity')?.addEventListener('input', (e) => {
        document.getElementById('imgOpacityValue').textContent = e.target.value + '%';
        applyImageStyle();
    });
    document.getElementById('imgRotate')?.addEventListener('input', applyImageStyle);
    
    // Lock aspect ratio
    document.getElementById('lockAspectBtn')?.addEventListener('click', toggleAspectLock);
    
    // Crop and reset
    document.getElementById('cropImageBtn')?.addEventListener('click', openCropModal);
    document.getElementById('resetImageBtn')?.addEventListener('click', resetImage);
    
    // Apply/Cancel buttons
    document.getElementById('applyChangesBtn')?.addEventListener('click', applyChanges);
    document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);
    
    // Crop modal controls
    document.getElementById('closeCropModal')?.addEventListener('click', closeCropModal);
    document.getElementById('applyCropBtn')?.addEventListener('click', applyCrop);
    document.getElementById('cancelCropBtn')?.addEventListener('click', closeCropModal);
    
    // Initialize crop canvas interaction
    initCropCanvas();
}

function selectElement(element) {
    // Remove previous selection
    if (selectedElement) {
        selectedElement.classList.remove('element-selected');
    }
    
    selectedElement = element;
    element.classList.add('element-selected');
    
    // Show/hide relevant sections
    const textSection = document.getElementById('textEditSection');
    const imageSection = document.getElementById('imageEditSection');
    
    if (element.tagName === 'IMG') {
        textSection.style.display = 'none';
        imageSection.style.display = 'block';
        loadImageSettings(element);
    } else {
        textSection.style.display = 'block';
        imageSection.style.display = 'none';
        loadTextSettings(element);
    }
}

function loadTextSettings(element) {
    const computed = window.getComputedStyle(element);
    
    document.getElementById('textFontFamily').value = computed.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    document.getElementById('textFontSize').value = parseInt(computed.fontSize);
    document.getElementById('textColor').value = rgbToHex(computed.color);
    document.getElementById('textBgColor').value = rgbToHex(computed.backgroundColor);
    document.getElementById('textLineHeight').value = parseFloat(computed.lineHeight) / parseFloat(computed.fontSize) || 1.5;
    document.getElementById('textLetterSpacing').value = parseFloat(computed.letterSpacing) || 0;
    
    // Update button states
    updateButtonState('boldBtn', computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 700);
    updateButtonState('italicBtn', computed.fontStyle === 'italic');
    updateButtonState('underlineBtn', computed.textDecoration.includes('underline'));
}

function loadImageSettings(element) {
    const computed = window.getComputedStyle(element);
    
    // Store original data if not already stored
    if (!originalImageData[element.src]) {
        originalImageData[element.src] = {
            width: element.naturalWidth,
            height: element.naturalHeight,
            src: element.src
        };
    }
    
    originalAspectRatio = element.naturalWidth / element.naturalHeight;
    
    document.getElementById('imgWidth').value = parseInt(computed.width) || '';
    document.getElementById('imgHeight').value = parseInt(computed.height) || '';
    document.getElementById('imgBorderWidth').value = parseInt(computed.borderWidth) || 0;
    document.getElementById('imgBorderColor').value = rgbToHex(computed.borderColor);
    document.getElementById('imgBorderRadius').value = parseInt(computed.borderRadius) || 0;
    document.getElementById('imgOpacity').value = Math.round(parseFloat(computed.opacity) * 100);
    document.getElementById('imgOpacityValue').textContent = Math.round(parseFloat(computed.opacity) * 100) + '%';
    
    const transform = computed.transform;
    const rotation = transform !== 'none' ? getRotationFromMatrix(transform) : 0;
    document.getElementById('imgRotate').value = rotation;
}

function applyTextStyle() {
    if (!selectedElement || selectedElement.tagName === 'IMG') return;
    
    const fontFamily = document.getElementById('textFontFamily').value;
    const fontSize = document.getElementById('textFontSize').value;
    const color = document.getElementById('textColor').value;
    const bgColor = document.getElementById('textBgColor').value;
    const lineHeight = document.getElementById('textLineHeight').value;
    const letterSpacing = document.getElementById('textLetterSpacing').value;
    
    selectedElement.style.fontFamily = fontFamily;
    selectedElement.style.fontSize = fontSize + 'px';
    selectedElement.style.color = color;
    selectedElement.style.backgroundColor = bgColor;
    selectedElement.style.lineHeight = lineHeight;
    selectedElement.style.letterSpacing = letterSpacing + 'px';
}

function toggleStyle(property, activeValue, inactiveValue) {
    if (!selectedElement || selectedElement.tagName === 'IMG') return;
    
    const currentValue = selectedElement.style[property];
    selectedElement.style[property] = currentValue === activeValue ? inactiveValue : activeValue;
    
    // Update button state
    const btnId = property === 'fontWeight' ? 'boldBtn' : 
                   property === 'fontStyle' ? 'italicBtn' : 'underlineBtn';
    updateButtonState(btnId, selectedElement.style[property] === activeValue);
}

function applyAlignment(align) {
    if (!selectedElement || selectedElement.tagName === 'IMG') return;
    selectedElement.style.textAlign = align;
}

function applyImageStyle() {
    if (!selectedElement || selectedElement.tagName !== 'IMG') return;
    
    const width = document.getElementById('imgWidth').value;
    const height = document.getElementById('imgHeight').value;
    const borderWidth = document.getElementById('imgBorderWidth').value;
    const borderColor = document.getElementById('imgBorderColor').value;
    const borderRadius = document.getElementById('imgBorderRadius').value;
    const opacity = document.getElementById('imgOpacity').value;
    const rotate = document.getElementById('imgRotate').value;
    
    if (width) {
        selectedElement.style.width = width + 'px';
        if (isAspectLocked && originalAspectRatio) {
            const newHeight = width / originalAspectRatio;
            selectedElement.style.height = newHeight + 'px';
            document.getElementById('imgHeight').value = Math.round(newHeight);
        }
    }
    
    if (height && !isAspectLocked) {
        selectedElement.style.height = height + 'px';
    }
    
    if (borderWidth) {
        selectedElement.style.border = `${borderWidth}px solid ${borderColor}`;
    } else {
        selectedElement.style.border = 'none';
    }
    
    selectedElement.style.borderRadius = borderRadius + 'px';
    selectedElement.style.opacity = opacity / 100;
    selectedElement.style.transform = `rotate(${rotate}deg)`;
}

function toggleAspectLock() {
    isAspectLocked = !isAspectLocked;
    const btn = document.getElementById('lockAspectBtn');
    btn.classList.toggle('active');
    btn.innerHTML = isAspectLocked ? '<i class="fas fa-lock"></i> Locked' : '<i class="fas fa-lock-open"></i> Lock Aspect Ratio';
    
    if (isAspectLocked && selectedElement && selectedElement.tagName === 'IMG') {
        originalAspectRatio = selectedElement.naturalWidth / selectedElement.naturalHeight;
    }
}

// ============================================
// CROP FUNCTIONALITY
// ============================================
function openCropModal() {
    if (!selectedElement || selectedElement.tagName !== 'IMG') {
        showToast('Please select an image first', 'error');
        return;
    }
    
    const modal = document.getElementById('cropModal');
    const canvas = document.getElementById('cropCanvas');
    const ctx = canvas.getContext('2d');
    
    cropState.image = selectedElement;
    cropState.canvas = canvas;
    cropState.ctx = ctx;
    
    // Load image onto canvas
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
        // Set canvas size to match container
        const container = canvas.parentElement;
        const containerWidth = container.clientWidth - 40;
        const containerHeight = container.clientHeight;
        
        const scale = Math.min(containerWidth / img.width, containerHeight / img.height, 1);
        
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Initialize crop box to center
        cropState.cropBox = {
            x: canvas.width * 0.1,
            y: canvas.height * 0.1,
            width: canvas.width * 0.8,
            height: canvas.height * 0.8
        };
        
        drawCropBox();
        modal.style.display = 'flex';
    };
    
    img.src = selectedElement.src;
}

function closeCropModal() {
    document.getElementById('cropModal').style.display = 'none';
    cropState.active = false;
}

function initCropCanvas() {
    const overlay = document.getElementById('cropOverlay');
    const cropBox = document.getElementById('cropBox');
    
    if (!overlay || !cropBox) return;
    
    // Drag crop box
    cropBox.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('crop-handle')) {
            cropState.isResizing = true;
            cropState.resizeHandle = e.target.className.split(' ')[1];
        } else {
            cropState.isDragging = true;
        }
        cropState.startX = e.clientX;
        cropState.startY = e.clientY;
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!cropState.isDragging && !cropState.isResizing) return;
        
        const deltaX = e.clientX - cropState.startX;
        const deltaY = e.clientY - cropState.startY;
        
        if (cropState.isDragging) {
            cropState.cropBox.x += deltaX;
            cropState.cropBox.y += deltaY;
        } else if (cropState.isResizing) {
            resizeCropBox(deltaX, deltaY, cropState.resizeHandle);
        }
        
        cropState.startX = e.clientX;
        cropState.startY = e.clientY;
        
        drawCropBox();
    });
    
    document.addEventListener('mouseup', () => {
        cropState.isDragging = false;
        cropState.isResizing = false;
        cropState.resizeHandle = null;
    });
}

function resizeCropBox(deltaX, deltaY, handle) {
    const box = cropState.cropBox;
    
    switch(handle) {
        case 'nw':
            box.x += deltaX;
            box.y += deltaY;
            box.width -= deltaX;
            box.height -= deltaY;
            break;
        case 'ne':
            box.y += deltaY;
            box.width += deltaX;
            box.height -= deltaY;
            break;
        case 'sw':
            box.x += deltaX;
            box.width -= deltaX;
            box.height += deltaY;
            break;
        case 'se':
            box.width += deltaX;
            box.height += deltaY;
            break;
    }
    
    // Ensure minimum size
    box.width = Math.max(50, box.width);
    box.height = Math.max(50, box.height);
}

function drawCropBox() {
    const cropBox = document.getElementById('cropBox');
    const canvas = cropState.canvas;
    
    if (!cropBox || !canvas) return;
    
    const box = cropState.cropBox;
    
    // Constrain to canvas bounds
    box.x = Math.max(0, Math.min(box.x, canvas.width - box.width));
    box.y = Math.max(0, Math.min(box.y, canvas.height - box.height));
    
    cropBox.style.left = box.x + 'px';
    cropBox.style.top = box.y + 'px';
    cropBox.style.width = box.width + 'px';
    cropBox.style.height = box.height + 'px';
}

function applyCrop() {
    if (!cropState.image || !cropState.canvas) {
        showToast('No image selected for cropping', 'error');
        return;
    }
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const box = cropState.cropBox;
    
    // Set canvas to crop size
    canvas.width = box.width;
    canvas.height = box.height;
    
    // Draw cropped portion
    ctx.drawImage(
        cropState.canvas,
        box.x, box.y, box.width, box.height,
        0, 0, box.width, box.height
    );
    
    // Update image source
    cropState.image.src = canvas.toDataURL();
    
    // Update dimensions
    cropState.image.style.width = box.width + 'px';
    cropState.image.style.height = box.height + 'px';
    
    showToast('Image cropped successfully', 'success');
    closeCropModal();
}

function resetImage() {
    if (!selectedElement || selectedElement.tagName !== 'IMG') return;
    
    const original = originalImageData[selectedElement.src];
    if (original) {
        selectedElement.style.width = '';
        selectedElement.style.height = '';
        selectedElement.style.border = 'none';
        selectedElement.style.borderRadius = '0px';
        selectedElement.style.opacity = '1';
        selectedElement.style.transform = 'rotate(0deg)';
        
        loadImageSettings(selectedElement);
        showToast('Image reset to original', 'success');
    }
}

function applyChanges() {
    if (selectedElement) {
        // --- START FIX ---
        // Save the live DOM changes back to the documentData object
        try {
            const headerEl = document.getElementById('previewHeader');
            const bodyEl = document.getElementById('previewBody');
            const footerEl = document.getElementById('previewFooter');

            // Read the current HTML (with inline styles) from the preview
            if (headerEl) documentData.header = headerEl.innerHTML;
            if (bodyEl) documentData.body = bodyEl.innerHTML;
            if (footerEl) documentData.footer = footerEl.innerHTML;
            
            console.log("Live edits saved to documentData.");
        } catch (error) {
            console.error("Error saving live edits:", error);
            showToast('Error saving changes', 'error');
        }
        // --- END FIX ---
        
        selectedElement.classList.remove('element-selected');
        selectedElement = null;
        document.getElementById('editingToolbar').style.display = 'none';
        showToast('Changes applied successfully', 'success');
    }
}

function cancelEdit() {
    if (selectedElement) {
        selectedElement.classList.remove('element-selected');
        selectedElement = null;
    }
    document.getElementById('editingToolbar').style.display = 'none';
}

function updateButtonState(btnId, isActive) {
    const btn = document.getElementById(btnId);
    if (btn) {
        if (isActive) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
}

function rgbToHex(rgb) {
    if (rgb.startsWith('#')) return rgb;
    
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#000000';
    
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function getRotationFromMatrix(matrix) {
    const values = matrix.match(/matrix\(([^)]+)\)/);
    if (!values) return 0;
    
    const parts = values[1].split(',');
    const a = parseFloat(parts[0]);
    const b = parseFloat(parts[1]);
    
    return Math.round(Math.atan2(b, a) * (180 / Math.PI));
}

// Initialize toolbar when switching to preview tab
const previewTab = document.querySelector('[data-tab="preview"]');
if (previewTab) {
    previewTab.addEventListener('click', () => {
        setTimeout(() => {
            initEditingToolbar();
            // Make elements hoverable
            const preview = document.getElementById('documentPreview');
            if (preview) {
                const elements = preview.querySelectorAll('p, h1, h2, h3, li, td, th, span, div:not(.preview-section):not(#documentPreview), img');
                elements.forEach(el => {
                    if (el.id !== 'documentPreview' && !el.classList.contains('preview-section') && !el.classList.contains('logo-container')) {
                        el.classList.add('element-editable');
                    }
                });
            }
        }, 100);
    });
}