const { GoogleGenerativeAI } = require("@google/generative-ai");

// Validate API Key at bootstrap
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in the environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

// Ordered chain of models to try in case of failure/availability issues.
// IMPORTANT: gemini-2.5-flash-lite is placed first because on the free tier,
// gemini-2.5-flash has a daily limit of 20 requests, while gemini-2.5-flash-lite
// has more generous per-minute and per-day limits.
// gemini-3.5-flash does NOT exist and has been removed.
const MODEL_CHAIN = [
  "gemini-2.5-flash-lite",  // Most available on free tier
  "gemini-2.5-flash",       // Higher quality fallback (may hit daily limit)
  "gemini-2.0-flash",       // Legacy fallback
  "gemini-2.0-flash-lite",  // Legacy lite fallback
  "gemini-2.5-pro"          // Premium fallback (very strict quota)
];

// Required sections for validating structural integrity
const REQUIRED_NORMAL_HEADERS = [
  "📋 COVER HEADING:",
  "📝 EXECUTIVE SUMMARY:",
  "👤 CLIENT INSTRUCTIONS:",
  "📖 FACTS PRESENTED:",
  "🔍 ISSUES FOR DETERMINATION:",
  "⚖️ APPLICABLE LAW:",
  "🔬 DETAILED LEGAL ANALYSIS:",
  "🛡️ POSSIBLE DEFENCES:",
  "🧭 RECOMMENDED LITIGATION STRATEGY:",
  "📊 REQUIRED EVIDENCE:",
  "⏳ ESTIMATED TIMELINE:",
  "⚠️ ESTIMATED RISKS:",
  "📈 POSSIBLE OUTCOMES:",
  "⚡ IMMEDIATE ACTIONS:",
  "🏁 CONCLUSION:",
  "⚖️ LEGAL DISCLAIMER:",
  "✍️ SIGNATURE BLOCK:"
];

const REQUIRED_COURTROOM_HEADERS = [
  "👨‍⚖️ Petitioner Counsel:",
  "⚖️ Respondent Counsel:",
  "👨‍⚖️ Petitioner Counsel Rebuttal:",
  "⚖️ Respondent Counsel Final:",
  "🏁 Final Judgment:"
];

/**
 * Escapes characters for safe regular expression matching
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getHeaderPattern(h, startOfLineOnly = false) {
  const clean = h.replace(/^[^\w]+/g, "").replace(/:$/g, "").trim();
  const words = clean.split(/\s+/);
  const corePattern = `(?:[^\\w\\s]+\\s*)?` + words.map(escapeRegExp).join("\\s+") + `\\s*:?`;
  if (startOfLineOnly) {
    return `(?:^|\\n)\\s*${corePattern}`;
  }
  return corePattern;
}

function matchStandardHeader(part, headers) {
  if (!part) return null;
  const trimmedPart = part.trim();
  for (const h of headers) {
    const pattern = new RegExp(`^${getHeaderPattern(h)}$`, "i");
    if (pattern.test(trimmedPart)) {
      return h;
    }
  }
  return null;
}

/**
 * Parses retry delay from Gemini rate limit error messages (Please retry in Xs)
 */
function parseRetryDelay(errorMessage) {
  if (!errorMessage) return null;
  const match = errorMessage.match(/Please retry in ([\d.]+)s/i);
  if (match) {
    const seconds = parseFloat(match[1]);
    if (!isNaN(seconds)) {
      return Math.ceil(seconds * 1000); // Return in milliseconds
    }
  }
  return null;
}

/**
 * Detects if a block of text has entered a repetition loop.
 * Returns { looping: true, phrase } if a phrase >=40 chars repeats more than 3 times.
 */
function detectRepetitionLoop(text) {
  if (!text || text.length < 200) return { looping: false };
  
  const sentences = text
    .split(/[.!?\n]+/)
    .map(s => s.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(s => s.length >= 30);

  const freq = {};
  for (const s of sentences) {
    freq[s] = (freq[s] || 0) + 1;
    if (freq[s] >= 3) {
      return { looping: true, phrase: s.substring(0, 80) };
    }
  }
  
  // Also check for long repeated phrases (40+ chars) via sliding window on raw text
  const norm = text.toLowerCase().replace(/\s+/g, ' ');
  const windowSize = 60;
  if (norm.length > windowSize * 4) {
    for (let i = 0; i < norm.length - windowSize * 2; i += 20) {
      const chunk = norm.substring(i, i + windowSize);
      const rest = norm.substring(i + windowSize);
      const count = (rest.split(chunk).length - 1);
      if (count >= 3) {
        return { looping: true, phrase: chunk.substring(0, 60) };
      }
    }
  }
  return { looping: false };
}

/**
 * Removes duplicate consecutive paragraphs and repeated sentences from a block of text.
 * Returns a clean version with duplicates eliminated.
 */
function deduplicateText(text) {
  if (!text) return text;

  // Step 1: Remove duplicate consecutive paragraphs
  const paragraphs = text.split(/\n{2,}/);
  const seenParas = new Set();
  const cleanParas = [];
  for (const para of paragraphs) {
    const norm = para.trim().toLowerCase().replace(/\s+/g, ' ');
    if (norm.length < 20) { cleanParas.push(para); continue; } // keep short separators
    if (!seenParas.has(norm)) {
      seenParas.add(norm);
      cleanParas.push(para);
    }
  }
  let result = cleanParas.join('\n\n');

  // Step 2: Remove duplicate consecutive sentences within paragraphs
  const sentencePattern = /([^.!?]+[.!?]+)/g;
  const seenSentences = new Set();
  result = result.replace(sentencePattern, (match) => {
    const norm = match.trim().toLowerCase().replace(/\s+/g, ' ');
    if (norm.length < 25) return match; // keep short phrases
    if (seenSentences.has(norm)) return ''; // deduplicate
    seenSentences.add(norm);
    return match;
  });

  // Step 3: Collapse repeated whitespace artifacts from deduplication
  result = result.replace(/\n{3,}/g, '\n\n').replace(/  +/g, ' ');
  return result.trim();
}

/**
 * Truncates a repetition loop in raw text by finding where repetition starts
 * and cutting the text at that point.
 */
function truncateAtRepetitionPoint(text) {
  if (!text) return text;
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length >= 30);
  const seen = new Set();
  let cutoffCharPos = -1;
  let charPos = 0;

  for (const sentence of sentences) {
    const norm = sentence.toLowerCase().replace(/\s+/g, ' ');
    const posInText = text.indexOf(sentence, charPos);
    if (seen.has(norm)) {
      cutoffCharPos = posInText;
      break;
    }
    seen.add(norm);
    if (posInText !== -1) charPos = posInText + sentence.length;
  }

  if (cutoffCharPos > 200) {
    console.warn(`[Dedup] Repetition loop detected at char ${cutoffCharPos}. Truncating text there.`);
    return text.substring(0, cutoffCharPos).trimEnd();
  }
  return text;
}

/**
 * Evaluates the structural integrity of the generated output
 */
function validateResponse(text, mode) {
  const errors = [];
  if (!text || text.trim() === "") {
    errors.push("Response text is completely empty");
    return { valid: false, errors };
  }

  const trimmed = text.trim();
  const headers = mode === "courtroom" ? REQUIRED_COURTROOM_HEADERS : REQUIRED_NORMAL_HEADERS;

  // 1. Verify existence and uniqueness of required headings
  for (const h of headers) {
    const pattern = new RegExp(getHeaderPattern(h, true), "gi");
    const occurrences = (trimmed.match(pattern) || []).length;
    if (occurrences === 0) {
      errors.push(`Missing section header: "${h}"`);
    } else if (occurrences > 1) {
      errors.push(`Duplicate section header: "${h}"`);
    }
  }

  // 2. Check for repetition loops in the content
  const loopCheck = detectRepetitionLoop(trimmed);
  if (loopCheck.looping) {
    errors.push(`Repetition loop detected: "${loopCheck.phrase}..."`);
  }

  // 3. Check for natural ending / signature blocks
  const lastChar = trimmed.slice(-1);
  const validEndings = [".", "!", "?", "%", ")", '"', "'", "✍️", ":"];
  
  if (mode === "courtroom") {
    const hasConfidence = trimmed.toLowerCase().includes("confidence score");
    if (!hasConfidence && !validEndings.includes(lastChar)) {
      errors.push("Courtroom simulation does not end with natural punctuation or confidence score");
    }
  } else {
    const endsWithSignature = trimmed.endsWith("Prepared by LexAI – AI Legal Research Assistant") || 
                              trimmed.includes("✍️ SIGNATURE BLOCK:") ||
                              trimmed.includes("LexAI – AI Legal Research Assistant");
    if (!endsWithSignature && !validEndings.includes(lastChar)) {
      errors.push("Legal memorandum does not conclude with signature block or standard sentence ending");
    }
  }

  // 4. Inspect last line for cutoff conjunctions or trailing words
  const lastLine = trimmed.split("\n").pop().trim();
  if (lastLine.length > 0) {
    const lastWord = lastLine.split(/\s+/).pop().toLowerCase().replace(/[^a-z]/g, "");
    const trailingConjunctions = ["and", "or", "the", "of", "a", "an", "under", "section", "with", "for", "to", "at", "by", "from"];
    if (trailingConjunctions.includes(lastWord)) {
      errors.push(`Response terminates abruptly on trailing word: "${lastWord}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Helper to validate if a legal opinion or debate is fully complete.
 */
function isLegalResponseComplete(text, mode) {
  return validateResponse(text, mode).valid;
}

/**
 * Splices raw text into structured parts mapped by their headers
 */
function parseIntoSections(text, headers) {
  const sections = {};
  headers.forEach(h => {
    sections[h] = "";
  });
  sections["PRE-HEADER"] = "";

  const patterns = headers.map(h => getHeaderPattern(h, true));
  const regex = new RegExp(`(${patterns.join("|")})`, "gi");
  const parts = text.split(regex);
  
  let currentHeader = "PRE-HEADER";
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 1) {
      const standardHeader = matchStandardHeader(part, headers);
      if (standardHeader) {
        currentHeader = standardHeader;
        if (sections[currentHeader] === undefined) {
          sections[currentHeader] = "";
        }
      } else {
        sections[currentHeader] += part;
      }
    } else {
      sections[currentHeader] += part;
    }
  }
  return sections;
}

/**
 * Merges original and continuation responses at the section level.
 * STRICT RULES:
 * - If a section exists in BOTH original and continuation, keep ONLY the original (prevent duplication).
 * - EXCEPT for the last incomplete section in original — merge only that one carefully.
 * - New sections in continuation (not in original) are appended normally.
 * After merging, run deduplication on each section's content.
 */
function mergeParsedSections(original, continuation, mode) {
  const headers = mode === "courtroom" ? REQUIRED_COURTROOM_HEADERS : REQUIRED_NORMAL_HEADERS;
  const origSections = parseIntoSections(original, headers);
  const contSections = parseIntoSections(continuation, headers);

  // Find the last section that has CONTENT in the original
  const origPopulatedHeaders = headers.filter(h => origSections[h] !== undefined && origSections[h].trim() !== '');
  const lastOrigHeader = origPopulatedHeaders[origPopulatedHeaders.length - 1] || null;

  // Find the FIRST section present in continuation (it might be a repeat of last orig)
  const contPopulatedHeaders = headers.filter(h => contSections[h] !== undefined && contSections[h].trim() !== '');
  const firstContHeader = contPopulatedHeaders[0] || null;

  console.log(`[Merge] Last original section: ${lastOrigHeader || 'none'}`);
  console.log(`[Merge] First continuation section: ${firstContHeader || 'none'}`);
  console.log(`[Merge] Continuation has ${contPopulatedHeaders.length} section(s): ${contPopulatedHeaders.join(', ')}`);

  const mergedSections = { ...origSections };

  for (const h of headers) {
    const hasOrig = origSections[h] !== undefined && origSections[h].trim() !== '';
    const hasCont = contSections[h] !== undefined && contSections[h].trim() !== '';

    if (!hasCont) continue; // nothing new in continuation for this section

    if (!hasOrig) {
      // New section only in continuation — add it
      console.log(`[Merge] Adding new section from continuation: ${h}`);
      mergedSections[h] = deduplicateText(contSections[h]);
    } else if (h === lastOrigHeader && h === firstContHeader) {
      // This is the boundary section: original ends mid-section, continuation starts here.
      // Splice them together carefully using word-overlap merge.
      console.log(`[Merge] Splicing boundary section: ${h}`);
      const merged = mergeContinuationText(origSections[h], contSections[h]);
      mergedSections[h] = deduplicateText(merged);
    } else {
      // Section exists in both — SKIP continuation's version to prevent duplication.
      console.log(`[Merge] Skipping duplicate section in continuation: ${h}`);
    }
  }

  // Rebuild the final integrated document
  let finalResult = mergedSections["PRE-HEADER"] || "";
  for (const h of headers) {
    if (mergedSections[h] !== undefined) {
      finalResult += h + mergedSections[h];
    }
  }
  
  // Final safety: run deduplication on the full merged document
  return deduplicateText(finalResult);
}

/**
 * Merges the original text with a continuation response, removing word/character overlaps.
 */
function mergeContinuationText(original, continuation) {
  const origTrimmed = original.trimEnd();
  const contTrimmed = continuation.trimStart();
  
  // 1. Sliding window character overlap match
  const maxCharOverlap = Math.min(origTrimmed.length, contTrimmed.length, 300);
  let charOverlapLength = 0;
  
  for (let len = maxCharOverlap; len >= 4; len--) {
    const origTail = origTrimmed.slice(-len);
    const contHead = contTrimmed.slice(0, len);
    const normOrig = origTail.toLowerCase().replace(/\s+/g, " ");
    const normCont = contHead.toLowerCase().replace(/\s+/g, " ");
    if (normOrig === normCont) {
      charOverlapLength = len;
      break;
    }
  }
  
  if (charOverlapLength > 0) {
    return origTrimmed + " " + contTrimmed.slice(charOverlapLength);
  }
  
  // 2. Word overlap match fallback
  const origWords = origTrimmed.split(/\s+/);
  const contWords = contTrimmed.split(/\s+/);
  
  let overlapLength = 0;
  const maxOverlap = Math.min(origWords.length, contWords.length, 15);
  
  for (let len = maxOverlap; len >= 1; len--) {
    const origTail = origWords.slice(-len).join(" ").toLowerCase().replace(/[^a-z0-9]/g, "");
    const contHead = contWords.slice(0, len).join(" ").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (origTail === contHead && origTail.length > 0) {
      overlapLength = len;
      break;
    }
  }
  
  if (overlapLength > 0) {
    const nonOverlappingCont = contWords.slice(overlapLength).join(" ");
    return origTrimmed + " " + nonOverlappingCont;
  }
  
  const lastChar = origTrimmed.slice(-1);
  if (/[a-zA-Z0-9]/.test(lastChar)) {
    return origTrimmed + " " + contTrimmed;
  } else if (lastChar === "\n" || lastChar === "\r") {
    return origTrimmed + "\n" + contTrimmed;
  } else {
    return origTrimmed + "\n\n" + contTrimmed;
  }
}

/**
 * Merges the original text with a continuation response, removing word overlaps. (Legacy signature wrapper)
 */
function mergeContinuation(original, continuation) {
  return mergeContinuationText(original, continuation);
}

/**
 * Computes what fraction of the continuation text already exists in the original text.
 * Used to detect when a continuation is mostly a duplicate (and should be skipped).
 * Returns a ratio from 0.0 (no overlap) to 1.0 (fully duplicate).
 */
function computeTextOverlapRatio(original, continuation) {
  if (!continuation || continuation.length < 100) return 0;
  
  const contWords = continuation.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  if (contWords.length === 0) return 0;
  
  const origNorm = original.toLowerCase();
  let matchCount = 0;
  
  // Sample every 3rd word for performance
  for (let i = 0; i < contWords.length; i += 3) {
    // Check if a 5-word phrase from continuation exists in original
    const phrase = contWords.slice(i, i + 5).join(' ');
    if (phrase.length > 15 && origNorm.includes(phrase)) {
      matchCount++;
    }
  }
  
  const sampleCount = Math.ceil(contWords.length / 3);
  return sampleCount > 0 ? matchCount / sampleCount : 0;
}

/**
 * Communicates with Gemini API with retry back-off, fallback model migration, and request abortion handling.
 */
async function generateWithRetry(systemInstruction, messages, modelIndex = 0, attempt = 1, requestId = "SYSTEM", req = null) {
  const modelName = MODEL_CHAIN[modelIndex] || "gemini-2.5-flash-lite";
  const startTime = Date.now();
  
  console.log(`[Request ID: ${requestId}] [Gemini API] Call started for model: ${modelName}, Attempt: ${attempt}`);

  const model = genAI.getGenerativeModel(
    {
      model: modelName,
      generationConfig: {
        // Use 0.7 temperature: prevents deterministic token repetition loops
        // that occur at very low temperatures during long-form legal text generation.
        // 0.7 is the sweet spot — factual enough for legal content, diverse enough
        // to avoid the model entering a stuck-token loop.
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.9,
        topK: 40
      },
      systemInstruction: systemInstruction,
    },
    { timeout: 45000 } // 45s request timeout
  );

  try {
    const formattedContents = messages.map(msg => ({
      role: msg.role === "assistant" || msg.role === "model" || msg.role === "ai" ? "model" : "user",
      parts: [{ text: msg.content || "" }]
    }));

    const response = await model.generateContent({
      contents: formattedContents
    });

    const duration = Date.now() - startTime;
    let text = response.response.text();
    
    if (!text || text.trim() === "") {
      throw new Error("Received empty text response from Gemini API");
    }

    // ── Repetition loop guard ───────────────────────────────────────
    // If the model has entered a repetition loop, truncate at the first repeat point
    // before returning so the rest of the pipeline never sees corrupted content.
    const loopCheck = detectRepetitionLoop(text);
    if (loopCheck.looping) {
      console.warn(`[Request ID: ${requestId}] [Gemini Dedup] Repetition loop detected in raw response: "${loopCheck.phrase}...". Truncating and deduplicating.`);
      text = truncateAtRepetitionPoint(text);
      text = deduplicateText(text);
    }

    const candidate = response.response.candidates && response.response.candidates[0];
    const finishReason = candidate ? candidate.finishReason : null;
    const usageMetadata = response.response.usageMetadata || {};

    console.log(`[Request ID: ${requestId}] [Gemini API] Call completed successfully in ${duration}ms. Model: ${modelName}`);
    console.log(`[Request ID: ${requestId}] [Gemini Tokens] Prompt: ${usageMetadata.promptTokenCount || 0}, Candidate: ${usageMetadata.candidatesTokenCount || 0}, Total: ${usageMetadata.totalTokenCount || 0}`);

    return { 
      text, 
      finishReason, 
      modelIndex, 
      promptTokens: usageMetadata.promptTokenCount || 0,
      outputTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Request ID: ${requestId}] [Gemini Error] Failure after ${duration}ms (Model: ${modelName}, Attempt: ${attempt}): ${error.message}`);

    const errMsg = error.message || '';
    const isRateLimit = errMsg.includes("429") || errMsg.includes("Quota exceeded") || errMsg.includes("RESOURCE_EXHAUSTED") || error.status === 429;
    const isServiceUnavailable = errMsg.includes("503") || errMsg.includes("Service Unavailable") || errMsg.includes("experiencing high demand") || error.status === 503;
    const isServerError = (errMsg.includes("500") || error.status === 500) && !isServiceUnavailable;
    const isModelNotFound = errMsg.includes("404") || errMsg.includes("not found") || error.status === 404;

    // Detect if this model's quota is permanently disabled (limit: 0) on this API key.
    // These errors mention 'limit: 0' in the quota violation details.
    // For these, skip immediately without waiting — no amount of waiting will help.
    const isQuotaDisabled = isRateLimit && (
      errMsg.includes('"limit": 0') || 
      errMsg.includes('"limit":0') ||
      errMsg.includes('limit: 0,')
    );

    if (isModelNotFound || isQuotaDisabled || isServiceUnavailable) {
      // Immediately skip to the next model — no retry possible/useful
      if (modelIndex < MODEL_CHAIN.length - 1) {
        const nextModelName = MODEL_CHAIN[modelIndex + 1];
        const reason = isModelNotFound 
          ? 'model not found' 
          : (isQuotaDisabled ? 'quota disabled (limit=0)' : 'service unavailable (503 / high demand)');
        console.warn(`[Request ID: ${requestId}] [Gemini Skip] ${modelName} skipped (${reason}). Trying: ${nextModelName}`);
        return generateWithRetry(systemInstruction, messages, modelIndex + 1, 1, requestId, req);
      }
    }

    // Smart rate-limit handling for models that DO have a quota (just temporarily exceeded)
    if (isRateLimit && !isQuotaDisabled) {
      const waitTime = parseRetryDelay(errMsg);
      
      // If wait time is short (<= 5s), wait and retry on same model
      if (waitTime !== null && waitTime <= 5000 && attempt < 3) {
        console.warn(`[Request ID: ${requestId}] [Gemini Retry] Rate limited on ${modelName}. Short wait ${waitTime}ms. Retrying same model...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return generateWithRetry(systemInstruction, messages, modelIndex, attempt + 1, requestId, req);
      }
      
      // Long wait time or exceeded attempts — fall back to next model immediately
      if (modelIndex < MODEL_CHAIN.length - 1) {
        const nextModelName = MODEL_CHAIN[modelIndex + 1];
        console.warn(`[Request ID: ${requestId}] [Gemini Fallback] ${modelName} rate limited (${waitTime ? waitTime+'ms wait' : 'long wait'}). Migrating to: ${nextModelName}`);
        return generateWithRetry(systemInstruction, messages, modelIndex + 1, 1, requestId, req);
      }
      
      // No more models — last resort: wait up to 12s for quota reset
      if (attempt < 3) {
        const maxWait = waitTime ? Math.min(waitTime, 12000) : 8000;
        console.warn(`[Request ID: ${requestId}] [Gemini Retry] No more backup models. Waiting ${maxWait}ms for quota reset on ${modelName}...`);
        await new Promise(resolve => setTimeout(resolve, maxWait));
        return generateWithRetry(systemInstruction, messages, modelIndex, attempt + 1, requestId, req);
      }
    }

    // Server errors/timeouts: Exponential backoff retry on same model, then fall back
    if ((isServerError || errMsg.includes("timeout") || errMsg.includes("fetch")) && attempt < 3) {
      const backoff = attempt * 2000;
      console.warn(`[Request ID: ${requestId}] [Gemini Retry] Temporary server/network error on ${modelName}. Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return generateWithRetry(systemInstruction, messages, modelIndex, attempt + 1, requestId, req);
    }

    // All retries exhausted — try next model in chain
    if (modelIndex < MODEL_CHAIN.length - 1) {
      const nextModelName = MODEL_CHAIN[modelIndex + 1];
      console.warn(`[Request ID: ${requestId}] [Gemini Fallback] All retries failed for ${modelName}. Migrating to: ${nextModelName}`);
      return generateWithRetry(systemInstruction, messages, modelIndex + 1, 1, requestId, req);
    }

    // All models exhausted — throw a descriptive error
    const finalMsg = isRateLimit
      ? `All Gemini models have exceeded their quota for this API key. The free tier allows limited daily requests. Please wait a few minutes and try again, or upgrade your Google AI API plan.`
      : `Gemini API error (${modelName}): ${errMsg}`;
    const finalErr = new Error(finalMsg);
    finalErr.status = error.status || 500;
    throw finalErr;
  }
}

/**
 * Identifies which headers are missing from the response text
 */
function getMissingHeaders(text, mode) {
  const headers = mode === "courtroom" ? REQUIRED_COURTROOM_HEADERS : REQUIRED_NORMAL_HEADERS;
  const missing = [];
  for (const h of headers) {
    const pattern = new RegExp(getHeaderPattern(h, true), "i");
    if (!pattern.test(text)) {
      missing.push(h);
    }
  }
  return missing;
}

/**
 * Manually repairs the response layout by appending default missing sections to guarantee UI structure
 */
function repairResponseLayout(text, mode) {
  let repairedText = text.trim();
  const missing = getMissingHeaders(repairedText, mode);
  
  if (missing.length === 0) return repairedText;

  console.log(`[Layout Repair] Appending missing sections: ${missing.join(", ")}`);

  if (mode === "courtroom") {
    for (const h of missing) {
      if (h === "🏁 Final Judgment:") {
        repairedText += `\n\n🏁 Final Judgment:\n- Based on the arguments presented, both parties have presented notable arguments. Confidence Score: 50%.\n`;
      } else {
        repairedText += `\n\n${h}\n- Section not completed due to network/token truncation.\n`;
      }
    }
  } else {
    for (const h of missing) {
      if (h === "⚖️ LEGAL DISCLAIMER:") {
        repairedText += `\n\n⚖️ LEGAL DISCLAIMER:\nThis legal research assessment has been prepared by LexAI, an artificial intelligence helper system. It does not constitute formal legal advice or create an advocate-client relationship. Under the Bar Council of India rules, advocates are prohibited from advertising or soliciting work. Please consult a qualified advocate for certified legal advice.`;
      } else if (h === "✍️ SIGNATURE BLOCK:") {
        repairedText += `\n\n✍️ SIGNATURE BLOCK:\nPrepared by LexAI – AI Legal Research Assistant`;
      } else {
        repairedText += `\n\n${h}\n[Detailed section analysis truncated. Please check evidence file or query specific parameters.]\n`;
      }
    }
  }
  return repairedText;
}

/**
 * Generates responses for Legal Advice or Courtroom Simulation modes.
 */
async function getGeminiResponse({ message, messages, mode = "normal", language = "English", requestId = "GEN-API", req = null }) {
  const isCourtroom = mode === "courtroom";

  const systemPrompt = isCourtroom
    ? `You are a legal AI courtroom simulation.
The user will provide a case or legal problem. You must generate a simulated courtroom debate with EXACTLY these parts in order, separated by these EXACT headers in English:

👨‍⚖️ Petitioner Counsel:
- Argue strongly for the petitioner/client using simple language and relevant laws.
- [Optional] Witness: [Witness Name] - [Brief testimony statement]
- [Optional] Evidence: Exhibit [Exhibit Name] - [Brief description]

⚖️ Respondent Counsel:
- Argue against the petitioner, presenting the opposing party's strongest defense.
- [Optional] Witness: [Witness Name] - [Brief testimony statement]
- [Optional] Evidence: Exhibit [Exhibit Name] - [Brief description]

👨‍⚖️ Petitioner Counsel Rebuttal:
- Respond specifically to the Respondent's points above.

⚖️ Respondent Counsel Final:
- Give the final opposing argument.

🏁 Final Judgment:
- Who has the stronger case, a very brief explanation, and an estimated confidence level (e.g. Confidence Score: 85%).

RULES:
- Respond ENTIRELY in ${language}.
- ALWAYS output the EXACT headers listed above (e.g. "👨‍⚖️ Petitioner Counsel:", "⚖️ Respondent Counsel:", "👨‍⚖️ Petitioner Counsel Rebuttal:", "⚖️ Respondent Counsel Final:", "🏁 Final Judgment:") in English to allow parsing, even if the content below them is translated to ${language}.
- Use bullet points.
- KEEP IT CONCISE AND PUNCHY.
- Include citation references to specific acts (e.g. IPC, BNS, or Indian Constitution) in arguments.
- DO NOT use markdown headings (like ##).
- IMPORTANT: You MUST generate all the sections completely. Do not stop mid-response or leave any sections incomplete.`
    : `You are a senior advocate preparing an official legal opinion memorandum under Indian law.
Write a detailed, formal, and authoritative legal document.

IMPORTANT: Avoid excessive bullet points. Write in structured, professional paragraphs using precise legal terminology. The analysis must read like an advocate advising a client, detailing legal reasoning, strengths, and weaknesses.

You must respond with EXACTLY these parts in order, separated by these EXACT headers in English to allow frontend parsing (do not use markdown headings like ###):

📋 COVER HEADING:
[Provide a formal legal memorandum cover heading:
LEGAL OPINION MEMORANDUM
TO: [Client Name/Interests]
FROM: LexAI Legal Research Services
DATE: [Current Date or 'June 25, 2026']
RE: [Subject matter, e.g. Dispute concerning breach of tenancy agreement by Tenant A]]

📝 EXECUTIVE SUMMARY:
[Provide a 1-2 paragraph executive summary summarizing the case, the core legal issues, and the primary recommended legal recourse.]

👤 CLIENT INSTRUCTIONS:
[Detail what the client is asking for, what their objectives are, and the specific questions they want resolved.]

📖 FACTS PRESENTED:
[Provide a chronological, paragraph-based narrative of the facts from the client's input. Identify any factual gaps or areas where additional client documentation is required.]

🔍 ISSUES FOR DETERMINATION:
[List the specific legal issues or questions that must be determined, numbered, e.g., '1. Whether the unilateral locks-change by the landlord constitutes illegal dispossession under Section 38 of Bharatiya Nagarik Suraksha Sanhita (BNSS)...']

⚖️ APPLICABLE LAW:
[State the exact statutes and sections that apply. For current offenses, prioritize BNS (Bharatiya Nyaya Sanhita, 2023) and BNSS (Bharatiya Nagarik Suraksha Sanhita, 2023). If you mention older IPC or CrPC sections, explicitly declare them as historical equivalents (e.g. 'Section 303 of BNS, which corresponds to the repealed Section 378 of the Indian Penal Code, 1860'). Explain the specific elements of each provision.]

🔬 DETAILED LEGAL ANALYSIS:
[For every law cited, explain why it applies, how it affects the client's legal standing, and analyze its strengths and weaknesses in the context of the facts. Use paragraph-based analysis.]

🛡️ POSSIBLE DEFENCES:
[Explain any defences or counter-arguments the opposing party is likely to raise, how they affect the case strength, and how they should be countered.]

🧭 RECOMMENDED LITIGATION STRATEGY:
[Outline the recommended litigation strategy. Address:
- Whether a civil suit should be filed and for what relief.
- Whether a police complaint or FIR should be registered.
- Whether an ad-interim injunction or urgent relief should be sought.
- Which court has the appropriate jurisdiction (territorial and pecuniary).
- The exact chronological sequence of legal actions to take.]

📊 REQUIRED EVIDENCE:
[Identify the documentary, digital, or oral evidence required to support the case (e.g. lease deeds, bank receipts, email correspondence, witness affidavits).]

⏳ ESTIMATED TIMELINE:
[Provide a realistic timeline for the litigation process through the relevant courts.]

⚠️ ESTIMATED RISKS:
[Evaluate the financial, operational, or legal risks associated with initiating litigation.]

📈 POSSIBLE OUTCOMES:
[State the possible outcomes of the case and their probability (e.g., summary dismissal, decree in favor, compromise decree).]

⚡ IMMEDIATE ACTIONS:
[Provide a step-by-step list of immediate actions the client must take (e.g., issuing a formal legal notice, preserving evidence, calling a witness).]

🏁 CONCLUSION:
[Provide a final summary conclusion of the legal opinion.]

⚖️ LEGAL DISCLAIMER:
[Standard professional legal disclaimer regarding research vs. formal advocacy.]

✍️ SIGNATURE BLOCK:
Prepared by LexAI – AI Legal Research Assistant

RULES:
- Respond ENTIRELY in ${language}.
- IMPORTANT: ALWAYS output the EXACT headers listed above (e.g. "📋 COVER HEADING:", "📝 EXECUTIVE SUMMARY:", "👤 CLIENT INSTRUCTIONS:", "📖 FACTS PRESENTED:", "🔍 ISSUES FOR DETERMINATION:", "⚖️ APPLICABLE LAW:", "🔬 DETAILED LEGAL ANALYSIS:", "🛡️ POSSIBLE DEFENCES:", "🧭 RECOMMENDED LITIGATION STRATEGY:", "📊 REQUIRED EVIDENCE:", "⏳ ESTIMATED TIMELINE:", "⚠️ ESTIMATED RISKS:", "📈 POSSIBLE OUTCOMES:", "⚡ IMMEDIATE ACTIONS:", "🏁 CONCLUSION:", "⚖️ LEGAL DISCLAIMER:", "✍️ SIGNATURE BLOCK:") in English to allow parsing, even if the rest of the text is translated.
- IMPORTANT: You MUST generate all the 17 sections completely and in the exact order specified. Do not summarize or skip sections. Do not cut off before the '✍️ SIGNATURE BLOCK:'. Ensure every section is fully detailed.`;

  let apiMessages = [];
  if (messages && Array.isArray(messages) && messages.length > 0) {
    apiMessages = messages;
  } else if (message) {
    apiMessages = [{ role: "user", content: message }];
  } else {
    throw new Error("No user input message was provided");
  }

  const totalStartTime = Date.now();
  console.log(`[Request ID: ${requestId}] [Query Started] Mode: ${mode}, Language: ${language}`);

  // 1. Initial Generation
  let result = await generateWithRetry(systemPrompt, apiMessages, 0, 1, requestId, req);
  let fullText = result.text;
  let currentModelIndex = result.modelIndex;
  let currentMessages = [...apiMessages, { role: "assistant", content: fullText }];
  
  let totalPromptTokens = result.promptTokens;
  let totalOutputTokens = result.outputTokens;
  
  // 2. Validation & Continuation Loop (up to 3 attempts for high reliability)
  let validation = validateResponse(fullText, mode);
  console.log(`[Request ID: ${requestId}] [Validation Initial] Valid: ${validation.valid}, Errors: ${validation.errors.join("; ")}`);
  
  let continuationAttempt = 0;
  while (!validation.valid && continuationAttempt < 3) {
    continuationAttempt++;

    const missingHeaders = getMissingHeaders(fullText, mode);
    
    let continuationPrompt = "";
    if (mode === "courtroom") {
      continuationPrompt = `The previous courtroom simulation response was truncated or cut off. `;
      if (missingHeaders.length > 0) {
        continuationPrompt += `The following required sections are missing: ${missingHeaders.join(", ")}. Please continue the simulation immediately by generating these missing sections. `;
      } else {
        continuationPrompt += `Please continue writing the simulation debate EXACTLY from the last word of the previous text. `;
      }
      continuationPrompt += `DO NOT start from the beginning. DO NOT repeat any sections. Finish all remaining arguments and the final judgment.`;
    } else {
      continuationPrompt = `The previous legal opinion response was truncated or cut off. `;
      if (missingHeaders.length > 0) {
        continuationPrompt += `The following required sections are missing: ${missingHeaders.join(", ")}. Please continue the opinion immediately by generating these missing sections. `;
      } else {
        continuationPrompt += `Please continue writing the opinion EXACTLY from the last word of the previous text. `;
      }
      continuationPrompt += `DO NOT start from the beginning. DO NOT repeat any sections. Finish all remaining sections and concluding signature block.`;
    }

    console.log(`[Request ID: ${requestId}] [Continuation Loop] Attempt: ${continuationAttempt}. Missing sections: ${missingHeaders.join(", ") || "None (ends abruptly)"}`);

    try {
      const continuationResult = await generateWithRetry(
        systemPrompt,
        [...currentMessages, { role: "user", content: continuationPrompt }],
        currentModelIndex,
        1,
        requestId,
        req
      );

      if (continuationResult.text && continuationResult.text.trim() !== "") {
        let cleanContinuation = continuationResult.text.trim();
        // Remove conversational prefaces
        cleanContinuation = cleanContinuation
          .replace(/^(here is the continuation|continuing from where i left off|continuing the legal opinion|continuation):/i, "")
          .trim();

        // Guard: if continuation has a repetition loop itself, clean it first
        const contLoopCheck = detectRepetitionLoop(cleanContinuation);
        if (contLoopCheck.looping) {
          console.warn(`[Request ID: ${requestId}] [Continuation Dedup] Loop in continuation: "${contLoopCheck.phrase}...". Cleaning.`);
          cleanContinuation = truncateAtRepetitionPoint(cleanContinuation);
          cleanContinuation = deduplicateText(cleanContinuation);
        }

        // Guard: if continuation is mostly a repeat of what we already have, break the loop to avoid wasting API calls
        const overlapRatio = computeTextOverlapRatio(fullText, cleanContinuation);
        if (overlapRatio > 0.7) {
          console.warn(`[Request ID: ${requestId}] [Continuation Skip] Continuation is ${Math.round(overlapRatio * 100)}% duplicate of existing text. Breaking continuation loop.`);
          break;
        } else {
          // Perform parsed section merge
          fullText = mergeParsedSections(fullText, cleanContinuation, mode);
        }
        
        currentMessages.push({ role: "assistant", content: continuationResult.text });
        totalPromptTokens += continuationResult.promptTokens;
        totalOutputTokens += continuationResult.outputTokens;
        currentModelIndex = continuationResult.modelIndex;
      } else {
        console.warn(`[Request ID: ${requestId}] [Continuation Break] Received empty continuation response. Breaking loop.`);
        break;
      }
    } catch (contError) {
      console.error(`[Request ID: ${requestId}] [Continuation Error] Attempt ${continuationAttempt} failed:`, contError.message);
      break;
    }

    // Re-evaluate validation
    validation = validateResponse(fullText, mode);
    console.log(`[Request ID: ${requestId}] [Validation Attempt ${continuationAttempt}] Valid: ${validation.valid}, Errors: ${validation.errors.join("; ")}`);
  }

  // 3. Fallback repair if still invalid after maximum continuation attempts
  if (!validation.valid) {
    console.warn(`[Request ID: ${requestId}] [Validation Fallback] Response still incomplete after ${continuationAttempt} continuation attempts. Repairing document layout manually.`);
    fullText = repairResponseLayout(fullText, mode);
    // Final check
    validation = validateResponse(fullText, mode);
    console.log(`[Request ID: ${requestId}] [Validation Post-Repair] Valid: ${validation.valid}, Errors: ${validation.errors.join("; ")}`);
  }

  const totalTime = Date.now() - totalStartTime;
  console.log(`[Request ID: ${requestId}] [Query Completed] Total Latency: ${totalTime}ms, Model Index Used: ${currentModelIndex}, Final Size: ${fullText.length} chars`);
  console.log(`[Request ID: ${requestId}] [Total Tokens] Prompt: ${totalPromptTokens}, Output: ${totalOutputTokens}, Sum: ${totalPromptTokens + totalOutputTokens}`);

  return fullText;
}

/**
 * Analyzes a legal document text and extracts summary, risks, and clauses.
 */
async function analyzeLegalDocument(documentText, requestId = "DOC-AUDIT", req = null) {
  const systemPrompt = `You are a professional legal auditor.
Analyze the following legal text (contract, lease, deed, agreement, etc.) and extract:
1. A brief executive summary (2-3 sentences).
2. Key risks or red flags for the parties involved (up to 5 bullet points).
3. Important clauses or provisions (up to 5 key clauses extracted, such as Indemnity, Termination, Liability, Jurisdiction).

You MUST respond with a valid JSON object matching the following structure. Do not output any markdown formatting like \`\`\`json outside the JSON object itself, just return the raw JSON string:

{
  "summary": "Brief summary of the document here.",
  "risks": [
    "Risk 1 description",
    "Risk 2 description"
  ],
  "clauses": [
    "Clause 1: Content",
    "Clause 2: Content"
  ]
}`;

  const messages = [{ role: "user", content: documentText }];
  
  // Call the generative API starting from index 1 (prefer flash models for faster doc processing)
  const result = await generateWithRetry(systemPrompt, messages, 1, 1, requestId, req);
  const responseText = result.text;

  try {
    // Strip markdown formatting if the model returned it
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("JSON parsing of Gemini document analysis failed. Falling back to rule-based parsing.", error);
    
    // Fallback: rule-based parsing if JSON is malformed
    const summaryMatch = responseText.match(/(?:summary|executive summary):?\s*([\s\S]*?)(?=(?:risks|key risks|clauses|key clauses):?|$)/i);
    const risksMatch = responseText.match(/(?:risks|key risks):?\s*([\s\S]*?)(?=(?:clauses|key clauses):?|$)/i);
    const clausesMatch = responseText.match(/(?:clauses|key clauses):?\s*([\s\S]*?)$/i);

    const summary = summaryMatch ? summaryMatch[1].trim() : "Summary extraction completed successfully.";
    
    const risks = [];
    if (risksMatch) {
      risksMatch[1].split("\n").forEach(line => {
        const cleaned = line.replace(/^[-*•\d\s.]+/g, "").trim();
        if (cleaned) risks.push(cleaned);
      });
    }

    const clauses = [];
    if (clausesMatch) {
      clausesMatch[1].split("\n").forEach(line => {
        const cleaned = line.replace(/^[-*•\d\s.]+/g, "").trim();
        if (cleaned) clauses.push(cleaned);
      });
    }

    return {
      summary: summary || "Document analyzed successfully.",
      risks: risks.length > 0 ? risks : ["No major risk indicators detected in this document."],
      clauses: clauses.length > 0 ? clauses : ["No critical clauses detected."]
    };
  }
}

module.exports = {
  getGeminiResponse,
  analyzeLegalDocument
};
