---
name: claude-api-debug
description: |
  Use this skill whenever the user reports that calls to the Anthropic Claude API
  (api.anthropic.com, /v1/messages endpoint, anthropic SDK) are hanging, timing out,
  returning 500/529/overloaded, getting rate-limited (429), responding too slowly,
  or producing unexpected errors. Triggers: any mention of "Claude API", "anthropic
  SDK", "/v1/messages", "claude is slow", "claude timeout", "claude hangs", "API
  таймаут", "API падает", "клод апишка", combined with words like timeout, hang,
  slow, fail, error, 500, 529, 429, overloaded, retry. Do NOT use this skill for
  questions about Anthropic pricing, model selection, or non-API Claude products
  (Claude.ai web, Claude Code itself).
---

# Claude API Debug Protocol

You are debugging a problem with calls to the Anthropic Claude API. Most of these
bugs are NOT bugs in user code — they are configuration mismatches between the
API's response latency and the client/infrastructure timeout. Do not guess at fixes.
Follow this protocol in order. Skipping steps makes you fix the wrong thing.

## The Cardinal Rule

**Reproduce the bug in a minimal standalone script before changing any code.**

If you cannot reproduce it standalone, you do not understand it, and any fix you
propose is a guess. A 10-line script that hits the same API with the same payload
is non-negotiable.

## Step 1 — Categorize the failure mode

Ask the user (or determine from logs) which of these is happening:

| Symptom | Most likely cause |
|---|---|
| Client error after a fixed time (5s, 10s, 30s, 60s) | Client / infra timeout, NOT the API |
| `anthropic.APITimeoutError` after ~10 min | SDK default timeout, real long generation |
| 429 `rate_limit_error` | Token-per-minute or request-per-minute limit |
| 529 `overloaded_error` | Anthropic-side load, retry with backoff |
| 500 `api_error` | Rare, transient — retry |
| 400 `invalid_request_error` | Payload bug — read the error `message` |
| Hangs forever, no error | No timeout configured on HTTP client |

The fixed-time-failure case is by far the most common and is almost always
infrastructure, not API.

## Step 2 — Build the minimal repro

Create `repro.py` (or `repro.mjs`) that:

1. Loads `ANTHROPIC_API_KEY` from env
2. Makes the same call the failing code makes (same model, same messages, same
   `max_tokens`, same tools/system prompt if any)
3. Wraps the call in `time.perf_counter()` / `performance.now()` to print elapsed
4. Enables debug logging

Python template:

```python
import os, time, logging
from anthropic import Anthropic

logging.basicConfig(level=logging.DEBUG)
client = Anthropic(timeout=600.0, max_retries=2)

t0 = time.perf_counter()
try:
    resp = client.messages.create(
        model="claude-opus-4-7",          # use the EXACT model from the failing code
        max_tokens=1024,                  # use the EXACT value from the failing code
        messages=[{"role": "user", "content": "ping"}],
    )
    print(f"OK in {time.perf_counter()-t0:.2f}s, {resp.usage}")
except Exception as e:
    print(f"FAILED after {time.perf_counter()-t0:.2f}s: {type(e).__name__}: {e}")
```

Node template:

```javascript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ timeout: 600_000, maxRetries: 2 });

const t0 = performance.now();
try {
  const resp = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    messages: [{ role: "user", content: "ping" }],
  });
  console.log(`OK in ${((performance.now()-t0)/1000).toFixed(2)}s`, resp.usage);
} catch (e) {
  console.log(`FAILED after ${((performance.now()-t0)/1000).toFixed(2)}s:`, e);
}
```

Run it. Three outcomes:

- **Works fine** → bug is in the user's code, framework, or infrastructure, NOT in
  the API call itself. Go to Step 3a.
- **Same failure** → bug is in how the API is being called (payload, model, tokens,
  client config). Go to Step 3b.
- **Different failure** → write down both error signatures; the difference is the
  clue (different env vars, different network, different SDK version).

## Step 3a — Reproduction passes, real code fails

The repro works but the real app fails. The API is fine. The problem is one of:

1. **Infrastructure timeout cutting off the request.** Check every layer:
   - Serverless platform limits: AWS Lambda default 3s (max 15min), Vercel Hobby
     10s / Pro 60s / Enterprise 900s, Cloudflare Workers 30s CPU / unlimited wall.
     If the API call takes longer than the platform allows, the platform kills it.
   - Reverse proxy timeouts: nginx default `proxy_read_timeout 60s`, Cloudflare
     free 100s, AWS ALB default 60s. Raise them or use streaming.
   - Framework timeouts: FastAPI/Starlette have no default; gunicorn worker timeout
     is 30s; uvicorn `--timeout-keep-alive` is 5s but doesn't affect long requests.
2. **HTTP client timeout, not SDK timeout.** The Anthropic SDK has a sensible
   default, but if user code wraps it in `httpx`, `requests`, or `aiohttp` with
   a short timeout, that wins.
3. **Connection pool exhaustion.** Many concurrent requests, small pool → requests
   queue and time out waiting for a connection, not waiting for the API.
4. **Wrong API key / billing issue.** A free-tier key on Opus will silently get
   rate-limited harder than expected. Check the dashboard.

For all of these: **the fix is configuration, not code logic.**

## Step 3b — Reproduction also fails

The API call itself is the problem. Diagnose by payload:

1. **`max_tokens` too large.** A request for 4096+ output tokens on Opus can take
   60–120s. If your timeout is shorter, lower `max_tokens` or use streaming
   (`stream=True`). Never use non-streaming for `max_tokens > 4096`.
2. **Long input.** 200K+ token contexts use long-context pricing AND latency. First
   token can be 30–60s out. Use streaming so you see progress.
3. **Extended thinking enabled.** Thinking budget eats wall time before any output
   token appears. If you have `thinking={"type": "enabled", "budget_tokens": N}`,
   N adds directly to latency.
4. **Tool use loops.** If the model returns `tool_use`, you run the tool, send
   back `tool_result`, and the cycle continues. Each round-trip is its own
   latency. Time each round separately.
5. **Wrong model string.** Typo in model name → 404, but some libraries swallow
   that as a generic error. Verify the model id is one of the current valid ones:
   `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`.

## Step 4 — Apply the right fix

Match the fix to the diagnosis. **Do not apply multiple fixes at once** — you
won't know which one worked, and you'll cargo-cult them into the next codebase.

### Fix A: Enable streaming

For any request where output is large or latency-sensitive:

```python
with client.messages.stream(
    model="claude-opus-4-7",
    max_tokens=4096,
    messages=[...],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    final = stream.get_final_message()
```

Streaming keeps the TCP connection active, defeats almost all idle-timeout
middleboxes, and lets you cancel cleanly.

### Fix B: Set explicit timeouts

```python
client = Anthropic(timeout=600.0, max_retries=2)
# or per-request:
client.messages.create(..., timeout=300.0)
```

The SDK retries 5xx / 429 / connection errors automatically with exponential
backoff. Don't write your own retry on top — you'll double-retry.

### Fix C: Move long calls off the request path

If you're in a 10–60s serverless context but the call takes longer, the request
path is the wrong place. Use a background job (queue + worker) and have the
frontend poll for the result. This is an architecture change, not a config tweak.

### Fix D: Batch API for non-realtime work

If the work doesn't need to be synchronous (overnight processing, bulk
classification, etc.), use the Batch API: 50% cheaper, runs within 24h, no
timeout pressure at all.

## Step 5 — Lock in the fix with a test

Once a fix works, write a test that would catch the regression:

```python
def test_long_generation_does_not_timeout():
    """Regression: max_tokens=4096 used to fail with ReadTimeout."""
    client = Anthropic(timeout=600.0)
    with client.messages.stream(
        model="claude-haiku-4-5-20251001",   # use cheap model in tests
        max_tokens=4096,
        messages=[{"role": "user", "content": "Count from 1 to 200 slowly."}],
    ) as stream:
        chunks = list(stream.text_stream)
    assert len(chunks) > 10  # we actually streamed
```

Use Haiku in tests — same surface, 5× cheaper.

## What NOT to do

- **Do not** add a `try/except` that swallows the error and returns a fallback
  string. That makes the bug invisible and degrades silently in prod.
- **Do not** raise the timeout to "a really big number" without understanding why
  the call is slow. A 10-minute timeout on a 200ms request that's actually
  failing for an unrelated reason just delays the failure.
- **Do not** add your own retry loop on top of the SDK's built-in retries. Double
  retries cause double rate-limit hits.
- **Do not** trust "it worked before" claims without checking the SDK version,
  model id, and `max_tokens` haven't changed. The Opus 4.7 tokenizer change in
  Feb 2026 made some prompts produce up to 35% more tokens — that's enough to
  push past a previously-OK timeout.

## Quick reference: error → first thing to check

| Error | First check |
|---|---|
| `APITimeoutError` | Is `max_tokens` huge? Should you be streaming? |
| `ReadTimeout` / `ETIMEDOUT` | Client HTTP timeout, not API. Raise it or stream. |
| 429 `rate_limit_error` | Look at `retry-after` header; respect it |
| 529 `overloaded_error` | Wait + retry, it's Anthropic-side; switch to lower-traffic region/model |
| 500 / 503 | Transient. SDK will retry. If it doesn't recover in 3 tries, escalate. |
| 400 `invalid_request_error` | Read `error.message` — it tells you the exact field |
| 401 | API key wrong/missing/revoked |
| Hangs forever | No timeout set anywhere. Set one immediately. |

## Reference

- SDK timeouts and retries: https://docs.claude.com/en/api/client-sdks
- Streaming: https://docs.claude.com/en/api/streaming
- Errors: https://docs.claude.com/en/api/errors
- Rate limits: https://docs.claude.com/en/api/rate-limits
- Batch API: https://docs.claude.com/en/api/creating-message-batches
