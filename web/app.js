/* Futu Live Digest Writer — 網頁版核心邏輯 */
'use strict';

/* ══════════ 常量 ══════════ */

const PROVIDERS = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openai:   { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  moonshot: { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k' },
  qwen:     { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  zhipu:    { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  custom:   { baseUrl: '', model: '' }
};

const STAGES = [
  { key: 'titles',  label: '標題備選', promptKey: 'title_generator',  maxTokens: 2000 },
  { key: 'quotes',  label: '嘉賓金句', promptKey: 'quote_extractor',   maxTokens: 2500 },
  { key: 'article', label: '直播精華', promptKey: 'article_writer',    maxTokens: 8000 },
  { key: 'review',  label: '內容審核', promptKey: 'quality_checker',   maxTokens: 3000 }
];

/* 提示詞內聯——與 prompts/*.md 內容同步，確保純前端部署也能離線取得 */
const PROMPTS = {
  title_generator: [
    '# 標題生成器',
    '',
    '## 任務',
    '根據事實表與字幕內容生成 8–10 個中文標題，語言跟隨字幕（簡體字幕用簡體，繁體字幕用繁體）。標題要讓讀者知道能學到甚麼，同時保持來源忠實。',
    '',
    '## 配額',
    '- 方法論型：3–4 個，突出步驟、框架或可複用方法。',
    '- 痛點型：2–3 個，呈現直播實際解決的困難或常見錯誤。',
    '- 功能型：2–3 個，突出產品功能的使用場景與價值。',
    '',
    '## 規則',
    '- 優先使用來源中的具體方法、功能、場景或限制。',
    '- 數字只在來源明確支持時使用；步驟數須與正文一致。',
    '- 嘉賓身份不清楚時，不自行冠以「高手」「專家」等稱號。',
    '- 不使用「必賺」「穩贏」「翻倍」「準確預測」或同類承諾。',
    '- 不用空泛的「震撼揭秘」「顛覆認知」等行銷黑話。',
    '- 標題應自然、具體，避免所有候選只替換少量詞語。',
    '',
    '## 輸出',
    '### 方法論型',
    '1. ……',
    '### 痛點型',
    '1. ……',
    '### 功能型',
    '1. ……',
    '最後補一行：`首選：……`，並用一句話說明選擇理由。'
  ].join('\n'),
  quote_extractor: [
    '# 嘉賓金句提取器',
    '',
    '## 任務',
    '從字幕中挑選約 8 條能獨立成立的嘉賓金句，優先順序為：方法論觀點、交易理念、反常識觀點、產品價值觀點。',
    '',
    '## 忠實度分級',
    '- **原句**：只修正明顯錯字、標點與無意義口頭禪。',
    '- **輕度整理**：合併同一語意段內的短句，刪除重複口語，不改變主語、條件、程度或結論。',
    '- **不可作直接引語**：若需跨段概括或大幅改寫，改列為正文轉述，不放進金句。',
    '',
    '## 規則',
    '- 不編造、不拔高、不把主持人的總結當作嘉賓原話。',
    '- 保留「可能、通常、在某些情況下」等限定語。',
    '- 避免純寒暄、單獨數據、沒有上下文便無法理解的殘句。',
    '- 不把多位發言者的內容拼成一句。',
    '- 若可識別時間碼或頁碼，在內部核對時保留定位；如用戶要求可在輸出附上。',
    '- 來源不足 8 條時輸出實際數量，不湊句。',
    '',
    '## 輸出',
    '**金句一｜主題標籤**  ',
    '「……」',
    '依此編號。若句子經輕度整理，在審核部分統一註明，不必在每條後加干擾性標記。'
  ].join('\n'),
  article_writer: [
    '# 深度直播精華撰寫器',
    '',
    '## 任務',
    '把事實表加工成一篇可讀、可學、可核查的中文直播精華，語言跟隨字幕（簡體字幕用簡體，繁體字幕用繁體）。這是一篇編輯文章，不是逐段會議紀要，也不是簡短摘要。',
    '',
    '## 結構',
    '1. `直播精華`',
    '2. `標題：……`',
    '3. 開頭 2–4 段：交代直播主題、市場或使用背景、嘉賓要解決的問題、核心方法論。',
    '4. 正文 8–10 個大章節：按內容邏輯排序，不要把同一主題切成大量碎小標。',
    '5. 結尾：總結可帶走的方法，重申適用條件與風險，不作收益號召。',
    '',
    '## 章節寫法',
    '每個章節按素材選用以下元素，形成自然敘事：',
    '- 問題：讀者或嘉賓面對甚麼困難？',
    '- 觀點：嘉賓如何理解？',
    '- 案例：直播用了甚麼例子、數據或演示？',
    '- 應用：讀者如何理解其操作流程或決策邏輯？',
    '- 限制：何時可能不適用？有哪些風險？',
    '不要硬套五段式；素材缺少某一元素時不要補造。',
    '',
    '## 保留與轉述',
    '- 保留具體步驟、條件、時間範圍、數據口徑和案例結果。',
    '- 第一次出現專有名詞時，用一句白話解釋。',
    '- 使用「嘉賓認為／演示／以……為例」明確標示觀點歸屬。',
    '- 對語病作編輯性整理，但不改變因果、時間、程度與風險條件。',
    '- 若字幕疑似識別錯誤，採保守寫法並列入待確認事項。',
    '',
    '## 產品功能',
    '描述牛牛功能時，連接「使用動機 → 場景 → 操作邏輯 → 解決問題」。例如，不只說支持條件單，而要在來源支持時說明嘉賓如何預設觸發條件，讓不能持續盯盤的投資者仍可按計劃執行。',
    '',
    '## AI 內容',
    '只描述來源支持的用途，如信息整理、數據分析、研究輔助、策略生成及回測輔助。把生成內容稱為研究或決策參考，不把 AI 描述為股價預測器。',
    '',
    '## 文風',
    '- 採香港財經媒體與富途社區可讀風格。',
    '- 句式長短相間，以具體動詞代替空泛形容詞。',
    '- 適量引用金句，但正文仍以解釋和案例為主。',
    '- 避免「在瞬息萬變的市場中」「本次直播乾貨滿滿」等模板開頭。'
  ].join('\n'),
  quality_checker: [
    '# 內容質量與合規檢查器',
    '',
    '## 執行方式',
    '逐項比對來源與成稿。可直接修正的內容先修正，再輸出精簡審核報告；無法核實的內容不得擅自補足。',
    '',
    '## A. 來源忠實度',
    '- [ ] 所有姓名、身份、標的、數字、日期、步驟均有來源支持。',
    '- [ ] 直接引語沒有改變主語、條件、語氣強度與結論。',
    '- [ ] 嘉賓觀點、主持人觀點、編輯轉述清楚分開。',
    '- [ ] 沒有把疑似字幕錯字當成確定事實。',
    '',
    '## B. 內容完整度',
    '- [ ] 標題、金句、深度精華、審核四部分齊全。',
    '- [ ] 文章保留重要案例、數據、流程、產品演示與方法論。',
    '- [ ] 開頭交代主題、背景、問題與核心方法。',
    '- [ ] 正文說清為甚麼、怎樣做、適用時機與限制。',
    '',
    '## C. 產品與 AI',
    '- [ ] 每項牛牛功能均說明使用原因、場景、操作邏輯和解決的問題，或標示來源不足。',
    '- [ ] 沒有臆測未展示的按鈕、流程或產品能力。',
    '- [ ] AI 只被描述為整理、分析、研究、策略或回測輔助。',
    '- [ ] 沒有宣稱 AI 能準確預測市場或保證收益。',
    '',
    '## D. 金融合規',
    '- [ ] 沒有收益保證、確定性買賣建議或未來回報預測。',
    '- [ ] 案例與個別標的已標明屬直播內容整理，不構成投資建議。',
    '- [ ] 回測標示為歷史模擬／嘉賓展示／特定時間範圍（依來源適用），並附歷史表現不代表未來的提示。',
    '- [ ] 風險、前提和例外沒有被刪除或弱化。',
    '',
    '## E. 語言與可讀性',
    '- [ ] 全文語言與字幕一致（簡體或繁體），用詞一致。',
    '- [ ] 沒有過密小標、重複段落、新聞稿腔或 AI 套話。',
    '- [ ] 標題具體且不誇大；章節次序合理。',
    '- [ ] 金句可獨立理解，文章不是「嘉賓分享了某事」式流水帳。',
    '',
    '## 審核輸出',
    '### 總評',
    '`通過／修正後通過／需補充來源`，附一句理由。',
    '### 已修正事項',
    '- 列出重要修改；沒有則寫「無」。',
    '### 待確認事項',
    '- 列出缺少依據、字幕疑點或需要用戶確認的內容；沒有則寫「無」。',
    '### 合規提示',
    '用 1–2 句概括文章的投資風險聲明，不用冗長法律文字。'
  ].join('\n')
};

const STYLES = {
  futu: [
    '【風格預設：富途社區】',
    '- 中文，語言跟隨字幕（簡體/繁體），香港財經媒體／富途社區可讀風格，專業、自然、易懂。',
    '- 句式長短相間，以具體動詞代替空泛形容詞。',
    '- 適量引用金句，但正文以解釋、案例和數據為主。',
    '- 避免「在瞬息萬變的市場中」「本次直播乾貨滿滿」等模板開頭。'
  ].join('\n'),
  bullfriend: [
    '【風格預設：牛友故事·短小精悍】目標讀者是親自下場做实盤的投資選手：',
    '- 短小精悍：每段 150–300 字，一段只講清一個实盤道理，拒絕長篇鋪墊。',
    '- 实盤錨點：每個觀點盡量落在「一單交易」上——入場點、止損位、倉位邏輯、心態斷層；少談宏觀、多講單子。',
    '- 金句優先挑「反常識、可獨立成立、有实盤味」的句子，例如「沒有符合條件，也是一個結果」。',
    '- 每個觀點可配一句「牛友點」：一句話點出這條對实盤選手最有用的地方。',
    '- 口吻像操盤手之間對話，具體數字與動作優先於形容詞。',
    '- 合規不變：不用「必賺」「穩贏」，不給確定性買賣建議，風險提示保留。'
  ].join('\n')
};

const CORE_RULES = [
  '【核心編輯原則】適用所有階段：',
  '- 最高原則：忠於來源、保留方法、解釋場景、明示限制。不要把逐字稿壓縮成流水帳式摘要。',
  '- 輸出語言：跟隨用戶輸入的字幕語言。字幕是簡體中文就輸出簡體，是繁體就輸出繁體，是粵語口語就保留粵語用詞。不要把簡體轉成繁體，也不要中英混雜。',
  '- 區分「嘉賓原話」「編輯轉述」「資料不足」；所有輸出只用來源能支持的內容，不得猜測或虛構。',
  '- 保留具體案例、數字、時間範圍、標的名稱與操作流程；展開「為甚麼、怎樣做、何時適用、限制是甚麼」。',
  '- 直接引語不得由編輯轉述冒充；合併口語時不得改變主語、條件、程度或結論，保留「可能、通常、在某些情況下」等限定語。',
  '- 資料不完整時，把缺失資訊列入「待確認事項」，不要猜測，不要為湊數虛構章節或金句。',
  '- 不用新聞稿腔、空泛形容詞、過度行銷話術或整齊到失真的 AI 模板句。',
  '',
  '【功能營規則】提到牛牛功能時，至少說清：為何使用、甚麼場景、操作邏輯、解決甚麼問題、有甚麼限制。字幕只證明功能名稱時，不得補寫操作細節。',
  '',
  '【AI 與金融合規】',
  '- AI 只能描述為信息整理、數據分析、研究輔助、策略生成或回測輔助工具；不得寫成能預測股價或保證收益。',
  '- 不提供確定性買賣建議、收益保證、未來回報預測或煽動性指令。',
  '- 回測須標明「歷史模擬／嘉賓展示／特定時間範圍」，並說明歷史結果不代表未來表現。',
  '- 個別標的僅作直播內容整理，不構成投資建議。'
].join('\n');

const MAX_TRANSCRIPT = 60000;   // 送入模型的字幕上限（字）
const MAX_CHAT_TRANSCRIPT = 20000;
const SAMPLE_TRANSCRIPT = [
  '嘉賓：我先看日線方向，再用較短週期找入場位置。兩者不一致，我通常不做。',
  '嘉賓：因為工作時不能一直盯盤，我會預先設定觸發價格和失效條件。條件單只是幫我執行事先寫好的計劃，不能保證成交價，也不能替我控制所有風險。',
  '主持人：所以重點不是多做交易？',
  '嘉賓：對，沒有符合條件也是一個結果。'
].join('\n');

/* ══════════ 狀態 ══════════ */

const state = {
  config: {
    provider: 'deepseek',
    baseUrl: PROVIDERS.deepseek.baseUrl,
    apiKey: '',
    model: PROVIDERS.deepseek.model,
    temperature: 0.7
  },
  meta: { title: '', guest: '', source: '' },
  style: 'futu',
  transcript: '',
  outputs: { titles: '', quotes: '', article: '', review: '' },
  chatHistory: [],
  activeStage: 'titles',
  running: null
};

const promptCache = {};

/* ══════════ DOM ══════════ */

const $ = (id) => document.getElementById(id);
const dom = {
  metaTitle: $('metaTitle'), metaGuest: $('metaGuest'), metaSource: $('metaSource'),
  styleSelect: $('styleSelect'), transcript: $('transcript'), charCount: $('charCount'),
  btnSample: $('btnSample'), btnClearInput: $('btnClearInput'),
  btnGenerate: $('btnGenerate'), btnStop: $('btnStop'), log: $('log'),
  stageTabs: $('stageTabs'), outputArea: $('outputArea'), outStatus: $('outStatus'),
  btnRerun: $('btnRerun'), btnCopy: $('btnCopy'),
  chatLog: $('chatLog'), chips: $('chips'), chatInput: $('chatInput'), btnChatSend: $('btnChatSend'),
  btnExport: $('btnExport'), btnClearAll: $('btnClearAll'), btnSettings: $('btnSettings'),
  modal: $('settingsModal'),
  provider: $('provider'), baseUrl: $('baseUrl'), apiKey: $('apiKey'),
  model: $('model'), temperature: $('temperature'), tempVal: $('tempVal'),
  btnTest: $('btnTest'), testResult: $('testResult'), btnSaveSettings: $('btnSaveSettings'),
  toast: $('toast')
};

/* ══════════ 工具 ══════════ */

function toast(msg, type) {
  dom.toast.textContent = msg;
  dom.toast.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => dom.toast.classList.add('hidden'), 3200);
}

function log(msg, type) {
  const div = document.createElement('div');
  div.className = 'entry' + (type ? ' ' + type : '');
  div.textContent = new Date().toLocaleTimeString('zh-HK', { hour12: false }) + '　' + msg;
  dom.log.appendChild(div);
  dom.log.scrollTop = dom.log.scrollHeight;
}

async function fetchText(promptKey) {
  /* 純前端部署：直接使用內聯提示詞，零網絡請求 */
  if (PROMPTS[promptKey]) return PROMPTS[promptKey];
  /* 本地開發降級：嘗試從本地伺服器讀取 prompts/*.md（與 .md 保持同步用） */
  const url = 'prompts/' + promptKey + '.md';
  const r = await fetch(url);
  if (r.ok) return await r.text();
  throw new Error('無法取得提示詞：' + promptKey);
}

function saveState() {
  try {
    localStorage.setItem('fldw.config', JSON.stringify(state.config));
    localStorage.setItem('fldw.draft', JSON.stringify({
      meta: state.meta, style: state.style,
      transcript: state.transcript, outputs: state.outputs
    }));
  } catch (e) { /* 忽略儲存失敗 */ }
}
function loadState() {
  try {
    const cfg = JSON.parse(localStorage.getItem('fldw.config') || 'null');
    if (cfg) state.config = { ...state.config, ...cfg };
    const draft = JSON.parse(localStorage.getItem('fldw.draft') || 'null');
    if (draft) {
      state.meta = draft.meta || state.meta;
      state.style = draft.style || state.style;
      state.transcript = draft.transcript || '';
      state.outputs = { ...state.outputs, ...(draft.outputs || {}) };
    }
  } catch (e) { /* 忽略 */ }
}

function transcriptForApi() {
  let t = state.transcript.trim();
  if (!t) return '';
  /* 字幕預處理：清洗 ASR 逐字稿的常見問題，不改變原意 */
  t = preprocessTranscript(t);
  if (t.length <= MAX_TRANSCRIPT) return t;
  return t.slice(0, MAX_TRANSCRIPT) + '\n\n【注意：字幕過長已被截斷，以下內容未納入本次生成】\n' + t.slice(MAX_TRANSCRIPT, MAX_TRANSCRIPT + 80) + '…';
}

/* 逐字稿預處理：去口語贅詞、合併斷句、標記疑似識別錯誤，不改變原意 */
function preprocessTranscript(text) {
  let lines = text.split('\n');
  let result = [];
  let buf = '';

  for (let raw of lines) {
    let line = raw.trim();
    if (!line) { flushBuf(); continue; }

    /* 去掉行首重複的口語贅詞 */
    line = line.replace(/^[\s]*(呃+|嗯+|啊+|哎+|呃，|嗯，|啊，|哦，|噢，)+/g, '');
    /* 合併結巴：我我我我→我，這這這→這 */
    line = line.replace(/(.)\1{3,}/g, '$1$1');
    /* 去掉句中多餘的「對吧」「是不是」「嗯」等口頭禪（保留語意完整的） */
    line = line.replace(/，對吧[，。]?/g, '。');
    line = line.replace(/，是不是[，。]/g, '。');
    /* 偵測疑似 ASR 識別錯誤的段落（大量英文夾雜且無意義） */
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(line) && line.split(' ').length > 4 && !/[\u4e00-\u9fff]/.test(line)) {
      line = '【疑似語音識別錯誤，原句：' + line + '】';
    }

    /* 累積成段：如果當前行短，且與上一行語意連貫，合併 */
    if (buf) {
      buf = buf + line;
    } else {
      buf = line;
    }
    /* 句號、問號、感嘆號結尾的行視為完整句，flush */
    if (/[。！？\?\!]$/.test(buf) && buf.length > 40) {
      flushBuf();
    }
  }
  flushBuf();

  function flushBuf() {
    if (buf) {
      let s = buf.trim();
      if (s) result.push(s);
      buf = '';
    }
  }

  let out = result.join('\n');
  /* 標記發言人（如果原始字幕有「嘉賓：」「主持人：」之類）保留 */
  return out;
}

function buildSystemPrompt(stagePrompt) {
  return [
    '你是一位資深財經內容編輯，負責把直播字幕加工成可發佈的中文二傳精華帖。輸出語言跟隨用戶輸入的字幕語言：簡體字幕輸出簡體，繁體字幕輸出繁體，不要中英混雜，不要把簡體轉成繁體。',
    '',
    '【字幕來源說明】輸入的直播字幕為語音識別（ASR）逐字稿，可能含：重複口語、結巴、無意義贅詞、疑似識別錯誤的段落（已標記【疑似語音識別錯誤】）。處理原則：',
    '- 合併重複口語，去贅詞，但不改變原意、因果、程度與風險條件。',
    '- 遇到【疑似語音識別錯誤】的段落，不採用其內容，改從上下文推斷嘉賓實際表達的意思；若無法推斷則列入待確認事項。',
    '- 專有名詞（如英偉達、戴爾、美聯儲、SpaceX）以上下文語境判斷正確寫法，ASR 識別錯誤的專有名詞可在成稿中修正為正確名稱。',
    '',
    CORE_RULES,
    '',
    STYLES[state.style] || STYLES.futu,
    '',
    '【本階段任務說明】',
    stagePrompt
  ].join('\n');
}

function baseUserMessage(stageExtra) {
  const m = state.meta;
  return [
    '以下是一次直播的原始資料。請先建立內部事實表（主題、背景、嘉賓觀點與方法、案例數字、產品功能、風險提醒），再按系統指示輸出本階段內容；只使用字幕能支持的內容。',
    '',
    '直播標題：' + (m.title.trim() || '（未提供）'),
    '嘉賓／身份：' + (m.guest.trim() || '（未提供）'),
    '來源：' + (m.source.trim() || '（未提供）'),
    stageExtra || '',
    '',
    '【字幕／筆記全文】',
    transcriptForApi()
  ].filter((s) => s !== '').join('\n');
}

/* ══════════ 流式請求 ══════════ */

async function* streamChatCompletions(messages, { signal, temperature, maxTokens }) {
  const cfg = state.config;
  const body = JSON.stringify({
    model: cfg.model,
    messages: Array.isArray(messages) ? messages : [],
    temperature,
    max_tokens: maxTokens || 2048,
    stream: true
  });
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey };

  /* 優先純前端直連供應商（GitHub Pages 部署用，無需本地伺服器）；
     若 CORS 被攔（如 OpenAI），自動降級到本地 /api/chat 代理（需 node server.js 運行） */
  let res;
  try {
    res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers, body, signal
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error?.message || j.error || 'HTTP ' + res.status);
    }
  } catch (directErr) {
    /* 直連失敗——CORS 攔截或網絡錯誤——降級到本地代理 */
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, messages, temperature, max_tokens: maxTokens || 2048, stream: true }),
        signal
      });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const j = await res.json(); msg = j.error?.message || j.error || msg; } catch (e) { msg = await res.text().catch(() => msg); }
        throw new Error(msg);
      }
    } catch (proxyErr) {
      /* 兩條路都不通——給用戶一個可理解的錯誤 */
      if (directErr.message.includes('Failed to fetch') || directErr.message.includes('NetworkError')) {
        throw new Error('無法直連模型供應商（可能被 CORS 攔截），本地代理也沒啟動。請執行 node server.js，或改用支援瀏覽器直連的供應商（如 DeepSeek）。');
      }
      throw directErr;
    }
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream')) {
    const j = await res.json();
    yield j.choices?.[0]?.message?.content || '';
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data);
        const d = j.choices?.[0]?.delta?.content;
        if (d) yield d;
      } catch (e) { /* 忽略半行 JSON */ }
    }
  }
}

function assertConfigured() {
  if (!state.config.apiKey.trim() || !state.config.baseUrl.trim()) {
    dom.modal.showModal();
    toast('請先填好 API Key 與 Base URL', 'err');
    return false;
  }
  return true;
}
/* ══════════ 流水線 ══════════ */

function setStageDot(key, cls) {
  document.querySelectorAll('.stage-tab').forEach((el) => {
    if (el.dataset.key !== key) return;
    el.classList.remove('run', 'done', 'err');
    if (cls) el.classList.add(cls);
  });
}

async function runStage(key, extraInstruction) {
  const stage = STAGES.find((s) => s.key === key);
  if (!stage) return;
  if (!assertConfigured()) return;
  if (!state.transcript.trim()) { toast('請先貼入字幕', 'err'); return; }
  if (state.running) { toast('已有任務在執行', 'err'); return; }

  const controller = new AbortController();
  state.running = controller;
  setBusy(true);
  setStageDot(key, 'run');
  switchTab(key);
  dom.outputArea.value = '';
  dom.outStatus.textContent = '生成中…';
  log('開始生成：' + stage.label + (extraInstruction ? '（含優化指令）' : ''), 'run');

  try {
    const stagePrompt = await fetchText(stage.promptKey);
    const extra = extraInstruction ? '\n\n【額外修改要求】\n' + extraInstruction : '';
    let userContent = baseUserMessage('') + extra;

    if (key === 'article') {
      userContent += '\n\n【標題備選（已生成）】\n' + (state.outputs.titles || '（未生成）')
        + '\n\n【嘉賓金句（已生成）】\n' + (state.outputs.quotes || '（未生成）')
        + '\n\n寫作指示：文章標題使用「首選」推薦標題（若無標明則自選最合適的一個）。';
    }
    if (key === 'review') {
      userContent += '\n\n【已生成成稿】請逐項比對下方成稿與上方字幕來源。\n\n'
        + (state.outputs.titles ? '一、標題備選\n' + state.outputs.titles + '\n\n' : '')
        + (state.outputs.quotes ? '二、嘉賓金句\n' + state.outputs.quotes + '\n\n' : '')
        + (state.outputs.article ? '三、直播精華\n' + state.outputs.article : '（未生成）');
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(stagePrompt) },
      { role: 'user', content: userContent }
    ];

    let acc = '';
    for await (const delta of streamChatCompletions(messages, {
      signal: controller.signal,
      temperature: state.config.temperature,
      maxTokens: stage.maxTokens
    })) {
      acc += delta;
      dom.outputArea.value = acc;
      dom.outputArea.scrollTop = dom.outputArea.scrollHeight;
    }

    state.outputs[key] = acc;
    setStageDot(key, 'done');
    dom.outStatus.textContent = '✓ 完成 ' + new Date().toLocaleTimeString('zh-HK', { hour12: false });
    log('完成：' + stage.label, 'ok');
    saveState();
    return acc;
  } catch (e) {
    if (e.name === 'AbortError') {
      setStageDot(key, '');
      dom.outStatus.textContent = '已停止';
      log('已停止：' + stage.label);
    } else {
      setStageDot(key, 'err');
      dom.outStatus.textContent = '✗ 失敗';
      log('失敗：' + stage.label + ' — ' + e.message, 'err');
      toast(e.message, 'err');
    }
  } finally {
    state.running = null;
    setBusy(false);
  }
}

function setBusy(busy) {
  dom.btnGenerate.disabled = busy;
  dom.btnRerun.disabled = busy;
  dom.btnChatSend.disabled = busy;
  dom.btnStop.classList.toggle('hidden', !busy);
  dom.btnGenerate.classList.toggle('hidden', busy);
}

async function runAll() {
  if (!assertConfigured()) return;
  if (!state.transcript.trim()) { toast('請先貼入字幕', 'err'); return; }
  if (state.running) return;
  log('── 開始四部曲生成 ──');
  for (const stage of STAGES) {
    await runStage(stage.key);
    if (!state.running && !state.outputs[stage.key]) return; // 中途出錯或停止
  }
  if (state.outputs.review) log('── 四部曲完成，可在輸出欄手動編輯，或用右下角 AI 對答繼續優化 ──', 'ok');
}

/* ══════════ 頁籤與輸出欄 ══════════ */

function switchTab(key) {
  state.activeStage = key;
  dom.stageTabs.querySelectorAll('.stage-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.key === key);
  });
  dom.outputArea.value = state.outputs[key] || '';
  dom.outStatus.textContent = '';
}

/* ══════════ AI 對答 ══════════ */

function mdLite(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '';
  let inList = null;
  for (const raw of esc.split('\n')) {
    const line = raw
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    if (/^#{1,4} /.test(line)) {
      if (inList) { html += '</' + inList + '>'; inList = null; }
      html += '<h4>' + line.replace(/^#{1,4} /, '') + '</h4>';
    } else if (/^\s*[-•] /.test(line)) {
      if (inList !== 'ul') { if (inList) html += '</' + inList + '>'; html += '<ul>'; inList = 'ul'; }
      html += '<li>' + line.replace(/^\s*[-•] /, '') + '</li>';
    } else if (/^\s*\d+\. /.test(line)) {
      if (inList !== 'ol') { if (inList) html += '</' + inList + '>'; html += '<ol>'; inList = 'ol'; }
      html += '<li>' + line.replace(/^\s*\d+\. /, '') + '</li>';
    } else {
      if (inList) { html += '</' + inList + '>'; inList = null; }
      if (line) html += line + '<br>';
    }
  }
  if (inList) html += '</' + inList + '>';
  return html;
}

function addChatMsg(role, content) {
  dom.chatLog.querySelector('.chat-empty')?.remove();
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.innerHTML = mdLite(content);
  if (role === 'assistant') {
    const foot = document.createElement('div');
    foot.className = 'msg-foot';
    const btn = document.createElement('button');
    btn.className = 'msg-copy';
    btn.textContent = '複製';
    btn.onclick = () => copyText(content);
    foot.appendChild(btn);
    div.appendChild(foot);
  }
  dom.chatLog.appendChild(div);
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
  return div;
}

function buildChatContext() {
  const m = state.meta;
  const t = state.transcript.trim().slice(0, MAX_CHAT_TRANSCRIPT);
  const parts = [
    '【直播資料】',
    '直播標題：' + (m.title.trim() || '（未提供）'),
    '嘉賓／身份：' + (m.guest.trim() || '（未提供）'),
    '字幕（截取）：' + (t || '（未提供）')
  ];
  const secs = [
    ['標題備選', state.outputs.titles],
    ['嘉賓金句', state.outputs.quotes],
    ['直播精華', state.outputs.article],
    ['內容審核', state.outputs.review]
  ];
  for (const [label, text] of secs) {
    if (text) parts.push('【' + label + '】\n' + text.slice(0, 2500));
  }
  return parts.join('\n\n');
}

const CHAT_SYSTEM = [
  '你是本工具內置的編輯助手，與用戶用中文對答（語言跟隨用戶輸入），協助把直播二傳精華帖改得更好。',
  '你隨時擁有直播字幕與當前初稿的上下文；用戶要求修改某一段時，直接輸出改好後的完整段落或全文，讓用戶可以複製使用。',
  '始終遵守：忠於來源、不虛構、不給收益承諾、保留風險提示與限定語。',
  '回答要具體，直接給可用的文字，不要長篇解釋你的思考過程。'
].join('\n');

async function sendChat(text) {
  text = (text || '').trim();
  if (!text) return;
  if (!assertConfigured()) return;
  if (state.running) { toast('請先等當前生成完成', 'err'); return; }

  addChatMsg('user', text);
  dom.chatInput.value = '';
  state.chatHistory = state.chatHistory.slice(-19);
  state.chatHistory.push({ role: 'user', content: text });

  const div = addChatMsg('assistant', '');
  div.classList.add('chat-streaming');
  const controller = new AbortController();
  state.running = controller;
  setBusy(true);

  const messages = [
    { role: 'system', content: CHAT_SYSTEM + '\n\n【當前上下文】\n' + buildChatContext() },
    ...state.chatHistory
  ];

  let acc = '';
  try {
    for await (const delta of streamChatCompletions(messages, {
      signal: controller.signal,
      temperature: state.config.temperature,
      maxTokens: 4000
    })) {
      acc += delta;
      div.innerHTML = mdLite(acc);
      div.scrollIntoView({ block: 'end' });
      dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
    }
    div.classList.remove('chat-streaming');
    state.chatHistory.push({ role: 'assistant', content: acc });
  } catch (e) {
    div.classList.remove('chat-streaming');
    if (e.name === 'AbortError') {
      div.innerHTML = '（已停止）';
    } else {
      div.innerHTML = '✗ ' + mdLite(e.message);
    }
  } finally {
    state.running = null;
    setBusy(false);
  }
}

const CHIP_ACTIONS = {
  'punchier-titles': { stage: 'titles', label: '標題更犀利', instruction: '在遵守合規與來源忠實的前提下，讓標題更有鉤子、更具體、更貼近实盤讀者的痛點；同時保留分型與「首選」行。' },
  'sharper-quotes': { stage: 'quotes', label: '金句更精煉', instruction: '每條金句再精煉，去掉多餘口語與無關前綴，保留限定語，確保脫離上下文仍可獨立理解。' },
  'compress': { stage: 'article', label: '正文壓縮三成', instruction: '整體壓縮約 30%，刪除空泛過渡句與重複論述，但保留案例、數據、操作流程與風險提示。' },
  'new-opener': { stage: 'article', label: '換個開頭', instruction: '只重寫開頭 2–4 段（更有現場感、更直接切入主題），正文其餘部分原樣保留。' },
  'recheck': { stage: 'review', label: '合規再檢查', instruction: '以更嚴格標準逐項複查合規問題，凡有收益暗示、確定性買賣建議或未經來源支持的表述都要點名並給出修改建議。' }
};

/* ══════════ 匯出 ══════════ */

function buildMarkdown() {
  const m = state.meta;
  const o = state.outputs;
  const head = [
    '# 【直播精華】' + (m.title.trim() || '未命名直播'),
    '',
    '> 嘉賓：' + (m.guest.trim() || '—') + '｜來源：' + (m.source.trim() || '—'),
    '> 本文由「直播精華二傳工具」自動生成初稿，發布前請人工核實；內容不構成投資建議。',
    ''
  ];
  const body = [];
  if (o.titles) body.push('## 一、標題備選\n\n' + o.titles);
  if (o.quotes) body.push('## 二、嘉賓金句\n\n' + o.quotes);
  if (o.article) body.push('## 三、直播精華\n\n' + o.article);
  if (o.review) body.push('## 四、內容審核\n\n' + o.review);
  return head.join('\n') + '\n' + body.join('\n\n');
}

function exportMarkdown() {
  const md = buildMarkdown();
  const name = ('直播精華_' + (state.meta.title.trim() || '未命名')).replace(/[\\/:*?"<>|]/g, '_') + '.md';
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已匯出 ' + name, 'ok');
}

/* ══════════ 複製 ══════════ */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('已複製到剪貼簿', 'ok');
}

/* ══════════ 設定 ══════════ */

function openSettings() {
  dom.provider.value = state.config.provider || 'custom';
  dom.baseUrl.value = state.config.baseUrl;
  dom.apiKey.value = state.config.apiKey;
  dom.model.value = state.config.model;
  dom.temperature.value = state.config.temperature;
  dom.tempVal.textContent = state.config.temperature;
  dom.testResult.textContent = '';
  dom.modal.showModal();
}

function applyProvider() {
  const p = PROVIDERS[dom.provider.value] || PROVIDERS.custom;
  dom.baseUrl.value = p.baseUrl;
  dom.model.value = p.model;
}

function saveSettings() {
  state.config = {
    provider: dom.provider.value,
    baseUrl: dom.baseUrl.value.trim(),
    apiKey: dom.apiKey.value.trim(),
    model: dom.model.value.trim(),
    temperature: Number(dom.temperature.value)
  };
  saveState();
  dom.modal.close();
  toast('設定已保存', 'ok');
}

async function testConnection() {
  const cfg = {
    baseUrl: dom.baseUrl.value.trim(),
    apiKey: dom.apiKey.value.trim(),
    model: dom.model.value.trim(),
    temperature: 0
  };
  if (!cfg.baseUrl || !cfg.apiKey) { dom.testResult.textContent = '✗ 請填 Base URL 與 API Key'; return; }
  dom.testResult.textContent = '測試中…';
  const old = state.config;
  state.config = cfg;
  try {
    const gen = streamChatCompletions(
      [{ role: 'user', content: '只回覆兩個字：成功' }],
      { signal: new AbortController().signal, temperature: 0, maxTokens: 16 }
    );
    let out = '';
    for await (const d of gen) out += d;
    dom.testResult.textContent = out ? '✓ 連線正常' : '✓ 連線正常（無回覆內容）';
  } catch (e) {
    dom.testResult.textContent = '✗ ' + e.message;
  } finally {
    state.config = old;
  }
}

/* ══════════ 初始化 ══════════ */

function bindEvents() {
  [dom.metaTitle, dom.metaGuest, dom.metaSource].forEach((el) =>
    el.addEventListener('input', () => {
      state.meta.title = dom.metaTitle.value;
      state.meta.guest = dom.metaGuest.value;
      state.meta.source = dom.metaSource.value;
      saveState();
    })
  );

  dom.styleSelect.addEventListener('change', () => { state.style = dom.styleSelect.value; saveState(); });

  dom.transcript.addEventListener('input', () => {
    state.transcript = dom.transcript.value;
    dom.charCount.textContent = dom.transcript.value.length.toLocaleString() + ' 字'
      + (dom.transcript.value.length > MAX_TRANSCRIPT ? ' ⚠ 超出建議上限，生成時將截斷' : '');
    saveState();
  });

  dom.btnSample.addEventListener('click', () => {
    dom.metaTitle.value = '交易方法與條件單（示例）';
    dom.metaGuest.value = '示例嘉賓';
    state.meta = { title: dom.metaTitle.value, guest: dom.metaGuest.value, source: '' };
    state.transcript = SAMPLE_TRANSCRIPT;
    dom.transcript.value = state.transcript;
    dom.transcript.dispatchEvent(new Event('input'));
    toast('已載入示例字幕', 'ok');
  });

  dom.btnClearInput.addEventListener('click', () => {
    dom.metaTitle.value = dom.metaGuest.value = dom.metaSource.value = '';
    dom.transcript.value = '';
    state.meta = { title: '', guest: '', source: '' };
    state.transcript = '';
    dom.transcript.dispatchEvent(new Event('input'));
    saveState();
  });

  dom.btnGenerate.addEventListener('click', runAll);
  dom.btnStop.addEventListener('click', () => {
    if (state.running) state.running.abort();
  });

  dom.stageTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.stage-tab');
    if (btn) switchTab(btn.dataset.key);
  });

  dom.btnRerun.addEventListener('click', () => runStage(state.activeStage));
  dom.btnCopy.addEventListener('click', () => {
    const v = dom.outputArea.value;
    if (!v.trim()) { toast('當前步驟尚無內容', 'err'); return; }
    copyText(v);
  });

  dom.btnChatSend.addEventListener('click', () => sendChat(dom.chatInput.value));
  dom.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendChat(dom.chatInput.value);
  });

  dom.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const action = CHIP_ACTIONS[chip.dataset.action];
    if (!action) return;
    runStage(action.stage, action.instruction);
  });

  dom.btnExport.addEventListener('click', exportMarkdown);
  dom.btnClearAll.addEventListener('click', () => {
    if (!confirm('確定清空所有輸入、生成結果與對答紀錄？')) return;
    localStorage.removeItem('fldw.draft');
    localStorage.removeItem('fldw.config');
    location.reload();
  });

  dom.btnSettings.addEventListener('click', openSettings);
  dom.provider.addEventListener('change', applyProvider);
  dom.temperature.addEventListener('input', () => { dom.tempVal.textContent = dom.temperature.value; });
  dom.btnSaveSettings.addEventListener('click', saveSettings);
  dom.btnTest.addEventListener('click', testConnection);
}

function init() {
  loadState();
  dom.metaTitle.value = state.meta.title;
  dom.metaGuest.value = state.meta.guest;
  dom.metaSource.value = state.meta.source;
  dom.styleSelect.value = state.style;
  dom.transcript.value = state.transcript;
  dom.charCount.textContent = state.transcript.length.toLocaleString() + ' 字';
  switchTab('titles');
  if (state.outputs.titles) setStageDot('titles', 'done');
  if (state.outputs.quotes) setStageDot('quotes', 'done');
  if (state.outputs.article) setStageDot('article', 'done');
  if (state.outputs.review) setStageDot('review', 'done');

  if (location.protocol === 'file:') {
    toast('偵測到以 file:// 開啟：請改為執行 node server.js 後訪問 http://localhost:8787', 'err');
    log('以 file:// 開啟會無法載入提示詞，請用 node server.js 啟動', 'err');
  }
  bindEvents();
}

init();
