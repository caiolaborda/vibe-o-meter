'use strict';

/**
 * Shared Gemini Interactions API + Flex Inference + Batch API Client
 * Built on @google/genai >= 3.2.0 (GA Interactions API on v1 + Batch API on v1beta).
 * Replaces legacy @google/generative-ai and generateContent calls across all Vibe-O-Meter pipelines.
 */

const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const MIN_THINKING_MAX_OUTPUT_TOKENS = 32768;
const _flexCongestedByModel = new Map();
const _spendCappedKeys = new Set();

function isKeySpendCapped(apiKey) {
  return Boolean(apiKey && _spendCappedKeys.has(apiKey));
}

// Cache SDK client instances by apiKey + apiVersion
const _clientCache = new Map();
function getGenAiClient(apiKey, apiVersion = undefined) {
  const cacheKey = `${apiKey}::${apiVersion || 'default'}`;
  if (!_clientCache.has(cacheKey)) {
    const opts = {
      apiKey,
      httpOptions: {
        retryOptions: { attempts: 1 }
      }
    };
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
    m.includes('3.6-flash') ||
    m.includes('gemini-3-flash-preview')
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

function isFlexFallbackEligibleError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (
    msg.includes('spending cap') ||
    msg.includes('spend cap') ||
    msg.includes('requests per day') ||
    msg.includes('per_day')
  ) {
    return false;
  }
  if (isSheddableOrTimeoutError(err)) return true;
  const status = err?.status || err?.statusCode || 0;
  if (status === 400 || status === 403 || status === 404) {
    return (
      msg.includes('service_tier') ||
      msg.includes('service tier') ||
      msg.includes('flex') ||
      msg.includes('not supported') ||
      msg.includes('not available') ||
      msg.includes('permission_denied') ||
      msg.includes('invalid_argument')
    );
  }
  return msg.includes('service_tier') || msg.includes('flex');
}

/**
 * Call the GA Gemini Interactions API via @google/genai.
 * Supports:
 * - 'standard': direct Standard tier
 * - 'flex': Flex tier only (50% discount)
 * - 'flex_with_fallback': tries Flex tier first up to `flexTimeoutMs`, falling back immediately to Standard on 503/429/timeout or unsupported tier errors.
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
  if (_spendCappedKeys.has(apiKey)) {
    const capErr = new Error('Your project has exceeded its monthly spending cap (cached circuit-breaker)');
    capErr.status = 429;
    throw capErr;
  }

  const effectiveThinking = normalizeThinkingLevelForModel(model, thinkingLevel);
  const effectiveMaxTokens = normalizeMaxOutputTokens(model, maxOutputTokens);

  const invokeTier = async (tier, budgetMs, queueBudgetMs = 0) => {
    // Flex service_tier and *-preview models require v1beta; GA Standard models use default GA v1
    const needsV1Beta = tier === 'flex' || String(model || '').toLowerCase().includes('preview');
    const client = getGenAiClient(apiKey, needsV1Beta ? 'v1beta' : undefined);
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
      ...(typeof store === 'boolean' ? { store } : {}),
      stream: true
    };

    const abortCtrl = new AbortController();
    let totalTimer = null;
    let queueTimer = null;
    let idleTimer = null;
    let completedOk = false;
    const IDLE_STALL_MS = 45000;

    const resetIdleTimer = (rejectFn) => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        rejectFn(new Error(`Gemini ${tier} stream stalled after ${Math.round(IDLE_STALL_MS / 1000)}s without events`));
      }, IDLE_STALL_MS);
    };

    try {
      const streamOutcome = await new Promise((resolve, reject) => {
        let settled = false;
        const safeReject = (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        };
        const safeResolve = (val) => {
          if (settled) return;
          settled = true;
          resolve(val);
        };

        if (budgetMs > 0) {
          totalTimer = setTimeout(() => {
            safeReject(new Error(`Gemini ${tier} call timed out after ${Math.round(budgetMs / 1000)}s`));
          }, budgetMs + 500);
        }

        if (queueBudgetMs > 0) {
          queueTimer = setTimeout(() => {
            safeReject(new Error(`Gemini ${tier} queue timed out after ${Math.round(queueBudgetMs / 1000)}s before first token`));
          }, queueBudgetMs);
        }

        (async () => {
          try {
            const reqOpts = {
              maxRetries: 0,
              signal: abortCtrl.signal,
              ...(budgetMs > 0 ? { timeout: budgetMs } : {})
            };
            const stream = await client.interactions.create(params, reqOpts);
            let accText = '';
            let completedInteraction = null;
            let workerStarted = false;

            for await (const rawEv of stream) {
              if (settled) break;
              const ev = (rawEv && rawEv.data && rawEv.data.event_type) ? rawEv.data : rawEv;
              if (!ev) continue;

              const evType = ev.event_type || '';
              if (evType === 'error' || evType === 'interaction.failed' || ev.interaction?.status === 'failed') {
                const errPayload = ev.error || ev.interaction?.error || ev;
                const errMsg = typeof errPayload === 'string'
                  ? errPayload
                  : (errPayload?.message || JSON.stringify(errPayload));
                const sseErr = new Error(`Gemini ${tier} error: ${errMsg}`);
                const rawCode = Number(errPayload?.code || errPayload?.status);
                sseErr.status = Number.isFinite(rawCode) && rawCode >= 400 ? rawCode : 503;
                throw sseErr;
              }

              if (!workerStarted && (evType === 'step.start' || evType === 'step.delta')) {
                workerStarted = true;
                if (queueTimer) {
                  clearTimeout(queueTimer);
                  queueTimer = null;
                }
              }
              if (workerStarted) {
                resetIdleTimer(safeReject);
              }

              if (evType === 'step.delta' && ev.delta?.type === 'text' && typeof ev.delta.text === 'string') {
                accText += ev.delta.text;
              } else if (evType === 'interaction.completed') {
                completedInteraction = ev.interaction || null;
              }
            }

            safeResolve({ accText, completedInteraction });
          } catch (innerErr) {
            const em = String(innerErr?.message || innerErr || '').toLowerCase();
            if (em.includes('spending cap') || em.includes('spend cap')) {
              _spendCappedKeys.add(apiKey);
            }
            safeReject(innerErr);
          }
        })();
      });

      completedOk = true;
      const rawText = (streamOutcome.accText && streamOutcome.accText.trim().length > 0)
        ? streamOutcome.accText
        : extractInteractionText(streamOutcome.completedInteraction);
      const usage = streamOutcome.completedInteraction?.usage || null;
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
    } finally {
      if (totalTimer) clearTimeout(totalTimer);
      if (queueTimer) clearTimeout(queueTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (!completedOk) {
        try { abortCtrl.abort(); } catch (_) {}
      }
    }
  };

  if (serviceTierMode === 'flex') {
    return await invokeTier('flex', timeoutMs || flexTimeoutMs, 0);
  }

  if (serviceTierMode === 'flex_with_fallback') {
    const modelCongestedUntil = _flexCongestedByModel.get(model) || 0;
    if (Date.now() < modelCongestedUntil) {
      return await invokeTier('standard', timeoutMs, 0);
    }
    const queueBudgetMs = Math.min(Math.max(Number(flexTimeoutMs) || 45000, 12000), 65000);
    const t0 = Date.now();
    try {
      return await invokeTier('flex', timeoutMs, queueBudgetMs);
    } catch (flexErr) {
      if (!isFlexFallbackEligibleError(flexErr)) {
        throw flexErr;
      }
      _flexCongestedByModel.set(model, Date.now() + 3 * 60 * 1000);
      console.log(`[Gemini Flex -> Standard] ${model} Flex unavailable after ${Date.now() - t0}ms (${String(flexErr.message || '').slice(0, 100)}); cooling down Flex on ${model} for 3m and falling back to Standard.`);
      return await invokeTier('standard', timeoutMs, 0);
    }
  }

  return await invokeTier('standard', timeoutMs, 0);
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
  isKeySpendCapped,
  normalizeThinkingLevelForModel,
  normalizeMaxOutputTokens,
  tryRepairJsonArray,
  cleanJsonText,
  callGeminiInteraction,
  runGeminiInlineBatch
};
