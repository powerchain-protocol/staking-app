import {
  REALTIME_PROTOCOL,
  REALTIME_TOPICS,
  endpoints,
  type RealtimeClientMessage,
  type RealtimeConnectionState,
  type RealtimeEventEnvelope,
  type RealtimeServerMessage,
  type RealtimeTokenResponse,
  type RealtimeTopic,
} from '@powerchain/contracts';
import { apiJson } from './http';

type EventHandler = (event: RealtimeEventEnvelope) => void;
type StateHandler = (state: RealtimeConnectionState) => void;

export type RealtimeClientOptions = {
  tokenFactory?: () => Promise<RealtimeTokenResponse>;
  reconnect?: boolean;
  maxReconnectDelayMs?: number;
};

export class PowerChainRealtimeClient {
  private socket: WebSocket | null = null;
  private state: RealtimeConnectionState = 'idle';
  private subscriptions = new Set<RealtimeTopic>();
  private eventHandlers = new Set<EventHandler>();
  private stateHandlers = new Set<StateHandler>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventId: string | null = null;
  private closedByUser = false;
  private heartbeatDeadline: ReturnType<typeof setTimeout> | null = null;
  private heartbeatSeconds = 30;
  private readonly tokenFactory: () => Promise<RealtimeTokenResponse>;
  private readonly reconnect: boolean;
  private readonly maxReconnectDelayMs: number;

  constructor(options: RealtimeClientOptions = {}) {
    this.tokenFactory = options.tokenFactory ?? (() => apiJson<RealtimeTokenResponse>(endpoints.realtime.token, { method: 'POST', retries: 0 }));
    this.reconnect = options.reconnect ?? true;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 15_000;
  }

  connectionState() { return this.state; }
  cursor() { return this.lastEventId; }

  onEvent(handler: EventHandler) { this.eventHandlers.add(handler); return () => this.eventHandlers.delete(handler); }
  onState(handler: StateHandler) { this.stateHandlers.add(handler); handler(this.state); return () => this.stateHandlers.delete(handler); }

  subscribe(topics: RealtimeTopic[]) {
    for (const topic of topics) if ((REALTIME_TOPICS as readonly string[]).includes(topic)) this.subscriptions.add(topic);
    this.send({ type: 'subscribe', topics: [...this.subscriptions], afterEventId: this.lastEventId });
    return () => this.unsubscribe(topics);
  }

  unsubscribe(topics: RealtimeTopic[]) {
    for (const topic of topics) this.subscriptions.delete(topic);
    this.send({ type: 'unsubscribe', topics });
  }

  async connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    this.closedByUser = false;
    this.setState(this.reconnectAttempt ? 'reconnecting' : 'connecting');
    try {
      const access = await this.tokenFactory();
      this.heartbeatSeconds = access.heartbeatSeconds;
      const socket = new WebSocket(access.websocketUrl, [REALTIME_PROTOCOL, `bearer.${access.token}`]);
      this.socket = socket;
      socket.onopen = () => {
        this.reconnectAttempt = 0;
        this.setState('open');
        this.touchHeartbeat();
        if (this.subscriptions.size) this.send({ type: 'subscribe', topics: [...this.subscriptions], afterEventId: this.lastEventId });
      };
      socket.onmessage = (message) => this.onMessage(String(message.data));
      socket.onerror = () => this.setState('error');
      socket.onclose = () => {
        this.clearHeartbeat();
        this.socket = null;
        if (this.closedByUser || !this.reconnect) { this.setState('closed'); return; }
        this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearHeartbeat();
    this.socket?.close(1000, 'client closing');
    this.socket = null;
    this.setState('closed');
  }

  private send(message: RealtimeClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private onMessage(raw: string) {
    let message: RealtimeServerMessage;
    try { message = JSON.parse(raw) as RealtimeServerMessage; } catch { return; }
    this.touchHeartbeat();
    if (message.type === 'event') {
      this.lastEventId = message.event.eventId;
      for (const handler of this.eventHandlers) handler(message.event);
    } else if (message.type === 'heartbeat') {
      this.send({ type: 'ping' });
    } else if (message.type === 'error' && !message.retryable) {
      this.close();
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser || !this.reconnect) return;
    this.setState('reconnecting');
    const exponent = Math.min(this.reconnectAttempt++, 8);
    const base = Math.min(this.maxReconnectDelayMs, 500 * (2 ** exponent));
    const delay = Math.round(base * (0.75 + Math.random() * 0.5));
    this.reconnectTimer = setTimeout(() => void this.connect(), delay);
  }

  private touchHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatDeadline = setTimeout(() => this.socket?.close(4000, 'heartbeat timeout'), Math.max(10, this.heartbeatSeconds * 2 + 5) * 1000);
  }

  private clearHeartbeat() { if (this.heartbeatDeadline) clearTimeout(this.heartbeatDeadline); this.heartbeatDeadline = null; }
  private setState(state: RealtimeConnectionState) { this.state = state; for (const handler of this.stateHandlers) handler(state); }
}
