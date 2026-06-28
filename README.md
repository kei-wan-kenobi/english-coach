# えいごコーチ (English Coach)

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
