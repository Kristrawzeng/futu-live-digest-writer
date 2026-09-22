# Futu Live Digest Writer｜功能營直播精華生成器

把直播字幕或筆記加工成一套繁體中文內容：標題備選、嘉賓金句、深度直播精華帖，以及內容質量與金融合規審核。

## 線上版（GitHub Pages）

本工具已支持純前端部署，無需伺服器。Fork 後到倉庫 Settings → Pages → Source 選「GitHub Actions」，推送到 main 即自動部署。部署完成後獲得 `https://<你的用戶名>.github.io/futu-live-digest-writer/` 公開網址，任何人可用。

線上版運行方式：

- 提示詞已內聯到 `web/app.js`，零網絡請求即可啟動
- AI 調用從瀏覽器直連模型供應商（DeepSeek 等支援 CORS 的供應商可直連；OpenAI 等不支援 CORS 的需用戶自行跑 `node server.js` 走本地代理）
- 用戶各自填自己的 API Key，密鑰只存在各自瀏覽器，不經任何第三方

### 部署步驟

1. Fork 本倉庫
2. 進入倉庫 Settings → Pages → Source 選「GitHub Actions」
3. 推送到 main 分支（或隨便改一下觸發部署）
4. 等 Actions 跑完，得到 `https://<用戶名>.github.io/futu-live-digest-writer/` 網址
5. 打開網址 → 右上角「⚙ 設定」→ 選供應商填 API Key → 開始用

## 本地版（node server.js）

無需安裝任何套件，一條指令啟動：

```bash
node server.js
```

瀏覽器會自動打開 `http://localhost:8787`。若連接埠被佔用：`node server.js --port 8788`。

功能：

- 貼入字幕 →「一鍵生成四部曲」：標題備選 → 嘉賓金句 → 直播精華 → 內容審核
- 兩種風格預設：富途社區（深度精華）／牛友故事（短小精悍、实盤選手向）
- 右側 AI 對答：帶整份字幕與當前初稿上下文，可直接下指令改寫；快捷指令一鍵重寫某一部分（標題更犀利、正文壓縮三成、換個開頭、合規再檢查等）
- 生成結果可在頁面直接編輯，匯出為 Markdown
- API 密鑰只保存在本機瀏覽器 localStorage，經本地伺服器直連模型供應商，不經任何第三方

首次使用點右上角「⚙ 設定」選擇供應商（DeepSeek／OpenAI／Kimi／通義／智譜／自訂）並填 API Key。提示詞仍以 `prompts/*.md` 為單一來源，改動 .md 網頁版即時生效。

### 目錄

```text
futu-live-digest-writer/
├── SKILL.md
├── README.md
├── server.js              ← 網頁版：零依賴本地伺服器 + API 流式代理
├── web/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── agents/
│   └── openai.yaml
├── prompts/
│   ├── title_generator.md
│   ├── quote_extractor.md
│   ├── article_writer.md
│   └── quality_checker.md
└── examples/
    ├── example_ai_live.md
    └── example_trading_live.md
```

## Skill 版用法（Codex）

把整個資料夾複製到 Codex 的 Skills 目錄，然後以 `$futu-live-digest-writer` 呼叫。提交 TXT、Markdown、Word、PDF 字幕或直播筆記；如有直播標題、嘉賓資料、PPT 或產品截圖，可一併提供。

示例指令：

```text
使用 $futu-live-digest-writer，把這份直播字幕整理成完整的功能營直播精華包。保留案例與產品操作邏輯，對無法核實的內容列出待確認事項。
```

## 固定輸出

1. 8–10 個分類標題
2. 約 8 條嘉賓金句
3. 2–4 段開頭及 8–10 個大章節的深度精華
4. 已修正事項、待確認事項及合規提示

本 Skill 不連接外部數據，也不自行補充即時行情或未經來源確認的產品能力。
