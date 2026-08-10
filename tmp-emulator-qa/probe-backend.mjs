import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.QA_OUT || '.';
const pages = await fetch('http://127.0.0.1:9222/json').then((r) => r.json());
const page = pages.find((p) => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
await send('Runtime.enable');
const urls = await evaluate(`(() => {
  const blob = [...document.querySelectorAll('script')].map(s => s.textContent || '').join('\\n');
  const found = blob.match(/https:\\/\\/[a-z0-9.-]+\\.run\\.app/gi) || [];
  return [...new Set(found)];
})()`);
const probe = await evaluate(`(async () => {
  const candidates = ${JSON.stringify([
    'https://invincible-backend-789604937344.europe-west1.run.app',
    'https://invincible-backend-s2y5qx44wa-ew.a.run.app',
  ])};
  const out = [];
  for (const base of candidates) {
    try {
      const r = await fetch(base + '/v1/health');
      const j = await r.json().catch(() => null);
      out.push({ base, ok: r.ok, status: r.status, health: j });
    } catch (e) {
      out.push({ base, ok: false, error: String(e) });
    }
  }
  return out;
})()`);
writeFileSync(join(OUT, 'backend_probe.json'), JSON.stringify({ urls, probe }, null, 2));
console.log(JSON.stringify({ urls, probe }, null, 2));
ws.close();
