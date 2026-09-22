#!/usr/bin/env node
/* Futu Live Digest Writer — 本地零依賴伺服器
   用法：node server.js [--port 8787] [--no-open]
   功能：
     1. 靜態伺服 web/ 頁面與 prompts/、examples/ 目錄
     2. /api/chat：OpenAI 兼容 Chat Completions 流式代理
        （瀏覽器直連多數模型供應商會被 CORS 攔截，經本地代理繞開；
          API 密鑰只存在瀏覽器 localStorage，請求直接轉發至用戶配置的供應商，不經任何第三方）
*/
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const args = process.argv.slice(2);
const portArgIndex = args.indexOf('--port');
const PORT = portArgIndex >= 0 && args[portArgIndex + 1]
  ? Number(args[portArgIndex + 1])
  : Number(process.env.PORT || 8787);
const OPEN = !args.includes('--no-open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function safePath(p) {
  const full = path.normalize(path.join(ROOT, p));
  return full.startsWith(ROOT) ? full : null;
}

function send(res, code, body) {
  const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': buf.length
  });
  res.end(buf);
}

function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('請求內容過大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function proxyChat(req, res) {
  readBody(req)
    .then((raw) => {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        return send(res, 400, { error: 'JSON 解析失敗' });
      }
      const { baseUrl, apiKey, model, messages, temperature, max_tokens } = payload;
      if (!baseUrl || !apiKey) return send(res, 400, { error: '缺少 baseUrl 或 apiKey，請先在右上角「設定」填好' });

      let target;
      try {
        target = new URL(baseUrl.replace(/\/+$/, '') + '/chat/completions');
      } catch (e) {
        return send(res, 400, { error: 'baseUrl 無效' });
      }
      if (target.protocol !== 'https:' && target.protocol !== 'http:') {
        return send(res, 400, { error: 'baseUrl 必須是 http(s) 地址' });
      }

      const lib = target.protocol === 'https:' ? https : http;
      const body = JSON.stringify({
        model,
        messages: Array.isArray(messages) ? messages : [],
        temperature,
        max_tokens: max_tokens || 2048,
        stream: true
      });

      const upstream = lib.request(
        target,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey,
            'Content-Length': Buffer.byteLength(body)
          },
          timeout: 600000
        },
        (upRes) => {
          res.writeHead(upRes.statusCode || 502, {
            'Content-Type': upRes.headers['content-type'] || 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache'
          });
          if ((upRes.statusCode || 500) >= 400) {
            let err = '';
            upRes.on('data', (c) => (err += c));
            upRes.on('end', () => res.end(err || JSON.stringify({ error: '上游返回錯誤' })));
            return;
          }
          upRes.pipe(res);
        }
      );
      upstream.on('timeout', () => upstream.destroy(new Error('上游請求逾時')));
      upstream.on('error', (e) => {
        if (res.headersSent) {
          res.end();
        } else {
          send(res, 502, { error: '無法連線至模型供應商：' + (e.code || e.message) });
        }
      });
      req.on('aborted', () => upstream.destroy());
      upstream.end(body);
    })
    .catch((e) => send(res, 400, { error: e.message }));
}

function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/') p = '/web/index.html';
  const file = safePath(p);
  if (!file) return send(res, 403, { error: '禁止的路徑' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: '檔案不存在：' + p });
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  if (p.startsWith('/api/')) {
    if (p === '/api/chat' && req.method === 'POST') return proxyChat(req, res);
    if (p === '/api/health') return send(res, 200, { ok: true });
    return send(res, 404, { error: 'API 不存在' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { error: '只支援 GET' });
  }
  serveStatic(req, res, p);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`✗ 連接埠 ${PORT} 已被佔用。請改用：node server.js --port ${PORT + 1}`);
  } else {
    console.error('✗ 伺服器啟動失敗：' + e.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const url = 'http://localhost:' + PORT;
  console.log('──────────────────────────────────────────');
  console.log('  Futu Live Digest Writer（網頁版）已啟動');
  console.log('  請在瀏覽器打開：' + url);
  console.log('  按 Ctrl+C 停止伺服器');
  console.log('──────────────────────────────────────────');
  if (OPEN) {
    const cmd = process.platform === 'win32'
      ? 'start "" "' + url + '"'
      : process.platform === 'darwin'
        ? 'open "' + url + '"'
        : 'xdg-open "' + url + '"';
    exec(cmd, { windowsHide: true }, () => {});
  }
});
