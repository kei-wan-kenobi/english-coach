import { describe, it, expect, vi } from "vitest";
import type { LiveServerMessage } from "@google/genai";
import {
  parseServerMessage,
  LiveClient,
  type LiveConnector,
  type LiveConnectorCallbacks,
  type LiveSessionHandle,
} from "./liveClient";

describe("parseServerMessage", () => {
  it("extracts audio chunks from model turn parts", () => {
    const msg = {
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: "AUDIO64" } }, { text: "hi" }] },
      },
    } as unknown as LiveServerMessage;
    expect(parseServerMessage(msg).events).toEqual([
      { kind: "audioChunk", base64: "AUDIO64" },
    ]);
  });

  it("maps interrupted and turnComplete flags", () => {
    const msg = {
      serverContent: { interrupted: true, turnComplete: true },
    } as unknown as LiveServerMessage;
    expect(parseServerMessage(msg).events).toEqual([
      { kind: "interrupted" },
      { kind: "turnComplete" },
    ]);
  });

  it("maps input transcription to an activity start", () => {
    const msg = {
      serverContent: { inputTranscription: { text: "apple" } },
    } as unknown as LiveServerMessage;
    expect(parseServerMessage(msg).events).toEqual([{ kind: "activityStart" }]);
  });

  it("extracts named tool calls with args", () => {
    const msg = {
      toolCall: {
        functionCalls: [
          { name: "set_phase", args: { phase: "teaching", targetPhrase: "cat" } },
          { args: { quality: "good" } }, // no name -> ignored
        ],
      },
    } as unknown as LiveServerMessage;
    expect(parseServerMessage(msg).events).toEqual([
      { kind: "toolCall", name: "set_phase", args: { phase: "teaching", targetPhrase: "cat" } },
    ]);
  });

  it("captures the session resumption handle and goAway flag", () => {
    const msg = {
      sessionResumptionUpdate: { newHandle: "handle-123", resumable: true },
      goAway: { timeLeft: "5s" },
    } as unknown as LiveServerMessage;
    const parsed = parseServerMessage(msg);
    expect(parsed.resumptionHandle).toBe("handle-123");
    expect(parsed.goingAway).toBe(true);
  });

  it("returns no events for an empty message", () => {
    expect(parseServerMessage({} as unknown as LiveServerMessage)).toEqual({
      events: [],
      resumptionHandle: undefined,
      goingAway: false,
    });
  });
});

/** A connector whose sessions expose their callbacks so tests can drive them. */
function fakeConnector() {
  const sessions: Array<{
    handle: LiveSessionHandle;
    callbacks: LiveConnectorCallbacks;
    sendAudio: ReturnType<typeof vi.fn>;
    sendText: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const connect = vi.fn(
    async (args: { resumptionHandle?: string; callbacks: LiveConnectorCallbacks }) => {
      const sendAudio = vi.fn();
      const sendText = vi.fn();
      const close = vi.fn();
      const handle: LiveSessionHandle = { sendAudio, sendText, close };
      sessions.push({ handle, callbacks: args.callbacks, sendAudio, sendText, close });
      return handle;
    },
  );
  const connector: LiveConnector = { connect };
  return { connector, connect, sessions };
}

describe("LiveClient", () => {
  it("connects on start and forwards normalized events", async () => {
    const { connector, connect, sessions } = fakeConnector();
    const onEvents = vi.fn();
    const client = new LiveClient(connector, { onEvents });
    await client.start();
    expect(connect).toHaveBeenCalledTimes(1);

    sessions[0].callbacks.onMessage({
      toolCall: { functionCalls: [{ name: "set_phase", args: { phase: "prompting" } }] },
    } as unknown as LiveServerMessage);
    expect(onEvents).toHaveBeenCalledWith([
      { kind: "toolCall", name: "set_phase", args: { phase: "prompting" } },
    ]);
  });

  it("sends audio through the active session", async () => {
    const { connector, sessions } = fakeConnector();
    const client = new LiveClient(connector, { onEvents: vi.fn() });
    await client.start();
    client.sendAudio("PCM64");
    expect(sessions[0].sendAudio).toHaveBeenCalledWith("PCM64");
  });

  it("sends a kickoff text turn through the active session", async () => {
    const { connector, sessions } = fakeConnector();
    const client = new LiveClient(connector, { onEvents: vi.fn() });
    await client.start();
    client.sendText("はじめまして");
    expect(sessions[0].sendText).toHaveBeenCalledWith("はじめまして");
  });

  it("reconnects with the saved resumption handle when the socket drops", async () => {
    const { connector, connect, sessions } = fakeConnector();
    const onReconnecting = vi.fn();
    const client = new LiveClient(connector, { onEvents: vi.fn(), onReconnecting });
    await client.start();

    sessions[0].callbacks.onMessage({
      sessionResumptionUpdate: { newHandle: "h-9", resumable: true },
    } as unknown as LiveServerMessage);
    await sessions[0].callbacks.onClose();

    expect(onReconnecting).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect.mock.calls[1][0].resumptionHandle).toBe("h-9");
  });

  it("does not reconnect after the user closes", async () => {
    const { connector, connect, sessions } = fakeConnector();
    const onClosed = vi.fn();
    const client = new LiveClient(connector, { onEvents: vi.fn(), onClosed });
    await client.start();

    await client.close();
    expect(sessions[0].close).toHaveBeenCalled();
    await sessions[0].callbacks.onClose();

    expect(connect).toHaveBeenCalledTimes(1); // no reconnect
    expect(onClosed).toHaveBeenCalled();
  });

  it("surfaces connector errors", async () => {
    const { connector, sessions } = fakeConnector();
    const onError = vi.fn();
    const client = new LiveClient(connector, { onEvents: vi.fn(), onError });
    await client.start();
    const boom = new Error("socket error");
    sessions[0].callbacks.onError(boom);
    expect(onError).toHaveBeenCalledWith(boom);
  });
});
