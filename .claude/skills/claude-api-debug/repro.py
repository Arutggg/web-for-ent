"""
Minimal reproduction script for Anthropic Claude API issues.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python repro.py

What this does:
    - Makes one call with explicit long timeout and debug logging
    - Prints exact elapsed time so you can match against client/infra limits
    - Prints token usage so you can see if max_tokens is the bottleneck

Tweak MODEL, MAX_TOKENS, and MESSAGES to match the failing real call EXACTLY.
"""
import logging
import os
import time

from anthropic import Anthropic, APIError, APIStatusError, APITimeoutError

# Show HTTP-level detail. Comment out for less noise.
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(name)s %(levelname)s: %(message)s",
)

MODEL = "claude-opus-4-7"
MAX_TOKENS = 1024
MESSAGES = [{"role": "user", "content": "Say hello in one short sentence."}]

# 10-minute SDK timeout. The SDK also retries 5xx/429/connection errors.
client = Anthropic(timeout=600.0, max_retries=2)


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY is not set")

    t0 = time.perf_counter()
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=MESSAGES,
        )
    except APITimeoutError as e:
        print(f"TIMEOUT after {time.perf_counter() - t0:.2f}s: {e}")
        print("  → request did not finish within the SDK timeout (600s here)")
        return
    except APIStatusError as e:
        print(f"HTTP {e.status_code} after {time.perf_counter() - t0:.2f}s")
        print(f"  body: {e.response.text}")
        return
    except APIError as e:
        print(f"API error after {time.perf_counter() - t0:.2f}s: {e}")
        return

    elapsed = time.perf_counter() - t0
    print(f"OK in {elapsed:.2f}s")
    print(f"  model:  {resp.model}")
    print(f"  usage:  in={resp.usage.input_tokens} out={resp.usage.output_tokens}")
    print(f"  stop:   {resp.stop_reason}")
    print(f"  text:   {resp.content[0].text[:200] if resp.content else '(empty)'}")


if __name__ == "__main__":
    main()
