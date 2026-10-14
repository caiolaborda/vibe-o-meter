const fs = require('fs');
const path = require('path');
require('dotenv').config();

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/data.json'), 'utf8'));

let geminiCount = 0;
let otherCount = 0;
const scores = [];
const categoryStats = {};
const extremePos = [];
const extremeNeg = [];
const neutral = [];
const potentialFalsePositives = [];
const potentialFalseNegatives = [];

const TRAGEDY_WORDS = /\b(killed|killing|murder|murdered|dead|fatal|death|strike|strikes|bomb|bombed|missile|cancer|dying|crash|crashed|fire|explosion|war|hostage|slain|rape|predator|attack|attacked|arrested)\b/i;
const POSITIVE_WORDS = /\b(cure|cured|breakthrough|peace|treaty|rescued|saved|recovery|recovers|triumph|solution|clean energy|thriving|record high|milestone)\b/i;

for (const [srcId, src] of Object.entries(data.sources || {})) {
  for (const a of (src.articles || [])) {
    const score = a.sentimentGemini ?? a.sentiment;
    if (typeof score === 'number') {
      geminiCount++;
      scores.push(score);
      const cat = a.category || 'other';
      if (!categoryStats[cat]) categoryStats[cat] = [];
      categoryStats[cat].push(score);

      if (score >= 0.55) extremePos.push({ srcId, title: a.title, score, exp: a.explanation || a.explanationGemini });
      if (score <= -0.65) extremeNeg.push({ srcId, title: a.title, score, exp: a.explanation || a.explanationGemini });
      if (Math.abs(score) <= 0.08) neutral.push({ srcId, title: a.title, score, exp: a.explanation || a.explanationGemini });

      // Check anomalies
      if (score > 0.15 && TRAGEDY_WORDS.test(a.title)) {
        potentialFalsePositives.push({ srcId, title: a.title, score, exp: a.explanation || a.explanationGemini });
      }
      if (score < -0.2 && POSITIVE_WORDS.test(a.title)) {
        potentialFalseNegatives.push({ srcId, title: a.title, score, exp: a.explanation || a.explanationGemini });
      }
    } else {
      otherCount++;
    }
  }
}

scores.sort((a, b) => a - b);
const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

console.log('====================================================');
console.log('         AI SENTIMENT GRADING AUDIT REPORT          ');
console.log('====================================================');
console.log(`Total Articles Analyzed : ${geminiCount}`);
console.log(`Mean Global Sentiment   : ${avg.toFixed(3)} (Benchmark: commercial news typically sits between -0.18 and -0.26)`);
console.log(`Median Sentiment        : ${scores[Math.floor(scores.length / 2)].toFixed(2)}`);
console.log(`Min Score / Max Score   : ${scores[0].toFixed(2)} / ${scores[scores.length - 1].toFixed(2)}`);

console.log('\n--- Valence Distribution ---');
const severeNeg = scores.filter(s => s <= -0.5).length;
const moderateNeg = scores.filter(s => s > -0.5 && s < -0.15).length;
const neutralBand = scores.filter(s => s >= -0.15 && s <= 0.15).length;
const moderatePos = scores.filter(s => s > 0.15 && s < 0.5).length;
const strongPos = scores.filter(s => s >= 0.5).length;

console.log(`Severe Crisis (-1.0 to -0.50)  : ${severeNeg} (${((severeNeg/scores.length)*100).toFixed(1)}%)`);
console.log(`Moderate Gloom (-0.50 to -0.15): ${moderateNeg} (${((moderateNeg/scores.length)*100).toFixed(1)}%)`);
console.log(`Neutral Band (-0.15 to +0.15)  : ${neutralBand} (${((neutralBand/scores.length)*100).toFixed(1)}%)`);
console.log(`Constructive (+0.15 to +0.50)  : ${moderatePos} (${((moderatePos/scores.length)*100).toFixed(1)}%)`);
console.log(`High Optimism (+0.50 to +1.00) : ${strongPos} (${((strongPos/scores.length)*100).toFixed(1)}%)`);

console.log('\n--- Category Averages ---');
for (const [cat, list] of Object.entries(categoryStats).sort((a,b) => (a[1].reduce((x,y)=>x+y,0)/a[1].length) - (b[1].reduce((x,y)=>x+y,0)/b[1].length))) {
  const m = list.reduce((a, b) => a + b, 0) / list.length;
  console.log(`  ${cat.padEnd(14)} (n=${String(list.length).padStart(4)}): ${m >= 0 ? '+' : ''}${m.toFixed(3)}`);
}

console.log('\n--- Sample Top Positive Stories ---');
extremePos.slice(0, 4).forEach((x, i) => {
  console.log(`  [+${x.score.toFixed(2)}] [${x.srcId}] ${x.title}`);
  if (x.exp) console.log(`      Reasoning: "${x.exp.slice(0, 120)}..."`);
});

console.log('\n--- Sample Top Negative Stories ---');
extremeNeg.slice(0, 4).forEach((x, i) => {
  console.log(`  [${x.score.toFixed(2)}] [${x.srcId}] ${x.title}`);
  if (x.exp) console.log(`      Reasoning: "${x.exp.slice(0, 120)}..."`);
});

console.log('\n--- Anomaly Scan: Potential False Positives (Tragedy keywords with > +0.15 score) ---');
if (potentialFalsePositives.length === 0) {
  console.log('  None found! Zero tragedy keywords detected in positive scores.');
} else {
  console.log(`  Found ${potentialFalsePositives.length} potential items to review:`);
  potentialFalsePositives.slice(0, 5).forEach(x => {
    console.log(`  [+${x.score.toFixed(2)}] [${x.srcId}] ${x.title}\n      Reasoning: ${x.exp}`);
  });
}

console.log('\n--- Anomaly Scan: Potential False Negatives (Positive keywords with < -0.2 score) ---');
if (potentialFalseNegatives.length === 0) {
  console.log('  None found!');
} else {
  console.log(`  Found ${potentialFalseNegatives.length} potential items to review:`);
  potentialFalseNegatives.slice(0, 5).forEach(x => {
    console.log(`  [${x.score.toFixed(2)}] [${x.srcId}] ${x.title}\n      Reasoning: ${x.exp}`);
  });
}

async function runGeminiSelfAudit() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('\n[Gemini AI Check] GEMINI_API_KEY not found in env, skipping live LLM meta-audit.');
    return;
  }

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Pick 10 diverse test cases across positive, negative, and neutral
    const testCases = [
      ...extremePos.slice(0, 4),
      ...extremeNeg.slice(0, 4),
      ...neutral.slice(0, 3)
    ];

    const prompt = `You are a Senior Editor and Lead Data Scientist auditing news sentiment scoring consistency.
We use a continuous valence scale from -1.00 (extreme catastrophe, fatal disaster, severe existential threat) to +1.00 (transformative breakthrough, peace milestone, systemic disease cure).
0.00 is neutral/factual reporting without emotional spin.

Evaluate the following sample of articles scored by our Gemini sentiment pipeline.
For each item, assess whether:
1. The valence direction (positive / neutral / negative) is accurate.
2. The score magnitude is proportional to real-world consequence.
3. The reasoning is sound.

Sample to audit:
${JSON.stringify(testCases.map((tc, idx) => ({ id: idx + 1, source: tc.srcId, title: tc.title, score: tc.score, explanation: tc.exp })), null, 2)}

Provide a concise meta-audit summary:
- Overall consistency score (1-10)
- Directional accuracy assessment
- Magnitude calibration assessment
- Any systematic biases detected
- Final verdict`;

    console.log('\n--- Running Gemini Meta-Audit LLM Check ---');
    const result = await model.generateContent(prompt);
    console.log(result.response.text());
  } catch (err) {
    console.warn('[Gemini AI Check] Could not complete live audit:', err.message);
  }
}

runGeminiSelfAudit();
