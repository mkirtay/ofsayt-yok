/** `text/event-stream` gövdesini olaylara ayırır (fetch + ReadableStream; EventSource POST desteklemez). */
export type SseEvent = { event: string; data: unknown };

/** Tamponu işler; tamamlanan olayları ve kalan (yarım) metni döner. */
export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) continue;
    try {
      events.push({ event, data: JSON.parse(data.join('\n')) });
    } catch {
      // bozuk olay: atla
    }
  }
  return { events, rest };
}

export async function readSse(body: ReadableStream<Uint8Array>, onEvent: (e: SseEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;
    parsed.events.forEach(onEvent);
  }
}
