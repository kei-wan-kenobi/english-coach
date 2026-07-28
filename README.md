# えいごコーチ (English Coach)

(English follows Japanese)

Gemini 3.1 Flash Live Preview を使った、4〜5歳児向けのリアルタイム音声英語コーチ。
子供が日本語で「◯◯って英語でなんて言うの？」と聞くと、先生キャラクターが英語のお手本を見せ、
復唱を促し、発音を評価して反復／次へを判断します。ターンテイキングが苦手な幼児のため、
割り込み（barge-in）を許容するリアルタイム音声対話を採用しています。

要件の詳細は [requirements.md](./requirements.md) を参照。

## 必要環境

- Node.js 20+
- Gemini API キー（[Google AI Studio](https://aistudio.google.com/) で取得）

## セットアップ

```bash
npm install
cp .env.example .env
# .env を編集して GEMINI_API_KEY を設定（このキーはブラウザには出ません）
```

## 開発サーバー起動

```bash
npm run dev
```

- `dev:server` … エフェメラルトークン発行サーバー（`GEMINI_API_KEY` を保持）
- `dev:web` … Vite フロントエンド（`/api` をトークンサーバーへプロキシ）

ブラウザで Vite が表示する URL（通常 http://localhost:5173 ）を開き、「はじめる」を押して
マイクを許可すると会話が始まります。Chrome 系を推奨。

## アーキテクチャ

```
[Browser]  --GET /api/token-->  [Token Server (node:http)]  --mint-->  Gemini API
   |  (ephemeral token, never the API key)
   '--WebSocket--> Gemini Live API  (PCM16/16kHz in, 24kHz out, barge-in)
```

純粋ロジック（状態機械・音声変換・設定・キャラ制御・イベント橋渡し）と I/O（WebSocket・
WebAudio・トークンサーバー）を分離し、前者を TDD で厚くテストしています。

主なモジュール:

| 場所 | 役割 |
|------|------|
| `src/conversation/stateMachine.ts` | レッスン進行の状態機械（純粋 reducer） |
| `src/live/liveConfig.ts` | モデル/VAD/system instruction/ツール定義 |
| `src/live/lessonBridge.ts` | Gemini イベント → 状態機械イベントの変換 |
| `src/live/liveClient.ts` | Live セッション薄ラッパ＋自動再接続 |
| `src/audio/pcm.ts` / `playbackQueue.ts` | PCM 変換 / ギャップレス再生＋割り込みクリア |
| `src/lesson/lessonController.ts` | 上記を結線する統合層 |
| `src/character/` | フェーズ→表情マッピング＋SVG キャラ |
| `server/` | エフェメラルトークン発行 |

## スクリプト

```bash
npm test            # 単体・結合テスト (Vitest)
npm run test:coverage
npm run test:e2e    # Playwright E2E（要 npx playwright install chromium）
npm run typecheck
npm run build
```

ビジュアル確認用に、ライブセッション無しでキャラを静的表示するデモモードがあります:
`/?demo=speaking`（`speaking` / `listening` / `waiting` / `celebrating`）。

## 注意

- Gemini 3.1 Flash Live は **preview** です。モデル名・API フィールドは変わり得ます
  （`.env` の `GEMINI_LIVE_MODEL` で上書き可）。
- 音声セッションは 15 分上限。上限到達時はセッション再開ハンドルで自動再接続します。
- 子供の音声は保存しません（ローカル前提・ログ最小化）。

## Disclaimer

これは個人のプロジェクトです。ここに表明されているコード、意見は私個人のものであり、現在または過去の雇用主を代表するものではありません。

---

# English Coach (えいごコーチ)

A real-time voice English coach for 4–5 year olds, powered by Gemini 3.1 Flash Live Preview.
When a child asks in Japanese "How do you say ◯◯ in English?", a teacher character gives an
English model phrase, prompts the child to repeat it, evaluates the pronunciation, and decides
whether to retry or move on. Since young children struggle with turn-taking, the app uses
real-time voice conversation that allows barge-in interruptions.

See [requirements.md](./requirements.md) for detailed requirements.

## Requirements

- Node.js 20+
- A Gemini API key (get one at [Google AI Studio](https://aistudio.google.com/))

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and set GEMINI_API_KEY (this key never reaches the browser)
```

## Running the dev servers

```bash
npm run dev
```

- `dev:server` … ephemeral token server (holds `GEMINI_API_KEY`)
- `dev:web` … Vite frontend (proxies `/api` to the token server)

Open the URL Vite prints (usually http://localhost:5173 ), press "はじめる" (Start), and
allow microphone access to begin the conversation. Chromium-based browsers recommended.

## Architecture

```
[Browser]  --GET /api/token-->  [Token Server (node:http)]  --mint-->  Gemini API
   |  (ephemeral token, never the API key)
   '--WebSocket--> Gemini Live API  (PCM16/16kHz in, 24kHz out, barge-in)
```

Pure logic (state machine, audio conversion, config, character control, event bridging) is
separated from I/O (WebSocket, WebAudio, token server), and the former is heavily tested
with TDD.

Main modules:

| Location | Role |
|----------|------|
| `src/conversation/stateMachine.ts` | Lesson-flow state machine (pure reducer) |
| `src/live/liveConfig.ts` | Model / VAD / system instruction / tool definitions |
| `src/live/lessonBridge.ts` | Converts Gemini events → state machine events |
| `src/live/liveClient.ts` | Thin Live-session wrapper + auto-reconnect |
| `src/audio/pcm.ts` / `playbackQueue.ts` | PCM conversion / gapless playback + barge-in flush |
| `src/lesson/lessonController.ts` | Integration layer wiring the above together |
| `src/character/` | Phase → expression mapping + SVG character |
| `server/` | Ephemeral token minting |

## Scripts

```bash
npm test            # Unit & integration tests (Vitest)
npm run test:coverage
npm run test:e2e    # Playwright E2E (requires npx playwright install chromium)
npm run typecheck
npm run build
```

For visual checks there is a demo mode that renders the character statically without a live
session: `/?demo=speaking` (`speaking` / `listening` / `waiting` / `celebrating`).

## Notes

- Gemini 3.1 Flash Live is a **preview** model. Model names and API fields may change
  (override via `GEMINI_LIVE_MODEL` in `.env`).
- Voice sessions are capped at 15 minutes; the app auto-reconnects with a session
  resumption handle when the cap is hit.
- The child's voice is never stored (local-first, minimal logging).

## Disclaimer

This is a personal project. The views, code, and opinions expressed here are my own and do not represent those of my current or past employers.
