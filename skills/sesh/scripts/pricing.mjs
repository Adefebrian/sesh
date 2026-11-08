// API list prices in USD per 1M tokens, standard tier.
// Sources (checked 2026-11-08):
//   https://platform.claude.com/docs/en/about-claude/pricing
//   https://developers.openai.com/api/docs/pricing
// A model that is not listed here is reported as unpriced, never guessed.

export const PRICES_CHECKED = "2026-11-08";

// in, out, w5 (5m cache write), w1h (1h cache write), hit (cache read)
const CLAUDE = {
  "claude-fable-5-1":  { in: 10, out: 50, w5: 12.5, w1h: 20, hit: 0.25 },
  "claude-mythos-5-1": { in: 10, out: 50, w5: 12.5, w1h: 20, hit: 0.25 },
  "claude-fable-5":    { in: 10, out: 50, w5: 12.5, w1h: 20, hit: 1 },
  "claude-mythos-5":   { in: 10, out: 50, w5: 12.5, w1h: 20, hit: 1 },
  "claude-opus-5-5":   { in: 4, out: 20, w5: 5, w1h: 8, hit: 0.2, fast: 2 },
  "claude-opus-5":     { in: 5, out: 25, w5: 6.25, w1h: 10, hit: 0.5, fast: 2 },
  "claude-opus-4-8":   { in: 5, out: 25, w5: 6.25, w1h: 10, hit: 0.5, fast: 2 },
  "claude-opus-4-7":   { in: 5, out: 25, w5: 6.25, w1h: 10, hit: 0.5 },
  "claude-opus-4-6":   { in: 5, out: 25, w5: 6.25, w1h: 10, hit: 0.5 },
  "claude-opus-4-5":   { in: 5, out: 25, w5: 6.25, w1h: 10, hit: 0.5 },
  "claude-opus-4-1":   { in: 15, out: 75, w5: 18.75, w1h: 30, hit: 1.5 },
  "claude-opus-4":     { in: 15, out: 75, w5: 18.75, w1h: 30, hit: 1.5 },
  "claude-sonnet-5-5": { in: 2, out: 10, w5: 2.5, w1h: 4, hit: 0.1 },
  "claude-sonnet-5":   { in: 2, out: 10, w5: 2.5, w1h: 4, hit: 0.2 },
  "claude-sonnet-4-6": { in: 3, out: 15, w5: 3.75, w1h: 6, hit: 0.3 },
  "claude-sonnet-4-5": { in: 3, out: 15, w5: 3.75, w1h: 6, hit: 0.3 },
  "claude-sonnet-4":   { in: 3, out: 15, w5: 3.75, w1h: 6, hit: 0.3 },
  "claude-haiku-5-5":  { in: 0.1, out: 0.5, w5: 0.125, w1h: 0.2, hit: 0.01,
                         over: { at: 100000, in: 0.5, out: 2.5, w5: 0.625, w1h: 1, hit: 0.05 } },
  "claude-haiku-4-5":  { in: 1, out: 5, w5: 1.25, w1h: 2, hit: 0.1 },
};

// in, cached, out, w (30m cache write); long = price above `at` prompt tokens
const OPENAI = {
  "gpt-6-astra":   { in: 10, cached: 1, out: 50, w: 12.5 },
  "gpt-6.1-sol":   { in: 2, cached: 0.1, out: 10, w: 2.5 },
  "gpt-6.1-terra": { in: 1, cached: 0.05, out: 5, w: 1.25 },
  "gpt-6-luna":    { in: 0.1, cached: 0.01, out: 0.5, w: 0.125 },
  "gpt-6-sol":     { in: 2, cached: 0.2, out: 10, w: 2.5 },
  "gpt-5.6-sol":   { in: 4, cached: 0.4, out: 20, w: 5 },
  "gpt-5.6-terra": { in: 2, cached: 0.2, out: 12, w: 2.5 },
  "gpt-5.6-luna":  { in: 0.2, cached: 0.02, out: 1.2, w: 0.25 },
  "gpt-5.5":       { in: 5, cached: 0.5, out: 30, long: { at: 272000, in: 10, cached: 1, out: 45 } },
  "gpt-5.4":       { in: 2.5, cached: 0.25, out: 15, long: { at: 272000, in: 5, cached: 0.5, out: 22.5 } },
  "gpt-5.4-mini":  { in: 0.75, cached: 0.075, out: 4.5 },
  "gpt-5.4-nano":  { in: 0.2, cached: 0.02, out: 1.25 },
  "gpt-5.3-codex": { in: 1.75, cached: 0.175, out: 14 },
  "gpt-5.2":       { in: 1.75, cached: 0.175, out: 14 },
  "gpt-5.1":       { in: 1.25, cached: 0.125, out: 10 },
  "gpt-5":         { in: 1.25, cached: 0.125, out: 10 },
  "gpt-5-mini":    { in: 0.25, cached: 0.025, out: 2 },
  "gpt-5-nano":    { in: 0.05, cached: 0.005, out: 0.4 },
  "gpt-4.1":       { in: 2, cached: 0.5, out: 8 },
  "gpt-4.1-mini":  { in: 0.4, cached: 0.1, out: 1.6 },
  "gpt-4o":        { in: 2.5, cached: 1.25, out: 10 },
  "gpt-4o-mini":   { in: 0.15, cached: 0.075, out: 0.6 },
  "o3":            { in: 2, cached: 0.5, out: 8 },
};

// "claude-opus-5-5-20261001" or "claude-opus-5-5[1m]" -> "claude-opus-5-5"
function lookup(table, model) {
  if (!model) return null;
  const m = String(model).toLowerCase().replace(/\[.*\]$/, "").replace(/-\d{8}$/, "");
  if (table[m]) return table[m];
  // longest key that the id starts with, so "gpt-5.4-mini" never falls back to "gpt-5.4"
  const key = Object.keys(table).filter((k) => m.startsWith(k + "-") || m === k).sort((a, b) => b.length - a.length)[0];
  return key ? table[key] : null;
}

const M = 1e6;

// One Claude API response. Returns USD, or null when the model has no known price.
export function claudeCost(model, u) {
  const p0 = lookup(CLAUDE, model);
  if (!p0) return null;
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  const input = u.input_tokens ?? 0;
  const prompt = input + read + write;
  const p = p0.over && prompt > p0.over.at ? { ...p0, ...p0.over } : p0;
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const w5 = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : write; // no split: 5m default
  let usd = (input * p.in + (u.output_tokens ?? 0) * p.out + read * p.hit + w5 * p.w5 + w1h * p.w1h) / M;
  if (u.speed === "fast") {
    if (!p.fast) return null; // fast mode on a model without a published fast price
    usd *= p.fast;
  }
  return usd;
}

// One Codex/OpenAI request (last_token_usage). input_tokens already includes cached tokens.
export function openaiCost(model, u) {
  const p0 = lookup(OPENAI, model);
  if (!p0) return null;
  const input = u.input_tokens ?? 0;
  const cached = u.cached_input_tokens ?? 0;
  const write = u.cache_write_input_tokens ?? 0;
  const p = p0.long && input > p0.long.at ? { ...p0, ...p0.long } : p0;
  if (write && p.w == null) return null;
  const fresh = Math.max(0, input - cached - write);
  return (fresh * p.in + cached * p.cached + write * (p.w ?? 0) + (u.output_tokens ?? 0) * p.out) / M;
}
