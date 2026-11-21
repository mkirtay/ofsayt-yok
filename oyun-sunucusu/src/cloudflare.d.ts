// Kullandığımız kadar Cloudflare Workers türü (@cloudflare/workers-types bağımlılığı eklememek için).
declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}
interface WebSocket {
  accept(): void;
}
interface ResponseInit {
  webSocket?: WebSocket | null;
}
interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(req: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectState {
  readonly id: DurableObjectId;
}
