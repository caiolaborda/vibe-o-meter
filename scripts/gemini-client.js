'use strict';

/**
 * Shared Gemini Interactions API + Flex Inference + Batch API Client
 * Built on @google/genai >= 3.2.0 (GA Interactions API on v1 + Batch API on v1beta).
 * Replaces legacy @google/generative-ai and generateContent calls across all Vibe-O-Meter pipelines.
 */

const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const MIN_THINKING_MAX_OUTPUT_TOKENS = 32768;

// Cache SDK client instances by apiKey + apiVersion
const _clientCache = new Map();
function getGenAiClient(apiKey, apiVersion = undefined) {
  const cacheKey = `${apiKey}::${apiVersion || 'default'}`;
  if (!_clientCache.has(cacheKey)) {
    const opts = { apiKey };
    if (apiVersion) opts.apiVersion = apiVersion;
    _clientCache.set(cacheKey, new GoogleGenAI(opts));
  }
  return _clientCache.get(cacheKey);
}

/**
 * Normalize thinking_level per model capability:
 * - Gemini 4 (carbon, argon, hydrogen) & Gemini 3.8 Flash do NOT support 'minimal' (rejected with 400).
 * - Gemini 3.6 Flash & Gemini 3.5/3.1 Flash-Lite support 'minimal' | 'low' | 'medium' | 'high'.
 * - Gemma 4 models omit thinking_level unless supported.
 */
function normalizeThinkingLevelForModel(model, requestedLevel) {
  const m = String(model || '').toLowerCase();
  if (m.startsWith('gemma-')) return null;

  const raw = String(requestedLevel || '').toLowerCase().trim();
  const supportsMinimal = (
    m.includes('3.5-flash-lite') ||
    m.includes('3.1-flash-lite') ||
    m.includes('3.6-flash')
  );
  const supportsXHigh = m.includes('gemini-4-hydrogen');

  if (!raw) {
    return supportsMinimal ? 'minimal' : 'low';
  }
  if (raw === 'minimal') {
    return supportsMinimal ? 'minimal' : 'low';
  }
  if (raw === 'xhigh') {
    return supportsXHigh ? 'xhigh' : 'high';
  }
  if (raw === 'low' || raw === 'medium' || raw === 'high') {
    return raw;
  }
  return supportsMinimal ? 'minimal' : 'low';
}

function normalizeMaxOutputTokens(model, requestedMax) {
  const n = Number(requestedMax) || 0;
  const m = String(model || '').toLowerCase();
  if (m.startsWith('gemma-')) {
    return n > 0 ? n : 8192;
  }
  return Math.max(MIN_THINKING_MAX_OUTPUT_TOKENS, n);
}

function tryRepairJsonArray(text) {
  let clean = String(text || '').trim();
  clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  // Strip illegal leading positive signs from numbers like ": +0.25"
  clean = clean.replace(/:\s*\+(\d)/g, ': $1');
  // Strip stray markdown quote/bullet prefixes inside JSON arrays & trailing commas
  clean = clean.replace(/(?<=\[|,)\s*[>*•]\s*(?=["{\[-])/g, ' ');
  clean = clean.replace(/,(\s*[\]}])/g, '$1');
  if (!clean.startsWith('[')) return clean;
  if (clean.endsWith(']')) return clean;
  if (clean.endsWith('}')) return clean + ']';
  if (clean.endsWith(',')) return clean.slice(0, -1).trim() + ']';
  const lastBrace = clean.lastIndexOf('}');
  if (lastBrace !== -1) return clean.substring(0, lastBrace + 1) + ']';
  return clean;
}

function cleanJsonText(rawText, repairArray = false) {
  if (repairArray) return tryRepairJsonArray(rawText);
  return String(rawText || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/,(\s*[\]}])/g, '$1')
    .trim();
}

function extractInteractionText(interaction) {
  if (!interaction) return '';
  if (typeof interaction.output_text === 'string' && interaction.output_text.trim().length > 0) {
    return interaction.output_text;
  }
  if (Array.isArray(interaction.steps)) {
    const trailing = [];
    for (let i = interaction.steps.length - 1; i >= 0; i--) {
      const step = interaction.steps[i];
      if (!step) continue;
      if (step.type === 'model_output') {
        const txt = Array.isArray(step.content)
          ? step.content.filter(c => c && c.type === 'text' && typeof c.text === 'string').map(c => c.text).join('')
          : '';
        trailing.unshift(txt);
      } else if (trailing.length > 0) {
        break;
      }
    }
    return trailing.join('');
  }
  return '';
}

function isSheddableOrTimeoutError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  if (status === 429 || status === 503 || status === 504 || status === 408) return true;
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('high demand') ||
    msg.includes('service_unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('aborted')
  );
}

/**
 * Call the GA Gemini Interactions API via @google/genai.
 * Supports:
 * - 'standard': direct Standard tier
 * - 'flex': Flex tier only (50% discount)
 * - 'flex_with_fallback': tries Flex tier first up to `flexTimeoutMs`, falling back immediately to Standard on 503/429/timeout.
 */
async function callGeminiInteraction({
  apiKey,
  model,
  systemInstruction = null,
  input,
  thinkingLevel = null,
  maxOutputTokens = MIN_THINKING_MAX_OUTPUT_TOKENS,
  jsonMode = true,
  repairJsonArray = false,
  responseSchema = null,
  serviceTierMode = 'standard',
  flexTimeoutMs = 45000,
  timeoutMs = 120000,
  store = false
}) {
  if (!apiKey) {
    throw new Error('Missing Gemini API key');
  }

  const effectiveThinking = normalizeThinkingLevelForModel(model, thinkingLevel);
  const effectiveMaxTokens = normalizeMaxOutputTokens(model, maxOutputTokens);

  const invokeTier = async (tier, budgetMs) => {
    // Flex service_tier uses v1beta when previewed; Standard uses default GA v1
    const client = getGenAiClient(apiKey, tier === 'flex' ? 'v1beta' : undefined);
    const params = {
      model,
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
      input,
      generation_config: {
        max_output_tokens: effectiveMaxTokens,
        ...(effectiveThinking ? { thinking_level: effectiveThinking } : {})
      },
      ...(jsonMode ? {
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          ...(responseSchema ? { schema: responseSchema } : {})
        }
      } : {}),
      ...(tier === 'flex' ? { service_tier: 'flex' } : {}),
      ...(typeof store === 'boolean' ? { store } : {})
    };

    const callPromise = client.interactions.create(params, budgetMs > 0 ? { timeout: budgetMs } : undefined);
    const timeoutGuard = budgetMs > 0
      ? new Promise((_, reject) => setTimeout(() => reject(new Error(`Gemini ${tier} call timed out after ${Math.round(budgetMs / 1000)}s`)), budgetMs + 500))
      : null;

    const interaction = timeoutGuard
      ? await Promise.race([callPromise, timeoutGuard])
      : await callPromise;

    const rawText = extractInteractionText(interaction);
    const usage = interaction?.usage || null;
    if (usage?.total_cached_tokens > 0) {
      console.log(`[Gemini Cache Hit] ${model} (${tier}): ${usage.total_cached_tokens}/${usage.total_input_tokens || '?'} input tokens cached`);
    }

    let parsed = null;
    if (jsonMode) {
      const cleaned = cleanJsonText(rawText, repairJsonArray);
      parsed = JSON.parse(cleaned);
    }

    return {
      text: rawText,
      parsed,
      usage,
      modelUsed: model,
      serviceTierUsed: tier
    };
  };

  if (serviceTierMode === 'flex') {
    return await invokeTier('flex', flexTimeoutMs || timeoutMs);
  }

  if (serviceTierMode === 'flex_with_fallback') {
    const t0 = Date.now();
    try {
      return await invokeTier('flex', flexTimeoutMs);
    } catch (flexErr) {
      if (!isSheddableOrTimeoutError(flexErr)) {
        throw flexErr;
      }
      console.log(`[Gemini Flex -> Standard] ${model} Flex unavailable after ${Date.now() - t0}ms (${String(flexErr.message || '').slice(0, 90)}); falling back to Standard.`);
      return await invokeTier('standard', timeoutMs);
    }
  }

  return await invokeTier('standard', timeoutMs);
}

/**
 * Submit and/or poll an asynchronous Gemini Batch API job (50% cost discount + dedicated Batch rate-limit pool).
 * Ideal for multi-hour/weekly longitudinal archive alignment (`realign-archive.js --batch`) and bulk backfills (`backfill.js --batch`).
 *
 * Each item in `items` should be: `{ key: string, systemInstruction?: string, prompt: string, responseSchema?: object }`
 */
async function runGeminiInlineBatch({
  apiKey,
  model = 'gemini-3.8-flash',
  displayName = 'vibe-o-meter-batch',
  items = [],
  repairJsonArray = false,
  pollIntervalMs = 15000,
  maxWaitMs = 25 * 60 * 1000,
  checkpointFile = null,
  submitOnly = false
}) {
  if (!apiKey) throw new Error('Missing Gemini API key for Batch API');
  const client = getGenAiClient(apiKey, 'v1beta');

  let jobName = null;
  let itemKeys = items.map((it, idx) => it.key || `item_${idx}`);

  if (checkpointFile && fs.existsSync(checkpointFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
      if (saved?.jobName) {
        jobName = saved.jobName;
        if (Array.isArray(saved.itemKeys) && saved.itemKeys.length > 0) {
          itemKeys = saved.itemKeys;
        }
        console.log(`[Gemini Batch] Resuming existing batch job ${jobName} from ${checkpointFile}...`);
      }
    } catch (_) {}
  }

  if (!jobName) {
    if (!Array.isArray(items) || items.length === 0) {
      return { completed: true, resultsByKey: new Map(), jobName: null };
    }
    const effectiveThinking = normalizeThinkingLevelForModel(model, 'low');
    const effectiveMaxTokens = normalizeMaxOutputTokens(model, MIN_THINKING_MAX_OUTPUT_TOKENS);

    const inlinedRequests = items.map((it, idx) => ({
      contents: [{ role: 'user', parts: [{ text: it.prompt }] }],
      metadata: { key: it.key || `item_${idx}` },
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: effectiveMaxTokens,
        ...(it.responseSchema ? { responseSchema: it.responseSchema } : {}),
        ...(it.systemInstruction ? { systemInstruction: { parts: [{ text: it.systemInstruction }] } } : {}),
        ...(effectiveThinking ? { thinkingConfig: { thinkingLevel: effectiveThinking.toUpperCase() } } : {})
      }
    }));

    const created = await client.batches.create({
      model,
      src: inlinedRequests,
      config: { displayName }
    });
    jobName = created.name;
    console.log(`[Gemini Batch] Created batch job ${jobName} (${items.length} requests on ${model}).`);

    if (checkpointFile) {
      fs.writeFileSync(checkpointFile, JSON.stringify({
        jobName,
        model,
        displayName,
        createdAt: new Date().toISOString(),
        itemKeys
      }, null, 2), 'utf8');
    }

    if (submitOnly) {
      return { completed: false, jobName, resultsByKey: new Map() };
    }
  }

  const TERMINAL_STATES = new Set([
    'JOB_STATE_SUCCEEDED',
    'JOB_STATE_FAILED',
    'JOB_STATE_CANCELLED',
    'JOB_STATE_EXPIRED',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED',
    'EXPIRED'
  ]);

  const startWait = Date.now();
  let job = await client.batches.get({ name: jobName });
  while (!TERMINAL_STATES.has(String(job?.state || ''))) {
    const elapsed = Date.now() - startWait;
    if (elapsed >= maxWaitMs) {
      console.log(`[Gemini Batch] Job ${jobName} still ${job?.state} after ${Math.round(elapsed / 1000)}s (saved checkpoint for later pickup).`);
      return { completed: false, jobName, state: job?.state, resultsByKey: new Map() };
    }
    console.log(`[Gemini Batch] ${jobName} state=${job?.state || 'PENDING'} (${Math.round(elapsed / 1000)}s elapsed). Polling again in ${Math.round(pollIntervalMs / 1000)}s...`);
    await new Promise(r => setTimeout(r, pollIntervalMs));
    job = await client.batches.get({ name: jobName });
  }

  const finalState = String(job?.state || '');
  if (!finalState.includes('SUCCEEDED')) {
    if (checkpointFile && fs.existsSync(checkpointFile)) {
      try { fs.unlinkSync(checkpointFile); } catch (_) {}
    }
    throw new Error(`Gemini Batch job ${jobName} ended in state ${finalState}`);
  }

  const inlinedResponses = job?.dest?.inlinedResponses || job?.dest?.inlined_responses || [];
  const resultsByKey = new Map();
  inlinedResponses.forEach((entry, idx) => {
    const key = entry?.metadata?.key || itemKeys[idx] || `item_${idx}`;
    const respObj = entry?.response;
    const rawText = respObj?.text ||
      respObj?.candidates?.[0]?.content?.parts?.find(p => p?.text && !p?.thought)?.text ||
      respObj?.candidates?.[0]?.content?.parts?.[0]?.text ||
      '';
    if (!rawText) return;
    try {
      const cleaned = cleanJsonText(rawText, repairJsonArray);
      resultsByKey.set(key, JSON.parse(cleaned));
    } catch (e) {
      console.warn(`[Gemini Batch] Failed to parse JSON for key "${key}":`, e.message);
    }
  });

  if (checkpointFile && fs.existsSync(checkpointFile)) {
    try { fs.unlinkSync(checkpointFile); } catch (_) {}
  }

  console.log(`[Gemini Batch] Job ${jobName} SUCCEEDED (${resultsByKey.size}/${itemKeys.length} responses parsed).`);
  return { completed: true, jobName, state: finalState, resultsByKey };
}

module.exports = {
  MIN_THINKING_MAX_OUTPUT_TOKENS,
  normalizeThinkingLevelForModel,
  normalizeMaxOutputTokens,
  tryRepairJsonArray,
  cleanJsonText,
  callGeminiInteraction,
  runGeminiInlineBatch
};
