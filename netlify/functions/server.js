/**
 * MULTI-AI BACKEND - FINAL VERSION (v5)
 *
 * *** FIX (v5): Corrected typo '4G' to '400'. ***
 */

const serverless = require('serverless-http'); // <-- ADD THIS
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*', methods: ['POST', 'GET'], credentials: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// Multi-AI Configuration
// ============================================
const AI_PROVIDERS = {
    gemini: {
        name: 'Gemini 2.5 Pro', apiKey: process.env.GEMINI_API_KEY,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
        enabled: !!process.env.GEMINI_API_KEY, maxTokens: 16000
    },
    huggingface: {
        name: 'Hugging Face (Router)', 
        apiKey: process.env.HUGGING_FACE_API_KEY,
        endpoint: 'https://router.huggingface.co/v1/chat/completions',
        model: 'mistralai/Mistral-7B-Instruct-v0.1', // <-- FIX: Changed to v0.1
        enabled: !!process.env.HUGGING_FACE_API_KEY, 
        maxTokens: 4096
    },
    openrouter: {
        name: 'OpenRouter', 
        apiKey: process.env.OPENROUTER_API_KEY,
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        // vvv FIX: Switched to a less congested free model vvv
        model: 'google/gemma-7b-it:free', 
        enabled: !!process.env.OPENROUTER_API_KEY, 
        maxTokens: 4096
    }
};

// ============================================
// AI CALL HANDLERS
// ============================================
async function callGemini(prompt, maxTokens, temperature) {
    const config = AI_PROVIDERS.gemini;
    if (!config.enabled) throw new Error("Gemini provider is not configured (API key missing).");
    const effectiveMaxTokens = Math.min(maxTokens || config.maxTokens, config.maxTokens);
    console.log(`Calling Gemini with maxOutputTokens: ${effectiveMaxTokens}`);
    try {
        const response = await fetch(`${config.endpoint}?key=${config.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: temperature, maxOutputTokens: effectiveMaxTokens, topP: 0.95, topK: 40 },
                safetySettings: [ { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }, { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }, { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" }, { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" } ]
            })
        });
        const responseBody = await response.text();
        if (!response.ok) { let errorMsg = `Gemini API error (${response.status})`; try { errorMsg = JSON.parse(responseBody).error?.message || errorMsg; } catch (e) {} throw new Error(errorMsg); }
        const data = JSON.parse(responseBody);
        if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') { throw new Error('AI stopped generating (MAX_TOKENS).'); }
        if (data.promptFeedback?.blockReason) { throw new Error(`AI blocked request: ${data.promptFeedback.blockReason}`); }
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) { return data.candidates[0].content.parts[0].text; }
        console.error("Invalid Gemini Response Format:", data); throw new Error('Invalid Gemini response format.');
    } catch (error) { console.error("Error during Gemini call:", error); throw error; }
}

async function callHuggingFace(prompt, maxTokens, temperature) {
     const config = AI_PROVIDERS.huggingface;
     if (!config.enabled) throw new Error("Hugging Face provider is not configured.");
     const effectiveMaxTokens = Math.min(maxTokens || config.maxTokens, config.maxTokens);
     console.log(`Calling Hugging Face Router with model: ${config.model}, max_tokens: ${effectiveMaxTokens}`);
     try {
         const response = await fetch(config.endpoint, {
             method: 'POST', headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 model: config.model, messages: [{ role: 'user', content: prompt }],
                 max_tokens: effectiveMaxTokens, temperature: Math.max(0.1, temperature)
             })
         });
         const responseBody = await response.text();
         if (!response.ok) {
             console.error("HF Router API Error:", response.status, responseBody);
             let errorMsg = `Hugging Face Router error (${response.status})`;
             try { errorMsg = JSON.parse(responseBody).error?.message || errorMsg; } catch(e){}
             throw new Error(errorMsg);
         }
         const data = JSON.parse(responseBody);
         if (data.choices?.[0]?.finish_reason === 'length') { throw new Error('AI stopped generating (length limit).'); }
         if (data.choices?.[0]?.message?.content) { return data.choices[0].message.content; }
         throw new Error('Invalid Hugging Face Router response format.');
     } catch (error) { console.error("Error during Hugging Face call:", error); throw error; }
}

async function callOpenRouter(prompt, maxTokens, temperature) {
    const config = AI_PROVIDERS.openrouter;
    if (!config.enabled) throw new Error("OpenRouter provider is not configured.");
    const effectiveMaxTokens = Math.min(maxTokens || config.maxTokens, config.maxTokens);
    console.log(`Calling OpenRouter with max_tokens: ${effectiveMaxTokens}`);
    try {
        const response = await fetch(config.endpoint, { method: 'POST', headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5500', 'X-Title': 'AI Document Formatter Pro' }, body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], max_tokens: effectiveMaxTokens, temperature: temperature }) });
        const responseBody = await response.text();
        if (!response.ok) { let errorMsg = `OpenRouter API error (${response.status})`; try { errorMsg = JSON.parse(responseBody).error?.message || errorMsg; } catch(e){} throw new Error(errorMsg); }
        const data = JSON.parse(responseBody);
        if (data.choices?.[0]?.finish_reason === 'length') { throw new Error('AI stopped generating (length limit).'); }
        if (data.choices?.[0]?.message?.content) { return data.choices[0].message.content; }
        throw new Error('Invalid OpenRouter response format.');
     } catch (error) { console.error("Error during OpenRouter call:", error); throw error; }
}

// ============================================
// MAIN AI ROUTER
// ============================================
async function callAI(provider, prompt, maxTokens, temperature) {
    const lowerProvider = provider.toLowerCase();
    console.log(`🤖 Routing to ${lowerProvider}...`);
    const providerConfig = AI_PROVIDERS[lowerProvider];
    if (!providerConfig) { throw new Error(`Unknown AI provider specified: ${provider}`); }
    if (!providerConfig.enabled) { throw new Error(`${providerConfig.name} provider is not configured.`); }
    const providerMaxTokens = providerConfig.maxTokens || 8192;
    const effectiveMaxTokens = Math.min(maxTokens || providerMaxTokens, providerMaxTokens);
    console.log(`Max tokens requested for ${lowerProvider}: ${effectiveMaxTokens}`);
    switch (lowerProvider) {
        case 'gemini':        return await callGemini(prompt, effectiveMaxTokens, temperature);
        case 'huggingface':   return await callHuggingFace(prompt, effectiveMaxTokens, temperature);
        case 'openrouter':    return await callOpenRouter(prompt, effectiveMaxTokens, temperature);
        default:              throw new Error(`AI provider function not implemented: ${provider}`);
    }
}

// ============================================
// JSON Extraction Helper
// ============================================
function extractJsonFromBody(body) {
    if (!body || typeof body !== 'string') return null;
    let text = body.trim();
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        try { JSON.parse(codeBlockMatch[1].trim()); console.log("Extracted JSON from markdown."); return codeBlockMatch[1].trim(); }
        catch (e) { console.warn("Markdown block found but invalid JSON:", e.message); text = text.replace(/```json\s*[\s\S]*?\s*```/, ''); }
    }
    const firstBrace = text.indexOf('{'); const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) { console.warn("No valid { ... } found."); return null; }
    const potentialJson = text.substring(firstBrace, lastBrace + 1);
    try { JSON.parse(potentialJson); console.log("Extracted JSON using first/last braces."); return potentialJson; }
    catch (e) { console.error("Failed to parse extracted JSON:", e.message); console.error("Extracted snippet:", potentialJson.substring(0, 300) + "..."); return null; }
}

// ============================================
// DOCUMENT TYPE DETECTOR (Stricter)
// ============================================
function detectDocumentType(text, fileExtension = '') {
    if (!text) return 'document';
    const lowerText = text.toLowerCase();
    const normalizedText = lowerText.replace(/\s+/g, ' ');
    const lowerExt = fileExtension.toLowerCase();

    if (lowerExt === 'xlsx' || lowerExt === 'xls' || lowerExt === 'csv') {
        console.log(`Detector: Forced spreadsheet (ext: ${fileExtension})`);
        return 'spreadsheet';
    }
    if (/row \d+:/i.test(normalizedText.substring(0, 1000))) {
        console.log("Detector: Detected spreadsheet (content)");
        return 'spreadsheet';
    }
    
    const resumeKeywords = [
        'resume', 'curriculum vitae', 'cv', 
        'professional experience', 'work experience', 'employment history',
        'education background', 'academic background',
        'skills and abilities', 'technical skills', 'core competencies',
        'career objective', 'professional summary', 'career summary',
        'work history', 'professional profile'
    ];
    const resumeIndicators = [
        /\b(bachelor|master|phd|degree|university|college)\b/i,
        /\b(employed|worked at|position|job title)\b/i,
        /\b(skills:|expertise:|proficient in)\b/i,
        /\b(references|portfolio|linkedin)\b/i
    ];
    const resumeScore = resumeKeywords.filter(kw => normalizedText.includes(kw)).length;
    const hasResumeIndicators = resumeIndicators.some(pattern => pattern.test(normalizedText));
    if ((resumeScore >= 2 && hasResumeIndicators) || resumeScore >= 4) {
        console.log(`Detector: Detected RESUME (Score: ${resumeScore}, Indicators: ${hasResumeIndicators})`);
        return 'resume';
    }
    
    const letterKeywords = [
        'dear sir', 'dear madam', 'dear mr', 'dear mrs', 'dear ms',
        'to whom it may concern', 'respected sir', 'respected madam',
        'sincerely yours', 'yours sincerely', 'best regards', 'kind regards',
        'yours faithfully', 'warm regards', 'yours truly'
    ];
    const letterScore = letterKeywords.filter(kw => normalizedText.includes(kw)).length;
    const hasLetterStructure = /dear\s+(sir|madam|mr|mrs|ms)/i.test(normalizedText);
    if (letterScore >= 2 || hasLetterStructure) {
        console.log(`Detector: Detected LETTER (Score: ${letterScore})`);
        return 'letter';
    }
    
    const reportKeywords = [
        'executive summary', 'table of contents', 'introduction',
        'methodology', 'findings', 'analysis', 'recommendations',
        'conclusion', 'abstract', 'literature review'
    ];
    const reportScore = reportKeywords.filter(kw => normalizedText.includes(kw)).length;
    const hasReportStructure = /\b(chapter|section|appendix)\s+\d+/i.test(normalizedText);
    if (reportScore >= 3 || (reportScore >= 2 && hasReportStructure)) {
        console.log(`Detector: Detected REPORT (Score: ${reportScore})`);
        return 'report';
    }

    if (normalizedText.includes("invoice")) {
        console.log("Detector: Detected INVOICE (placeholder found).");
        return 'invoice';
    }
    if (normalizedText.includes("item: ") && 
        normalizedText.includes("quantity: ") && 
        normalizedText.includes("amount: ")) {
        console.log("Detector: Detected CLEANED invoice pattern.");
        return 'invoice';
    }
    const invoiceKeywords = [
        'invoice number', 'invoice no', 'invoice #', 'invoice date',
        'bill to', 'ship to', 'sold to', 'customer details',
        'subtotal', 'grand total', 'total amount', 'amount due', 'total due',
        'payment terms', 'due date', 'payment method',
        'tax amount', 'vat', 'gst', 'gstin', 'tax id',
        'account number', 'bank details', 'ifsc code'
    ];
    const itemTableKeywords = [
        'item description', 'product name', 'service description',
        'quantity', 'qty', 'unit price', 'rate', 'price', 'amount'
    ];
    const invoiceScore = invoiceKeywords.filter(kw => normalizedText.includes(kw)).length;
    const hasItemTable = itemTableKeywords.filter(kw => normalizedText.includes(kw)).length >= 3;
    const hasCurrency = /[₹$€£¥]/.test(text) || /\b(inr|usd|eur|gbp)\b/i.test(normalizedText);
    if (invoiceScore >= 4 && hasItemTable && hasCurrency) {
        console.log(`Detector: Detected INVOICE (Score: ${invoiceScore}, Items: ${hasItemTable}, Currency: ${hasCurrency})`);
        return 'invoice';
    }
    if (invoiceScore >= 2) {
        if (resumeScore >= 1 || /\b(resume|cv|experience|education)\b/i.test(normalizedText)) {
            console.log("Detector: Invoice terms found but context suggests RESUME");
            return 'resume';
        }
        if (reportScore >= 1) {
            console.log("Detector: Invoice terms found but context suggests REPORT");
            return 'report';
        }
    }

    console.log("Detector: Defaulting to 'document'.");
    return 'document';
}

// ============================================
// INTELLIGENT PROMPT BUILDER
// ============================================
// REPLACE your entire 'buildIntelligentPrompt' function with this:

function buildIntelligentPrompt(content, fileType, documentType) {
    const contentLimit = 80000;
    const jsonInstructionStart =
      "CRITICAL: Your entire output MUST be ONLY the single, valid, compact JSON object specified below. NO extra text, NO markdown, NO explanations. Start IMMEDIATELY with '{' and end IMMEDIATELY with '}'.";
    const jsonInstructionEnd =
      "CRITICAL REMINDER: Output ONLY the JSON object. NO extra text.";
  
    // ============================================
    // INVOICE PROMPT (v11 - ₹ Fixed with HTML entity)
    // ============================================
    if (documentType === "invoice") {
      console.log("Building INVOICE prompt (v11 - Rupee entity added)");
  
      return `${jsonInstructionStart}
  You are an expert invoice formatter. Your task is to structure the garbled OCR text into a clean, consistent HTML invoice with currency symbols (₹) where appropriate.
  
  CRITICAL RULES:
  1. IGNORE JUNK: Ignore junk metadata such as "about:blank", "--- PAGE x ---", timestamps, or empty lines.
  2. USE PROVIDED JSON STRUCTURE: Use exactly {"documentType":"invoice","confidence":0.95,"sections":{"header":"...","body":"...","footer":"..."},"metadata":{"title":"Invoice"}}.
  3. CLEAN TEXT: Remove broken characters, stray quotes, and extra commas.
  4. NEVER CHANGE OR REPLACE % (PERCENTAGE SYMBOL).
  5. SHOW ₹: All prices, rates, and totals must include the currency entity &#8377; (Rupee symbol).
  6. PRESERVE LISTS: Format item lists (like 'STARTER : Kung Pao Chicken') as <p> tags with <strong> for the key. DO NOT delete them.
  
  STRUCTURE:
  
  1. HEADER Section:
     - Top: [LOGO]
     - Show "Invoice", Invoice Number, Invoice Date
     - Use side-by-side boxes for "Billed By" and "Billed To":
  <div style="display: flex; justify-content: space-between; gap: 20px; margin-top: 20px; border-top: 2px solid #eee; padding-top: 20px;">
    <div style="flex: 1; min-width: 45%; border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: #fafafa;">
      <h4 style="margin: 0 0 10px 0; color: #555; font-size: 14px; text-transform: uppercase;">Billed By:</h4>
      <p style="font-size: 15px; margin: 4px 0;">CURRY N GRILL</p>
      <p style="font-size: 15px; margin: 4px 0;">Ganga Apt., Daman - Kunta Rd, SC-1, Katheria, Daman, Nani Daman, India</p>
      <p style="font-size: 15px; margin: 4px 0;">GSTIN: 26BYIPC5761P1ZW</p>
      <p style="font-size: 15px; margin: 4px 0;">PAN: BYIPC5761P</p>
    </div>
    <div style="flex: 1; min-width: 45%; border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: #fafafa;">
      <h4 style="margin: 0 0 10px 0; color: #555; font-size: 14px; text-transform: uppercase;">Billed To:</h4>
      <p style="font-size: 15px; margin: 4px 0;">Oliver</p>
      <p style="font-size: 15px; margin: 4px 0;">Phone: +91 8511991161</p>
    </div>
  </div>
  
  2. BODY Section:
     - Create a clean HTML table for line items:
  <table border="1" style="width:100%; border-collapse: collapse; text-align:left;">
    <thead style="background:#f0f0f0;">
      <tr>
        <th style="padding:8px;">Item</th>
        <th style="padding:8px;">Quantity</th>
        <th style="padding:8px;">Rate (₹) (&#8377;)</th>
        <th style="padding:8px;">Amount (₹) (&#8377;)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:8px;">Paneer Butter Masala</td>
        <td style="padding:8px;">2</td>
        <td style="padding:8px;">&#8377;₹350.00</td>
        <td style="padding:8px;">&#8377;₹700.00</td>
      </tr>
      <tr>
        <td style="padding:8px;">Butter Naan</td>
        <td style="padding:8px;">4</td>
        <td style="padding:8px;">&#8377;₹60.00</td>
        <td style="padding:8px;">&#8377;₹240.00</td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:10px; text-align:right;">
    <p>Subtotal: &#8377;₹940.00</p>
    <p>GST (5%): &#8377;₹47.00</p>
    <p><strong>Total: &#8377;₹987.00</strong></p>
  </div>
  
  3. FOOTER Section:
  <div style="margin-top:20px;">
    <p><strong>Total (in words): Nine Hundred Eighty-Seven Rupees Only</strong></p>
    <p>Advance Paid: &#8377;₹500.00</p>
    <p>Balance Due: &#8377;₹487.00</p>
    <h3>Bank Details</h3>
    <p>Bank: State Bank of India</p>
    <p>Account No: XXXX1234</p>
    <p>IFSC: SBIN0000456</p>
    <div>[QR CODE]</div>
  </div>
  
  INPUT TEXT:
  ${content.substring(0, contentLimit)}
  
  REQUIRED JSON OUTPUT (Strict HTML format):
  {"documentType":"invoice","confidence":0.95,"sections":{"header":"<div>[LOGO]<h2>Invoice</h2><p>Invoice No #123</p><div style='display:flex;...'>...</div></div>","body":"<div><table border='1' style='width:100%'><tr><th>Item</th><th>Qty</th><th>Rate (&#8377;)</th><th>Amount (&#8377;)</th></tr><tr><td>Item 1</td><td>2</td><td>&#8377;350.00</td><td>&#8377;700.00</td></tr></table><div style='text-align:right;'><p>Total: &#8377;987.00</p></div></div>","footer":"<div><p>Total (in words): Nine Hundred Eighty-Seven Rupees Only</p><p>Advance Paid: &#8377;500.00</p><p>Balance Due: &#8377;487.00</p><h3>Bank Details</h3><p>...</p>[QR CODE]</div>"},"metadata":{"title":"Invoice"}}
  ${jsonInstructionEnd}`;
    }  

    // ============================================
    // OTHER DOCUMENT PROMPTS
    // ============================================

    if (documentType === 'resume') {
        console.log('Building RESUME prompt');
        return `${jsonInstructionStart}
You are an expert resume formatter. Structure the provided resume text into logical HTML sections.
**RULES:**
1.  **USE PROVIDED STRUCTURE:** You MUST use \`{"documentType":"resume", "confidence":0.95, "sections":{"header":"...", "body":"...", "footer":"..."}, "metadata":{"title":"Resume - [Name]"}}\`.
2.  **STRUCTURE Sections (HTML MANDATORY):**
    * \`header\`: Contact info (Name, Phone, Email, LinkedIn, Address) in a clean \`<div>\` with \`<h1>\` and \`<p>\` tags.
    * \`body\`: Create distinct sections using \`<h2>\` for headings ("Professional Summary", "Experience", etc.). Use \`<ul>\` and \`<li>\` for bullet points.
    * \`footer\`: References or additional info (can be empty).
    * **DO NOT use newline characters (\`\n\`)**.
**INPUT RESUME TEXT:**
\`\`\`
${content.substring(0, contentLimit)}
\`\`\`
**REQUIRED JSON OUTPUT FORMAT:**
{"documentType":"resume","confidence":0.95,"sections":{"header":"<div><h1>John Doe</h1><p>john.doe@email.com | (555) 123-4567 | LinkedIn</p></div>","body":"<div><h2>Professional Summary</h2><p>...</p><h2>Experience</h2><h3>Job Title at Company</h3><p>Date - Date</p><ul><li>Achievement</li></ul></div>","footer":"<div></div>"},"metadata":{"title":"Resume - John Doe"}}
${jsonInstructionEnd}
`;
    }

    if (documentType === 'letter') {
        console.log('Building LETTER prompt');
        return `${jsonInstructionStart}
You are an expert letter formatter. Structure the letter with proper formatting.
**RULES:**
1.  **USE PROVIDED STRUCTURE:** \`{"documentType":"letter", "confidence":0.90, "sections":{"header":"...", "body":"...", "footer":"..."}, "metadata":{"title":"Letter"}}\`.
2.  **STRUCTURE Sections:**
    * \`header\`: Sender address, date, recipient address.
    * \`body\`: Salutation, letter content in paragraphs, closing.
    * \`footer\`: Signature block.
3.  **PRESERVE ALL TEXT:** Keep the entire letter content.
**INPUT LETTER TEXT:**
\`\`\`
${content.substring(0, contentLimit)}
\`\`\`
**REQUIRED JSON OUTPUT FORMAT:**
{"documentType":"letter","confidence":0.90,"sections":{"header":"<div><p>Sender Address<br>Date</p><p>Recipient Address</p></div>","body":"<div><p>Dear Sir/Madam,</p><p>Letter content...</p><p>Sincerely,</p></div>","footer":"<div><p>Signature<br>Name</p></div>"},"metadata":{"title":"Letter"}}
${jsonInstructionEnd}
`;
    }

    if (documentType === 'report') {
        console.log('Building REPORT prompt');
        return `${jsonInstructionStart}
You are an expert report formatter. Structure the report with clear sections.
**RULES:**
1.  **USE PROVIDED STRUCTURE:** \`{"documentType":"report", "confidence":0.90, "sections":{"header":"...", "body":"...", "footer":"..."}, "metadata":{"title":"Report Title"}}\`.
2.  **STRUCTURE Sections:**
    * \`header\`: Report title, author, date.
    * \`body\`: Use \`<h2>\` for main sections, \`<h3>\` for subsections. Include executive summary, findings, analysis, etc.
    * \`footer\`: References, appendices.
3.  **PRESERVE ALL CONTENT:** Keep all data, tables, and analysis intact.
**INPUT REPORT TEXT:**
\`\`\`
${content.substring(0, contentLimit)}
\`\`\`
**REQUIRED JSON OUTPUT FORMAT:**
{"documentType":"report","confidence":0.90,"sections":{"header":"<div><h1>Report Title</h1><p>Author | Date</p></div>","body":"<div><h2>Executive Summary</h2><p>...</p><h2>Findings</h2><p>...</p></div>","footer":"<div><h3>References</h3><p>...</p></div>"},"metadata":{"title":"Business Report"}}
${jsonInstructionEnd}
`;
    }

    if (documentType === 'spreadsheet') {
        console.warn('SERVER WARNING: Building SPREADSHEET prompt.');
        return `${jsonInstructionStart}
        {"documentType":"spreadsheet","confidence":0.99,"sections":{"header":"<h2>Spreadsheet</h2>","body":"<p>Spreadsheets are handled client-side</p>","footer":""},"metadata":{"title":"Spreadsheet"}}
        ${jsonInstructionEnd}`;
    }

    // Generic Document Prompt
    console.log('Building GENERIC document prompt');
    return `${jsonInstructionStart}
You are an expert document formatter. Format the text into clean, structured HTML.
**RULES:**
1.  **USE PROVIDED STRUCTURE:** \`{"documentType":"document", "confidence":0.85, "sections":{"header":"...", "body":"...", "footer":"..."}, "metadata":{"title":"Document"}}\`.
2.  **PRESERVE ALL CONTENT:** Keep all text, numbers, and structure.
3.  **ADD STRUCTURE:** Use headings (\`<h2>\`, \`<h3>\`), paragraphs (\`<p>\`), and lists where appropriate.
**Content to Format:**
\`\`\`
${content.substring(0, contentLimit)}
\`\`\`
**REQUIRED JSON OUTPUT FORMAT (Strict):**
{"documentType":"document","confidence":0.85,"sections":{"header":"<div><h2>Document Title</h2></div>","body":"<div><p>Content...</p></div>","footer":"<div></div>"},"metadata":{"title":"Formatted Document"}}
${jsonInstructionEnd}
`;
}






// ============================================
// ENDPOINTS
// ============================================
app.get('/api/health', (req, res) => {
    console.log("SERVER LOG: GET /api/health reached.");
    const enabledProviders = Object.entries(AI_PROVIDERS).filter(([_,c])=>c.enabled).map(([k,c])=>({id:k, name: c.name}));
    res.status(200).json({ status: 'ok', message: 'Multi-AI Backend Running', providers: enabledProviders, defaultProvider: 'gemini'});
});

// Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
    console.log("SERVER LOG: POST /api/admin/login reached.");
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (!password) {
        return res.status(400).json({ success: false, error: 'Password is required' });
    }
    
    if (password === adminPassword) {
        console.log("✅ Admin login successful");
        res.status(200).json({ success: true, message: 'Admin authenticated' });
    } else {
        console.log("❌ Admin login failed - invalid password");
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

app.post('/api/format', async (req, res) => {
    try {
        let { prompt: textFromClient, maxTokens, temperature, provider, fileType } = req.body;
        if (!textFromClient) { return res.status(400).json({ success: false, error: 'Content is required' }); }
        textFromClient = String(textFromClient).trim();
        if (textFromClient.length === 0) { return res.status(400).json({ success: false, error: 'Content cannot be empty' }); }

        const selectedProvider = provider || 'gemini';
        const providerConfig = AI_PROVIDERS[selectedProvider.toLowerCase()];
        if (!providerConfig?.enabled) { return res.status(400).json({ success: false, error: `${selectedProvider} is not configured.` }); }

        const providerMaxTokens = providerConfig.maxTokens;
        const requestedTokens = parseInt(maxTokens) || providerMaxTokens;
        const tokens = Math.min(requestedTokens, providerMaxTokens);
        const temp = parseFloat(temperature) || 0.3;

        const documentType = detectDocumentType(textFromClient, fileType || '');
        console.log(`📄 Processing content. Detected as: ${documentType}`);

        if (documentType === 'spreadsheet') {
            console.warn("Server received spreadsheet format request. Client should handle.");
            // *** THIS IS THE FIX ***
            return res.status(400).json({ success: false, error: "Spreadsheets formatted client-side." });
        }
        
        const intelligentPrompt = buildIntelligentPrompt(textFromClient, fileType || 'unknown', documentType);

        const rawAiResult = await callAI(selectedProvider, intelligentPrompt, tokens, temp);
        console.log(`✅ AI structuring successful with ${selectedProvider}.`);

        const extractedJsonString = extractJsonFromBody(rawAiResult);
        if (!extractedJsonString) {
            console.error(`❌ AI (${selectedProvider}) returned non-JSON/unparseable:`, rawAiResult.substring(0, 500) + "...");
            throw new Error(`AI (${selectedProvider}) returned unexpected format (JSON extraction failed).`);
        }

        console.log(`✅ Successfully extracted final JSON.`);
        res.json({
            success: true,
            text: extractedJsonString,
            provider: providerConfig.name,
            documentType: documentType
        });

    } catch (error) {
        console.error('❌ Formatting error in /api/format:', error.message);
        if (error.stack) { console.error("Stack:", error.stack); }
        let statusCode = 500; let clientErrorMessage = `Processing failed: ${error.message}`;
        if (error.message.includes("token limit") || error.message.includes("MAX_TOKENS")) clientErrorMessage = 'Processing failed: Document might be too large/complex for AI.';
        else if (error.message.includes("blocked")) clientErrorMessage = 'Processing failed: Content blocked by AI safety filter.';
        else if (error.message.includes("JSON") || error.message.includes("format")) clientErrorMessage = 'Processing failed: AI returned an unexpected format.';
        else if (error.message.includes("configured") || error.message.includes("API key")) clientErrorMessage = 'Processing failed: AI provider not configured on server.';
        else if (error.message.includes("fetch") || error.message.includes("connect")) clientErrorMessage = 'Processing failed: Could not connect to AI service.';
        res.status(statusCode).json({ success: false, error: clientErrorMessage });
    }
});

// *** UPDATED PDF ENDPOINT ***
app.post('/api/generate-pdf', async (req, res) => {
    try {
        const { htmlContent } = req.body;
        if (!htmlContent || htmlContent.trim() === '') {
            return res.status(400).json({ success: false, error: 'No HTML content provided.' });
        }

        console.log("📄 Generating PDF...");

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000);
        await page.setContent(htmlContent, { waitUntil: 'load', timeout: 60000 });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
        });
        await browser.close();
        console.log(`✅ PDF size: ${pdfBuffer.length} bytes`);

        // ✅ Correct response headers
        res.status(200)
            .set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="document.pdf"',
                'Content-Length': pdfBuffer.length
            })
            .send(pdfBuffer);

    } catch (error) {
        console.error('❌ PDF Generation Error:', error);
        res.status(500).json({ success: false, error: 'PDF generation failed: ' + error.message });
    }
});




app.post('/api/generate-pdf-alt', async (req, res) => {
    try {
        const { htmlContent } = req.body;
        if (!htmlContent || htmlContent.trim() === '') {
            return res.status(400).json({ success: false, error: 'No HTML content provided.' });
        }

        console.log("📄 Generating PDF (ALT METHOD)..."); // New log

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000);
        
        // --- THIS IS THE TEST ---
        // We are trying 'domcontentloaded' instead of 'load'
        // --- NEW METHOD: Use data: URI ---
        const encodedHtml = encodeURIComponent(htmlContent);
        await page.goto(`data:text/html;charset=UTF-8,${encodedHtml}`, {
            waitUntil: 'domcontentloaded', // Continue testing domcontentloaded
            timeout: 60000 
        });
        // --- END NEW METHOD ---
        // --- END TEST ---

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
        });
        await browser.close();
        console.log(`✅ (ALT) PDF size: ${pdfBuffer.length} bytes`); // New log

        res.status(200)
            .set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="document-alt.pdf"', // New name
                'Content-Length': pdfBuffer.length
            })
            .send(pdfBuffer);

    } catch (error) {
        console.error('❌ (ALT) PDF Generation Error:', error); // New log
        res.status(500).json({ success: false, error: '(ALT) PDF generation failed: ' + error.message });
    }
});

// *** END UPDATED ENDPOINT ***


// Test Endpoint
app.post('/api/test', async (req, res) => {
     try {
        const { provider } = req.body; const testProvider = provider || 'gemini';
        const providerConfig = AI_PROVIDERS[testProvider.toLowerCase()];
        if (!providerConfig?.enabled) { return res.json({ success: false, message: `${testProvider} not configured` }); }
        console.log(`Testing AI provider: ${testProvider}`);
        const testPrompt = 'Respond ONLY with this valid JSON: {"status":"working","message":"API functional"}';
        const result = await callAI(testProvider, testPrompt, 100, 0.1);
        const extractedJson = extractJsonFromBody(result);
        let isValidJson = false; let statusMessage = "non-JSON or invalid JSON";
        if(extractedJson) {
            try { const parsed = JSON.parse(extractedJson); if(parsed.status === 'working') { isValidJson = true; statusMessage = "working and returned valid JSON"; } else { statusMessage = "returned JSON, but structure mismatch"; }
            } catch(e) {}
        }
        console.log(`Test result for ${testProvider}: ${statusMessage}`);
        res.json({ success: isValidJson, message: `${providerConfig.name} is ${statusMessage}`, response: result });
    } catch (error) { console.error(`❌ Error testing ${req.body.provider || 'default'} AI:`, error.message); res.status(500).json({ success: false, message: `Error testing AI: ${error.message}` }); }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Unexpected Server Error Middleware:', err.stack);
    res.status(500).json({ success: false, error: 'An unexpected internal server error occurred.' });
});

// Start server
module.exports.handler = serverless(app);
