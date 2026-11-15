// W5 · Stamp Call — records when the model call starts (for latency). Runs once per item.
return { json: { ...$input.item.json, started_ms: Date.now(), started_at: new Date().toISOString() } };
