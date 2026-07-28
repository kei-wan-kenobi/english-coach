# English Coach — 要件定義書 (requirements.md)

(English follows Japanese)

> Gemini 3.1 Flash Live Preview を使った、4〜5歳児向けのリアルタイム音声英語コーチ Web アプリ。

最終更新: 2026-06-28

---

## 1. 目的 / コンセプト

4歳・5歳の子供が、日本語で「XXXって英語で何て言うの？」と尋ねると、AI の先生キャラクターが

1. **お手本** を英語で言って聞かせ、
2. 子供に **同じ文章の復唱** を促し、
3. 子供の発音を聞いて **良し悪しを評価** し、
4. 「もう一回やってみよう」か「次はどんな英語が知りたい？」かを **判断して誘導する**

という対話を、**リアルタイム音声** で行う。
画面には、喋っている様子のキャラクターが表示される。

このアプリの中核的な狙いは、**ターンテイキングが未熟な幼児でも自然に会話できること**。
そのため、低レイテンシかつ割り込み（barge-in）に強い **Gemini Live API のネイティブ音声モデル** を採用する。

---

## 2. 対象ユーザー / ペルソナ

- **主たる利用者**: 4歳・5歳の子供（ひらがな・英語の読み書きは不可。操作は最小限）
- **副たる利用者**: 保護者（起動・見守り・APIキー設定を担う）
- 利用環境: 家庭の PC ブラウザ（まずはローカル。Chrome 系を主対象）

### 幼児ユーザーの特性（設計上の最重要前提）

- ターンテイキングが苦手。**質問への返答が始まっても話し続ける**ことがある。
- 考える時間が長く、**先生の発話が終わっても返答開始まで時間がかかる**ことがある。
- 沈黙・言い淀み・繰り返しが多い。
- 文字を読めない → **UI は音声と絵が主、文字は補助**。

---

## 3. スコープ

### 3.1 In Scope（今回作る）

- ローカルで `npm run dev` 等で起動して使える Web アプリ
- マイク入力 → Gemini Live API → 音声出力 のリアルタイム対話
- 日本語の質問を受けて英語のお手本提示 → 復唱促し → 発音評価 → 反復/次へ判断
- バージイン（子供の割り込み）許容の会話制御
- 喋るキャラクターの表示（発話中アニメーション）
- APIキーをブラウザに晒さないための **ローカル・エフェメラルトークン発行サーバー**

### 3.2 Out of Scope（今回はやらない）

- 本番デプロイ / 認証 / マルチユーザー / アカウント管理
- 学習進捗の永続化・分析ダッシュボード
- 複数言語対応（英↔日 以外）
- ネイティブアプリ / モバイル最適化
- 課金・利用制限・レート制御の作り込み（最小限のみ）

---

## 4. 機能要件 (Functional Requirements)

### FR-1 セッション開始
- FR-1.1: 保護者が「はじめる」ボタンを押すとマイク許可を要求し、Live セッションを開始する。
- FR-1.2: 起動時、トークンサーバーからエフェメラルトークンを取得して接続する。
- FR-1.3: マイク許可が拒否された場合、子供にも分かる絵＋音声で再依頼を促す。

### FR-2 質問の受付（日本語）
- FR-2.1: 子供の「〇〇って英語でなんて言うの？」等の日本語音声を受け取る。
- FR-2.2: 質問の途中・言い淀みでも、先生は急かさず待つ（後述のターンテイキング設計）。

### FR-3 お手本提示（英語）
- FR-3.1: 先生は質問対象の英語表現を、**ゆっくり・短く・幼児向け**に発話する。
- FR-3.2: 例: 「"Apple" だよ。リンゴは英語で "Apple"。いっしょに言ってみよう！」のように、
  まず英語、続けて日本語フォローを混ぜる。
- FR-3.3: 1回のお手本は **1〜4語程度の短い表現** を基本とする。

### FR-4 復唱の促し
- FR-4.1: 先生は子供に同じ英語を言うよう優しく促す。
- FR-4.2: 子供が黙っていても、設定した待機時間は **急かさず待つ**。
- FR-4.3: 待っても反応がなければ、もう一度お手本→促しを行う（最大リトライ回数あり）。

### FR-5 発音評価
- FR-5.1: 先生は子供の発話音声（ネイティブ音声モデルが直接聴取）から発音の良し悪しを評価する。
- FR-5.2: 評価は **常にポジティブな声かけ** を基調とする（幼児の自己肯定感を損なわない）。
  - 良い: 「すごい！じょうずだね！」
  - 惜しい: 「いいね！もう一回、"ア"を強く言ってみよう！」
- FR-5.3: 評価結果に基づき次の分岐を決める（FR-6）。

### FR-6 反復 / 次へ の判断
- FR-6.1: 発音が十分なら **称賛 → 次の表現** へ誘導（「ほかには何が知りたい？」）。
- FR-6.2: 不十分なら **励まし → 同じ表現を再度** 促す（最大 N 回でやさしく次へ）。
- FR-6.3: 状態遷移はアプリ側の状態機械で管理し、モデルからの構造化シグナル（ツール呼び出し）で駆動する（後述）。

### FR-7 キャラクター表示
- FR-7.1: 画面中央に先生キャラクターを表示する。
- FR-7.2: 先生が **発話している間** は口パク等の「喋っているアニメーション」を表示する。
- FR-7.3: 子供が話している（聴取中）/ 待機中 / 称賛中 など状態に応じた表情・モーションを切り替える。
- FR-7.4: アニメーション制御ロジックは描画から分離し、単体テスト可能にする。

### FR-8 ターンテイキング / バージイン（最重要）
- FR-8.1: **先生は積極的に子供の発話に被せない**（proactive に割り込まない）。
- FR-8.2: 子供は **先生の発話中にいつでも割り込み可能**。割り込みを検知したら、
  先生の音声出力を即座に停止し、再生キューをクリアする（`interrupted` フラグ駆動）。
- FR-8.3: 「先生が話しながら子供の声も聞いている」状態を許容する（同時性 OK）。
- FR-8.4: 子供の沈黙・思考時間を長めに許容する（短い無音で turn を切らない）。
  - 終話判定の無音しきい値を長め（例: 1200〜2000ms、要チューニング）に設定。
- FR-8.5: 割り込み後は、子供の新しい発話に文脈を引き継いで応答する。

### FR-9 保護者向け設定
- FR-9.1: APIキーは環境変数（`.env`）で設定。ブラウザには出さない。
- FR-9.2: セッション時間上限（音声のみ 15 分）に達したら、やさしく終了 or 自動再接続する。

---

## 5. 会話フロー / 状態機械

アプリは以下の状態を持つ純粋な状態機械（reducer）で会話進行を管理する。
状態遷移は (a) ユーザー音声イベント、(b) モデルの音声/`interrupted`、(c) モデルのツール呼び出しで駆動する。

```
IDLE
  └─(start)──────────────► LISTENING_QUESTION   // 子供の質問を待つ/聞く
LISTENING_QUESTION
  └─(question captured)──► TEACHING_EXAMPLE      // 英語のお手本を発話
TEACHING_EXAMPLE
  └─(example done)───────► PROMPT_REPEAT         // 「いっしょに言ってみよう」
PROMPT_REPEAT
  ├─(child speaks)───────► LISTENING_REPEAT      // 復唱を聞く
  └─(silence timeout)────► PROMPT_REPEAT (retry) / TEACHING_EXAMPLE
LISTENING_REPEAT
  └─(repeat captured)────► EVALUATING            // 発音評価
EVALUATING
  ├─(good enough)────────► PRAISE_NEXT ──► LISTENING_QUESTION
  └─(needs retry)────────► ENCOURAGE_RETRY ──► PROMPT_REPEAT
(any speaking state)
  └─(child barge-in)─────► 停止＋再生クリア → 該当 LISTENING_* へ
```

- 評価の判定（good_enough / needs_retry）は **モデルが function calling（例: `report_evaluation`）で返す** ことで、アプリ側状態機械が分岐する。
- リトライ回数の上限（例: 同一表現は最大3回）を超えたら、やさしく次の表現へ誘導する。

---

## 6. 技術スタック / アーキテクチャ

### 6.1 構成

```
[Browser SPA]  ──(1) GET /api/token──►  [Local Token Server (Node)]
     │                                         │ holds GEMINI_API_KEY (.env)
     │                                         └─► Gemini API: mint ephemeral token
     │  ◄────────────── ephemeral token ───────┘
     │
     └──(2) WebSocket (ephemeral token)──►  [Gemini Live API]
            mic PCM16/16kHz  ▲ │ ▼ audio 24kHz + transcripts + tool calls
```

- **(1) Token Server**: ローカルの最小 Node サーバー。`GEMINI_API_KEY` を保持し、
  短命のエフェメラルトークンのみをブラウザへ返す。**APIキーは絶対にブラウザへ出さない。**
- **(2) Browser SPA**: マイク取得 → Float32→PCM16/16kHz 変換 → WS 送信、
  受信音声(24kHz)の再生・キュー・割り込みクリア、キャラクター描画、状態機械。

### 6.2 採用技術（案・確認したい点）

- 言語/ビルド: **TypeScript + Vite**
- UI: **React**（決定）
- テスト: **Vitest**（単体/結合） + **Playwright**（E2E・視覚回帰）
- サーバー: **Node (Express or 標準 http)** + `@google/genai` SDK
- 音声: WebAudio API（AudioWorklet で PCM 取得・再生）
- SDK: **`@google/genai`**（Live API / ephemeral token 対応）

### 6.3 ディレクトリ構成（feature/領域単位）

```
english_coach/
├── requirements.md
├── .env.example                 # GEMINI_API_KEY=...
├── server/
│   ├── tokenServer.ts           # エフェメラルトークン発行
│   └── tokenServer.test.ts
├── src/
│   ├── audio/
│   │   ├── pcm.ts               # Float32↔PCM16, base64 (純粋関数)
│   │   ├── pcm.test.ts
│   │   ├── playbackQueue.ts     # 再生キュー＋割り込みクリア
│   │   └── playbackQueue.test.ts
│   ├── live/
│   │   ├── liveConfig.ts        # モデル名/VAD/system instruction 生成 (純粋)
│   │   ├── liveConfig.test.ts
│   │   ├── liveClient.ts        # WS 接続・イベント橋渡し (I/O)
│   │   └── tools.ts             # report_evaluation 等の function 定義
│   ├── conversation/
│   │   ├── stateMachine.ts      # 会話状態 reducer (純粋)
│   │   └── stateMachine.test.ts
│   ├── character/
│   │   ├── characterController.ts  # 発話状態→アニメ状態 (純粋ロジック)
│   │   ├── characterController.test.ts
│   │   └── Character.tsx           # 描画
│   ├── app/
│   │   └── App.tsx
│   └── main.tsx
├── e2e/
│   └── smoke.spec.ts
└── (vite/tsconfig/package.json 等)
```

---

## 7. Gemini Live API 設定詳細（実装方針）

| 項目 | 値 / 方針 |
|------|-----------|
| モデル | `gemini-3.1-flash-live-preview`（native audio） |
| 接続 | WebSocket（`@google/genai` Live セッション）、ブラウザはエフェメラルトークン認証 |
| 入力音声 | 16-bit PCM, little-endian, 16kHz, `audio/pcm;rate=16000` |
| 出力音声 | 24kHz PCM, `response_modalities: ["AUDIO"]` |
| 入力文字起こし | `input_audio_transcription: {}`（ログ/評価補助） |
| 出力文字起こし | `output_audio_transcription: {}`（字幕/デバッグ） |
| VAD | `realtimeInputConfig.automaticActivityDetection` を使用 |
| 割り込み | `startOfSpeechSensitivity: HIGH`（子供が割り込みやすく） |
| 終話判定 | `silenceDurationMs` を長め（1200〜2000ms 目安）、`endOfSpeechSensitivity: LOW`（早く切らない） |
| 同時性 | proactive audio を活用し、先生から不要に被せない／聞きながら話す状況を許容 |
| 音声 | `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`（やさしい声を選定） |
| ツール | `report_evaluation(quality, should_retry)` 等の function calling で状態機械を駆動 |
| System Instruction | 「4-5歳児向け、短く、やさしく、必ず褒める、英語→日本語フォロー、評価はツールで報告」を明記 |
| セッション上限 | 音声のみ 15 分。上限到達前にやさしく区切る or 再接続 |

> ⚠️ Live API / 3.1 Flash Live は **preview**。フィールド名・モデル名は実装前に最新ドキュメントで再確認する。

---

## 8. 非機能要件 (Non-Functional Requirements)

- **NFR-1 レイテンシ**: 子供の発話終了から応答開始までできるだけ短く（体感即時）。
- **NFR-2 セキュリティ**: APIキーをブラウザに出さない。エフェメラルトークンは短命。
  `.env` は git 管理外（`.gitignore`）。`.env.example` のみコミット。
- **NFR-3 安全性 / 児童配慮**: 出力は常に肯定的・安全な語彙。不適切語のフィルタ方針を持つ。
- **NFR-4 アクセシビリティ**: 文字を読めない前提。操作は大きなボタン1つ＋音声。
  reduced-motion 設定を尊重。色コントラスト確保。
- **NFR-5 可用性**: ネット断/トークン失効時はやさしく再接続またはエラー提示（子供向け絵＋音声）。
- **NFR-6 保守性**: 1ファイル 200-400 行（最大 800）、純粋ロジックと I/O を分離。

---

## 9. テスト戦略（TDD）

TDD（RED → GREEN → REFACTOR）で進める。純粋ロジックを厚く単体テストし、I/O は薄く結合/E2E で確認。

### 9.1 単体テスト（Vitest, 高カバレッジ目標 80%+）
- `audio/pcm`: Float32→PCM16 変換の範囲・クリッピング・エンディアン・base64 往復。
- `audio/playbackQueue`: 連続チャンク再生順序、`interrupted` 時のキュークリア。
- `live/liveConfig`: モデル名/VAD パラメータ/system instruction/ツール定義の生成内容。
- `conversation/stateMachine`: 全状態遷移、リトライ上限、バージイン時の遷移、沈黙タイムアウト。
- `character/characterController`: 発話/聴取/待機/称賛 → アニメ状態のマッピング。

### 9.2 結合テスト
- `server/tokenServer`: トークン発行成功、APIキー欠如時エラー、トークンを漏らさないこと（キー非露出）。
- Live クライアントは Gemini をモックし、イベント→状態機械の橋渡しを検証。

### 9.3 E2E / 視覚回帰（Playwright）
- 起動→「はじめる」→マイク許可（モック）→キャラクター表示のスモーク。
- ブレークポイント 320/768/1024/1440 でのスクリーンショット。発話中アニメの状態確認。
- Gemini はテスト用フェイクに差し替え（実 API を E2E で叩かない）。

---

## 10. リスク

| リスク | 影響 | 対応 |
|--------|------|------|
| 3.1 Flash Live が preview（API 変更） | 高 | 実装前に最新ドキュメント確認、SDK を薄くラップ |
| 幼児の発音評価精度 | 中 | 評価は寛容＋常に肯定。閾値はチューニング可能に |
| バージイン誤検知（環境ノイズ） | 中 | VAD 感度をチューニング、家庭の静かな環境前提 |
| ブラウザ音声処理の互換性 | 中 | Chrome 系を主対象、AudioWorklet 前提 |
| セッション15分上限 | 低 | 区切り誘導 or 再接続 |
| 児童プライバシー（音声） | 高 | 音声は保存しない方針。ローカル前提、ログ最小化 |

---

## 11. 受け入れ基準（Acceptance Criteria）

- AC-1: ローカルで起動し、ブラウザでマイク許可後に先生と音声で会話できる。
- AC-2: 日本語の質問に対し、英語のお手本→復唱促し→発音評価→反復/次への誘導が一連で動く。
- AC-3: 先生の発話中に子供が割り込むと、先生の音声が即停止し、子供の発話を受け付ける。
- AC-4: 子供が数秒黙っても先生は急かさず待つ（短い無音でターンを切らない）。
- AC-5: 先生の発話中はキャラクターが「喋っているアニメーション」を表示する。
- AC-6: APIキーがブラウザの通信・バンドルに一切露出しない。
- AC-7: 純粋ロジック（pcm / stateMachine / liveConfig / characterController）の単体テストが緑、カバレッジ 80%+。

---

## 12. 決定事項 / 未確定事項

### 決定済み (2026-06-28)
1. UI フレームワーク: **React + Vite**。
2. キャラクター素材: **SVG 自作 + 口パクアニメ**（依存なし、reduced-motion 対応）。

3. 開始挙動: **先生から挨拶して促す**（`greeting` フェーズ）。
4. お手本中の割り込み: **お手本は言い切る**（`teachingExample` は子供の発話で中断しない）。
5. 非質問発話: **少し付き合ってから戻す**（`chitchat` フェーズ → 質問待ちへ）。
6. 発音評価の粒度: **3段階 `good` / `close` / `poor`**。
   - `good` → 称賛して次へ
   - `close` → ピンポイント助言して同じ表現を再度（リトライ）
   - `poor` → お手本に戻る（再提示してリトライ）
7. リトライ上限 N = **3**（同一表現は最大3回トライ後やさしく次へ）。
8. 無音待ち = **8000ms**（`SILENCE_TIMEOUT` イベントとして状態機械へ）。

### 未確定（実装中に確定）
- 先生の声（voiceName）と、英語：日本語フォローの比率。
- `@google/genai` のバージョンと 3.1 Flash Live の正式フィールド名（実装直前に確定）。

---

# English Coach — Requirements (English)

> A real-time voice English coach web app for 4–5 year olds, powered by Gemini 3.1 Flash Live Preview.

Last updated: 2026-06-28

---

## 1. Purpose / Concept

When a 4–5 year old child asks in Japanese "How do you say XXX in English?", an AI teacher character:

1. Says a **model phrase** in English,
2. Prompts the child to **repeat the same phrase**,
3. Listens to the child's pronunciation and **evaluates it**,
4. **Decides** whether to say "let's try once more" or "what would you like to say next?"

— all through **real-time voice** conversation, with an animated speaking character on screen.

The core goal of this app is that **young children who are still poor at turn-taking can converse naturally**.
For that reason it uses the **Gemini Live API native audio model**, which offers low latency and robust barge-in handling.

---

## 2. Target Users / Personas

- **Primary user**: 4–5 year old children (cannot read hiragana or English; minimal UI operation)
- **Secondary user**: parents (launching the app, supervising, configuring the API key)
- Environment: a home PC browser (local-first; Chromium-based browsers as the main target)

### Characteristics of young children (the most important design premise)

- Poor at turn-taking: they may **keep talking even after the answer has started**.
- They need long thinking time: **replies may start well after the teacher stops speaking**.
- Frequent silence, hesitation, and repetition.
- They cannot read → **the UI is primarily voice and pictures; text is secondary**.

---

## 3. Scope

### 3.1 In Scope

- A web app that runs locally via `npm run dev` or similar
- Real-time dialogue: microphone input → Gemini Live API → audio output
- Receive a Japanese question → present an English model phrase → prompt repetition → evaluate pronunciation → decide retry/next
- Conversation control that tolerates barge-in (child interruptions)
- A speaking character on screen (talking animation)
- A **local ephemeral-token server** so the API key is never exposed to the browser

### 3.2 Out of Scope

- Production deployment / authentication / multi-user / account management
- Persistent learning progress or analytics dashboards
- Language pairs other than English ↔ Japanese
- Native apps / mobile optimization
- Full billing, usage limits, or rate limiting (minimal only)

---

## 4. Functional Requirements

### FR-1 Session start
- FR-1.1: When a parent presses the "Start" button, request microphone permission and start a Live session.
- FR-1.2: On startup, fetch an ephemeral token from the token server and connect with it.
- FR-1.3: If microphone permission is denied, ask again with a picture and voice a child can understand.

### FR-2 Receiving questions (Japanese)
- FR-2.1: Accept the child's Japanese speech such as "How do you say ◯◯ in English?"
- FR-2.2: Even mid-question or during hesitation, the teacher waits without rushing (see turn-taking design below).

### FR-3 Presenting the model phrase (English)
- FR-3.1: The teacher speaks the target English expression **slowly, briefly, and in a child-friendly way**.
- FR-3.2: Example: ""Apple" だよ。リンゴは英語で "Apple"。いっしょに言ってみよう！" — English first, followed by a Japanese follow-up.
- FR-3.3: One model phrase is normally a **short expression of about 1–4 words**.

### FR-4 Prompting repetition
- FR-4.1: The teacher gently prompts the child to say the same English phrase.
- FR-4.2: Even if the child stays silent, the teacher **waits without rushing** for the configured time.
- FR-4.3: If there is still no response, repeat the model phrase → prompt again (with a maximum retry count).

### FR-5 Pronunciation evaluation
- FR-5.1: The teacher evaluates the child's pronunciation from the speech audio (heard directly by the native audio model).
- FR-5.2: Feedback is **always positive in tone** (never undermining a young child's self-esteem).
  - Good: "すごい！じょうずだね！"
  - Close: "いいね！もう一回、"ア"を強く言ってみよう！"
- FR-5.3: The evaluation result drives the next branch (FR-6).

### FR-6 Retry / move-on decision
- FR-6.1: If the pronunciation is good enough, **praise → guide to the next expression** ("ほかには何が知りたい？").
- FR-6.2: If not, **encourage → prompt the same expression again** (after N retries, gently move on).
- FR-6.3: State transitions are managed by an app-side state machine, driven by structured signals (tool calls) from the model (see below).

### FR-7 Character display
- FR-7.1: Show the teacher character in the center of the screen.
- FR-7.2: While the teacher is **speaking**, show a talking animation (mouth movement etc.).
- FR-7.3: Switch expressions/motions by state: child speaking (listening) / waiting / celebrating, etc.
- FR-7.4: Animation control logic is separated from rendering and unit-testable.

### FR-8 Turn-taking / barge-in (most important)
- FR-8.1: **The teacher never proactively talks over the child.**
- FR-8.2: The child can **interrupt at any time while the teacher is speaking**. On interruption,
  stop the teacher's audio output immediately and clear the playback queue (driven by the `interrupted` flag).
- FR-8.3: Allow the state where the teacher is speaking while still hearing the child (concurrency OK).
- FR-8.4: Tolerate long silence/thinking time from the child (do not end the turn on short silence).
  - Set the end-of-speech silence threshold long (e.g. 1200–2000 ms, to be tuned).
- FR-8.5: After an interruption, respond to the child's new utterance carrying over the context.

### FR-9 Parent-facing configuration
- FR-9.1: The API key is set via environment variables (`.env`) and never exposed to the browser.
- FR-9.2: When the session time limit is reached (15 minutes, audio-only), end gently or reconnect automatically.

---

## 5. Conversation Flow / State Machine

The app manages conversation progress with a pure state machine (reducer) over the states below.
Transitions are driven by (a) user audio events, (b) model audio / `interrupted`, and (c) model tool calls.

```
IDLE
  └─(start)──────────────► LISTENING_QUESTION   // wait for / listen to the child's question
LISTENING_QUESTION
  └─(question captured)──► TEACHING_EXAMPLE      // speak the English model phrase
TEACHING_EXAMPLE
  └─(example done)───────► PROMPT_REPEAT         // "いっしょに言ってみよう"
PROMPT_REPEAT
  ├─(child speaks)───────► LISTENING_REPEAT      // listen to the repetition
  └─(silence timeout)────► PROMPT_REPEAT (retry) / TEACHING_EXAMPLE
LISTENING_REPEAT
  └─(repeat captured)────► EVALUATING            // evaluate pronunciation
EVALUATING
  ├─(good enough)────────► PRAISE_NEXT ──► LISTENING_QUESTION
  └─(needs retry)────────► ENCOURAGE_RETRY ──► PROMPT_REPEAT
(any speaking state)
  └─(child barge-in)─────► stop + clear playback → corresponding LISTENING_*
```

- The evaluation verdict (good_enough / needs_retry) is **returned by the model via function calling** (e.g. `report_evaluation`), which branches the app-side state machine.
- After exceeding the retry cap (e.g. max 3 tries per expression), gently guide to the next expression.

---

## 6. Tech Stack / Architecture

### 6.1 Structure

```
[Browser SPA]  ──(1) GET /api/token──►  [Local Token Server (Node)]
     │                                         │ holds GEMINI_API_KEY (.env)
     │                                         └─► Gemini API: mint ephemeral token
     │  ◄────────────── ephemeral token ───────┘
     │
     └──(2) WebSocket (ephemeral token)──►  [Gemini Live API]
            mic PCM16/16kHz  ▲ │ ▼ audio 24kHz + transcripts + tool calls
```

- **(1) Token Server**: a minimal local Node server. Holds `GEMINI_API_KEY` and returns only
  short-lived ephemeral tokens to the browser. **The API key is never sent to the browser.**
- **(2) Browser SPA**: mic capture → Float32→PCM16/16kHz conversion → WS send;
  playback of received 24 kHz audio with queueing and barge-in flush; character rendering; state machine.

### 6.2 Technology choices

- Language/build: **TypeScript + Vite**
- UI: **React** (decided)
- Tests: **Vitest** (unit/integration) + **Playwright** (E2E / visual regression)
- Server: **Node (Express or plain http)** + the `@google/genai` SDK
- Audio: WebAudio API (PCM capture/playback via AudioWorklet)
- SDK: **`@google/genai`** (supports Live API / ephemeral tokens)

### 6.3 Directory layout (by feature/domain)

```
english_coach/
├── requirements.md
├── .env.example                 # GEMINI_API_KEY=...
├── server/
│   ├── tokenServer.ts           # ephemeral token minting
│   └── tokenServer.test.ts
├── src/
│   ├── audio/
│   │   ├── pcm.ts               # Float32↔PCM16, base64 (pure functions)
│   │   ├── pcm.test.ts
│   │   ├── playbackQueue.ts     # playback queue + barge-in flush
│   │   └── playbackQueue.test.ts
│   ├── live/
│   │   ├── liveConfig.ts        # model name / VAD / system instruction (pure)
│   │   ├── liveConfig.test.ts
│   │   ├── liveClient.ts        # WS connection & event bridging (I/O)
│   │   └── tools.ts             # function definitions such as report_evaluation
│   ├── conversation/
│   │   ├── stateMachine.ts      # conversation state reducer (pure)
│   │   └── stateMachine.test.ts
│   ├── character/
│   │   ├── characterController.ts  # speech state → animation state (pure logic)
│   │   ├── characterController.test.ts
│   │   └── Character.tsx           # rendering
│   ├── app/
│   │   └── App.tsx
│   └── main.tsx
├── e2e/
│   └── smoke.spec.ts
└── (vite/tsconfig/package.json etc.)
```

---

## 7. Gemini Live API Configuration Details (implementation policy)

| Item | Value / Policy |
|------|----------------|
| Model | `gemini-3.1-flash-live-preview` (native audio) |
| Connection | WebSocket (`@google/genai` Live session); the browser authenticates with an ephemeral token |
| Input audio | 16-bit PCM, little-endian, 16 kHz, `audio/pcm;rate=16000` |
| Output audio | 24 kHz PCM, `response_modalities: ["AUDIO"]` |
| Input transcription | `input_audio_transcription: {}` (logging / evaluation aid) |
| Output transcription | `output_audio_transcription: {}` (captions / debugging) |
| VAD | use `realtimeInputConfig.automaticActivityDetection` |
| Barge-in | `startOfSpeechSensitivity: HIGH` (easy for the child to interrupt) |
| End-of-speech | long `silenceDurationMs` (roughly 1200–2000 ms), `endOfSpeechSensitivity: LOW` (don't cut early) |
| Concurrency | use proactive audio so the teacher never needlessly talks over the child; allow listen-while-speaking |
| Voice | `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` (pick a gentle voice) |
| Tools | drive the state machine via function calling such as `report_evaluation(quality, should_retry)` |
| System instruction | states: for 4–5 year olds, short, gentle, always praise, English then Japanese follow-up, report evaluation via the tool |
| Session cap | 15 minutes audio-only; wrap up gently or reconnect before the cap |

> ⚠️ The Live API / 3.1 Flash Live is a **preview**. Re-check field and model names against the latest docs before implementing.

---

## 8. Non-Functional Requirements

- **NFR-1 Latency**: keep the gap between the child finishing speaking and the response starting as short as possible (feels immediate).
- **NFR-2 Security**: never expose the API key to the browser. Ephemeral tokens are short-lived.
  `.env` is git-ignored; only `.env.example` is committed.
- **NFR-3 Safety / child considerations**: output is always positive and uses safe vocabulary; have a policy for filtering inappropriate words.
- **NFR-4 Accessibility**: assume the child cannot read. One big button plus voice.
  Respect reduced-motion settings. Ensure color contrast.
- **NFR-5 Availability**: on network loss / token expiry, reconnect gently or show a child-friendly error (picture + voice).
- **NFR-6 Maintainability**: 200–400 lines per file (max 800); separate pure logic from I/O.

---

## 9. Test Strategy (TDD)

Follow TDD (RED → GREEN → REFACTOR). Unit-test pure logic heavily; keep I/O thin and cover it with integration/E2E tests.

### 9.1 Unit tests (Vitest, coverage target 80%+)
- `audio/pcm`: Float32→PCM16 range, clipping, endianness, base64 round-trip.
- `audio/playbackQueue`: ordering of consecutive chunks, queue flush on `interrupted`.
- `live/liveConfig`: generated model name / VAD params / system instruction / tool definitions.
- `conversation/stateMachine`: all transitions, retry cap, barge-in transitions, silence timeout.
- `character/characterController`: speaking/listening/waiting/celebrating → animation state mapping.

### 9.2 Integration tests
- `server/tokenServer`: successful minting, error when the API key is missing, no key leakage in responses.
- Mock Gemini for the Live client and verify event → state machine bridging.

### 9.3 E2E / visual regression (Playwright)
- Smoke: launch → "Start" → mic permission (mocked) → character visible.
- Screenshots at breakpoints 320/768/1024/1440; verify the talking-animation state.
- Replace Gemini with a test fake (never hit the real API in E2E).

---

## 10. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| 3.1 Flash Live is preview (API changes) | High | Check latest docs before implementing; wrap the SDK thinly |
| Pronunciation-evaluation accuracy for young children | Medium | Evaluate leniently and always positively; make thresholds tunable |
| False barge-in detection (ambient noise) | Medium | Tune VAD sensitivity; assume a quiet home environment |
| Browser audio-processing compatibility | Medium | Target Chromium browsers; assume AudioWorklet |
| 15-minute session cap | Low | Guide to a break or reconnect |
| Child privacy (voice) | High | Never store audio; local-first; minimal logging |

---

## 11. Acceptance Criteria

- AC-1: Runs locally; after granting mic permission in the browser, you can talk with the teacher by voice.
- AC-2: For a Japanese question, the full loop works: English model phrase → repetition prompt → pronunciation evaluation → retry/next guidance.
- AC-3: If the child interrupts while the teacher is speaking, the teacher's audio stops immediately and the child's speech is accepted.
- AC-4: The teacher waits without rushing even if the child is silent for several seconds (no turn cut on short silence).
- AC-5: While the teacher speaks, the character shows a talking animation.
- AC-6: The API key never appears in browser traffic or the bundle.
- AC-7: Unit tests for pure logic (pcm / stateMachine / liveConfig / characterController) are green with 80%+ coverage.

---

## 12. Decisions / Open Items

### Decided (2026-06-28)
1. UI framework: **React + Vite**.
2. Character assets: **hand-made SVG + mouth animation** (no dependencies; reduced-motion support).
3. Opening behavior: **the teacher greets first** (`greeting` phase).
4. Interruptions during the model phrase: **the model phrase is spoken to completion** (`teachingExample` is not interrupted by the child's speech).
5. Off-topic utterances: **go along briefly, then steer back** (`chitchat` phase → back to waiting for a question).
6. Evaluation granularity: **3 levels — `good` / `close` / `poor`**.
   - `good` → praise and move on
   - `close` → pinpoint tip, retry the same expression
   - `poor` → back to the model phrase (re-present and retry)
7. Retry cap N = **3** (max 3 tries per expression, then gently move on).
8. Silence wait = **8000 ms** (fed to the state machine as a `SILENCE_TIMEOUT` event).

### Open (to be settled during implementation)
- The teacher's voice (voiceName) and the ratio of English to Japanese follow-up.
- The `@google/genai` version and the final field names for 3.1 Flash Live (settled right before implementation).
