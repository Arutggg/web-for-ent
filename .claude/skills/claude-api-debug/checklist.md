# Pre-flight checklist — answer these BEFORE asking Claude to fix the bug

The 6 questions whose answers determine the entire fix. If you don't know any of
these, you're guessing.

1. **What's the exact error class / status code?**
   `APITimeoutError`, `ReadTimeout`, HTTP 429, HTTP 529, hangs forever with no
   error? Each has a different fix.

2. **How long does it take to fail?**
   Use a stopwatch. The number matches an exact timeout somewhere:
   - 5s, 10s, 30s → infrastructure (Vercel/Lambda/proxy/load balancer)
   - 60s → nginx default, ALB default, or Cloudflare free
   - 100s → Cloudflare paid
   - 600s → SDK default
   - "forever" → no timeout set anywhere, fix that first

3. **Does it fail in a minimal standalone script too?**
   See `repro.py` / `repro.mjs`. If standalone script works, the API is fine
   and the problem is in your app/infra. If it also fails, the problem is in
   the call itself (payload, model, tokens).

4. **What's `max_tokens` set to?**
   Anything over 4096 with non-streaming is asking for trouble. Stream it.

5. **Are you using `stream=True`?**
   For long-output or latency-sensitive calls, streaming is the fix, not a
   nice-to-have.

6. **What's the SDK version and where does it run?**
   `pip show anthropic` / `npm ls @anthropic-ai/sdk` and the deployment target
   (Lambda, Vercel, ECS, bare metal, etc.). Most "it worked yesterday" issues
   are an SDK upgrade or deploy target change.

## If you can't answer Q3 yet

Run `repro.py` first. Without that data, every fix is a guess.
