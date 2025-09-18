// Gemini utility wrappers
// Uses @google/generative-ai when GEMINI_API_KEY is present, otherwise returns simple fallbacks

let genAI = null;
try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch (_) {
  // library not installed yet
}

function isReady() {
  return Boolean(genAI);
}

async function summarizeText(text) {
  if (!isReady()) {
    return text.length > 220 ? text.slice(0, 200) + '…' : text;
  }
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Summarize the following document in 3-5 bullet points:\n\n${text}`;
    const result = await model.generateContent(prompt);
    const resp = await result.response;
    return resp.text();
  } catch (err) {
    // Fallback on any API error
    return text.length > 220 ? text.slice(0, 200) + '…' : text;
  }
}

async function generateTags(text, count = 5) {
  const naive = () => {
    const words = (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([w]) => w);
  };
  if (!isReady()) return naive();
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Read the content and return ${count} concise single-word or short-phrase tags as a JSON array of strings only. Content:\n\n${text}`;
    const result = await model.generateContent(prompt);
    const resp = await result.response;
    const txt = resp.text().trim();
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) return parsed.map(String).slice(0, count);
    } catch (_) {}
    // fallback: split by commas/newlines if LLM responded with plain text
    return txt
      .replace(/^[\[\]]/g, '')
      .split(/[",\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, count);
  } catch (_) {
    return naive();
  }
}

async function embedText(text) {
  if (!isReady()) {
    // simple deterministic fallback embedding (hash -> vector)
    const vec = new Array(64).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      vec[i % 64] = (vec[i % 64] + code) % 1000;
    }
    return vec.map((v) => v / 1000);
  }
  // Use text-embedding-004 if available
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const res = await model.embedContent(text);
  return res.embedding.values || [];
}

function cosineSim(a = [], b = []) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function answerQuestion(question, docs = []) {
  if (!docs.length) return 'No relevant documents found.';
  if (!isReady()) {
    // naive fallback: return the title of the most similar document
    return `Based on available docs, likely relevant: ${docs[0].title}`;
  }
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const context = docs
      .slice(0, 5)
      .map((d, i) => `Doc ${i + 1} - Title: ${d.title}\nSummary: ${d.summary}\nContent: ${d.content.slice(0, 1500)}`)
      .join('\n\n');
    const prompt = `You are an AI assistant answering questions using ONLY the provided team documents.\n\nContext:\n${context}\n\nQuestion: ${question}\n\nGive a concise, accurate answer. If insufficient context, say so and suggest next steps.`;
    const result = await model.generateContent(prompt);
    const resp = await result.response;
    return resp.text();
  } catch (_) {
    return `Based on available docs, likely relevant: ${docs[0].title}`;
  }
}

module.exports = { summarizeText, generateTags, embedText, cosineSim, answerQuestion };
