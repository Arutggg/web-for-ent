# Streaming examples — the fix for ~70% of timeout bugs

Use these when the diagnosis is "request takes >30s, my client/infra gives up".
Streaming keeps the connection active and lets you start consuming tokens within
~1 second instead of waiting for the full response.

## Python

```python
from anthropic import Anthropic

client = Anthropic(timeout=600.0)

with client.messages.stream(
    model="claude-opus-4-7",
    max_tokens=8192,
    messages=[{"role": "user", "content": "Write a long essay about ..."}],
) as stream:
    for text_chunk in stream.text_stream:
        print(text_chunk, end="", flush=True)

    final = stream.get_final_message()
    print(f"\n\nTokens: in={final.usage.input_tokens} out={final.usage.output_tokens}")
```

## Python async (FastAPI / aiohttp / etc.)

```python
from anthropic import AsyncAnthropic

client = AsyncAnthropic(timeout=600.0)

async with client.messages.stream(
    model="claude-opus-4-7",
    max_tokens=8192,
    messages=[...],
) as stream:
    async for text_chunk in stream.text_stream:
        # yield to client, write to websocket, append to buffer — your choice
        ...
    final = await stream.get_final_message()
```

## Node / TypeScript

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ timeout: 600_000 });

const stream = client.messages.stream({
  model: "claude-opus-4-7",
  max_tokens: 8192,
  messages: [{ role: "user", content: "..." }],
});

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
}

const final = await stream.finalMessage();
console.log(final.usage);
```

## Streaming over HTTP to your own clients (Server-Sent Events)

The pattern in FastAPI:

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from anthropic import AsyncAnthropic

app = FastAPI()
client = AsyncAnthropic(timeout=600.0)

@app.get("/chat")
async def chat(prompt: str):
    async def event_stream():
        async with client.messages.stream(
            model="claude-opus-4-7",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                # SSE format: each event is "data: <json>\n\n"
                yield f"data: {text}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

Notes:
- Disable response buffering in your reverse proxy (nginx: `proxy_buffering off`)
  or SSE will queue up server-side and defeat the point.
- Cloudflare strips SSE on free plans for some routes — verify by checking
  `transfer-encoding: chunked` in the response headers.

## When NOT to stream

- You need the full response before doing anything (parsing JSON, validating
  schema). Streaming is wasted overhead here. Just set a long timeout.
- Background jobs. Use Batch API instead — 50% cheaper, no timeout pressure.
