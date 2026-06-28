/**
 * Thin transport wrapper around a Gemini Live session.
 *
 * - `parseServerMessage` (pure): normalizes raw SDK messages into GeminiEvents
 *   plus the resumption handle and goAway flag.
 * - `LiveClient`: drives a session through an injected connector, forwards
 *   normalized events, and auto-reconnects with the saved resumption handle when
 *   the socket drops (e.g. at the 15-minute audio limit), preserving context.
 *   It does NOT reconnect after a user-initiated close.
 *
 * The connector abstracts the actual `ai.live.connect` + ephemeral-token wiring
 * so this orchestration is unit testable without a real socket.
 */
import type { LiveServerMessage } from "@google/genai";
import type { GeminiEvent } from "./lessonBridge";

export interface ParsedMessage {
  events: GeminiEvent[];
  resumptionHandle?: string;
  goingAway: boolean;
}

export function parseServerMessage(message: LiveServerMessage): ParsedMessage {
  const events: GeminiEvent[] = [];

  const content = message.serverContent;
  if (content) {
    for (const part of content.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) {
        events.push({ kind: "audioChunk", base64: data });
      }
    }
    if (content.inputTranscription?.text) {
      events.push({ kind: "activityStart" });
    }
    if (content.interrupted) {
      events.push({ kind: "interrupted" });
    }
    if (content.turnComplete) {
      events.push({ kind: "turnComplete" });
    }
  }

  for (const call of message.toolCall?.functionCalls ?? []) {
    if (call.name) {
      events.push({ kind: "toolCall", name: call.name, args: call.args ?? {} });
    }
  }

  return {
    events,
    resumptionHandle: message.sessionResumptionUpdate?.newHandle,
    goingAway: Boolean(message.goAway),
  };
}

export interface LiveSessionHandle {
  sendAudio(base64Pcm: string): void;
  close(): void;
}

export interface LiveConnectorCallbacks {
  onMessage(message: LiveServerMessage): void;
  onError(error: unknown): void;
  onClose(): void | Promise<void>;
}

export interface LiveConnector {
  connect(args: {
    resumptionHandle?: string;
    callbacks: LiveConnectorCallbacks;
  }): Promise<LiveSessionHandle>;
}

export interface LiveClientCallbacks {
  onEvents(events: GeminiEvent[]): void;
  onError?(error: unknown): void;
  onReconnecting?(): void;
  onClosed?(): void;
}

export class LiveClient {
  private session: LiveSessionHandle | null = null;
  private resumptionHandle: string | undefined;
  private userClosed = false;

  constructor(
    private readonly connector: LiveConnector,
    private readonly callbacks: LiveClientCallbacks,
  ) {}

  async start(): Promise<void> {
    await this.open();
  }

  sendAudio(base64Pcm: string): void {
    this.session?.sendAudio(base64Pcm);
  }

  async close(): Promise<void> {
    this.userClosed = true;
    this.session?.close();
    this.session = null;
  }

  private async open(): Promise<void> {
    this.session = await this.connector.connect({
      resumptionHandle: this.resumptionHandle,
      callbacks: {
        onMessage: (message) => this.handleMessage(message),
        onError: (error) => this.callbacks.onError?.(error),
        onClose: () => this.handleClose(),
      },
    });
  }

  private handleMessage(message: LiveServerMessage): void {
    const parsed = parseServerMessage(message);
    if (parsed.resumptionHandle) {
      this.resumptionHandle = parsed.resumptionHandle;
    }
    if (parsed.events.length > 0) {
      this.callbacks.onEvents(parsed.events);
    }
    // goAway is informational here: the socket close that follows triggers the
    // reconnect, so we don't act on it directly (avoids a double reconnect).
  }

  private async handleClose(): Promise<void> {
    if (this.userClosed) {
      this.callbacks.onClosed?.();
      return;
    }
    this.callbacks.onReconnecting?.();
    try {
      await this.open();
    } catch (error) {
      this.callbacks.onError?.(error);
    }
  }
}
