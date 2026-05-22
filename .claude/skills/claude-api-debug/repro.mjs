/**
 * Minimal reproduction script for Anthropic Claude API issues (Node 18+).
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   node repro.mjs
 *
 * Tweak MODEL, MAX_TOKENS, and MESSAGES to match the failing call EXACTLY.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1024;
const MESSAGES = [{ role: "user", content: "Say hello in one short sentence." }];

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}

// 10-minute SDK timeout. SDK retries 5xx/429/connection errors automatically.
const client = new Anthropic({ timeout: 600_000, maxRetries: 2 });

const t0 = performance.now();
try {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: MESSAGES,
  });
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`OK in ${elapsed}s`);
  console.log(`  model:  ${resp.model}`);
  console.log(`  usage:  in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`);
  console.log(`  stop:   ${resp.stop_reason}`);
  const text = resp.content[0]?.type === "text" ? resp.content[0].text : "(no text)";
  console.log(`  text:   ${text.slice(0, 200)}`);
} catch (e) {
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`FAILED after ${elapsed}s`);
  console.log(`  name:    ${e.name}`);
  console.log(`  message: ${e.message}`);
  if (e.status) console.log(`  status:  ${e.status}`);
  if (e.error) console.log(`  body:    ${JSON.stringify(e.error)}`);
}
