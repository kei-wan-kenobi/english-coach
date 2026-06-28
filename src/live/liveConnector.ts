/**
 * Real browser connector for {@link LiveClient}: fetches an ephemeral token from
 * the local token server, opens a Gemini Live session, and adapts the SDK
 * surface to the transport-agnostic {@link LiveConnector} interface.
 *
 * This is thin I/O glue around preview APIs — verified manually / via E2E rather
 * than unit tests (excluded from coverage).
 */
import { GoogleGenAI } from "@google/genai";
import { buildLiveConfig, DEFAULT_LIVE_MODEL } from "./liveConfig";
import type {
  LiveConnector,
  LiveConnectorCallbacks,
  LiveSessionHandle,
} from "./liveClient";

const INPUT_MIME = "audio/pcm;rate=16000";

interface TokenResponse {
  success: boolean;
  data?: { token: string; model: string };
  error?: string;
}

async function fetchToken(tokenUrl: string): Promise<{ token: string; model: string }> {
  const response = await fetch(tokenUrl);
  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? "Failed to fetch session token");
  }
  return body.data;
}

export interface BrowserConnectorOptions {
  /** Endpoint that mints ephemeral tokens (default "/api/token"). */
  tokenUrl?: string;
}

export function createBrowserConnector(
  options: BrowserConnectorOptions = {},
): LiveConnector {
  const tokenUrl = options.tokenUrl ?? "/api/token";

  return {
    async connect(args: {
      resumptionHandle?: string;
      callbacks: LiveConnectorCallbacks;
    }): Promise<LiveSessionHandle> {
      const { token, model } = await fetchToken(tokenUrl);
      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const config = {
        ...buildLiveConfig(),
        sessionResumption: args.resumptionHandle
          ? { handle: args.resumptionHandle }
          : {},
      };

      const session = await ai.live.connect({
        model: model || DEFAULT_LIVE_MODEL,
        config,
        callbacks: {
          onmessage: (message) => args.callbacks.onMessage(message),
          onerror: (event) => args.callbacks.onError(event),
          onclose: () => {
            void args.callbacks.onClose();
          },
        },
      });

      return {
        sendAudio: (base64Pcm: string) => {
          session.sendRealtimeInput({
            audio: { data: base64Pcm, mimeType: INPUT_MIME },
          });
        },
        sendText: (text: string) => {
          session.sendClientContent({
            turns: [{ role: "user", parts: [{ text }] }],
            turnComplete: true,
          });
        },
        close: () => session.close(),
      };
    },
  };
}
