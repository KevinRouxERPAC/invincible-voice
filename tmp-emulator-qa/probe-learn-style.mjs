import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.QA_OUT || '.';
const BACKEND = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'https://invincible-backend-789604937344.europe-west1.run.app'
).replace(/\/$/, '');

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

const info = await evaluate(`(async () => {
  const base = ${JSON.stringify(BACKEND)};
  const keys = Object.keys(localStorage || {});
  const relevant = keys.filter(k => /user|memory|setting|invincible|auth|token|data/i.test(k));
  const snap = {};
  for (const k of relevant) {
    const v = localStorage.getItem(k);
    snap[k] = v && v.length > 4000 ? v.slice(0, 4000) + '…' : v;
  }

  const endpoints = [];
  for (const path of ['/v1/user', '/v1/user/', '/v1/health']) {
    try {
      const r = await fetch(base + path, { credentials: 'include' });
      const text = await r.text();
      endpoints.push({ path, status: r.status, body: text.slice(0, 12000) });
    } catch (e) {
      endpoints.push({ path, error: String(e) });
    }
  }

  // Parse any user blob found in localStorage
  let parsed = null;
  for (const [k, v] of Object.entries(snap)) {
    try {
      const j = JSON.parse(v);
      if (j && (j.user_settings || j.memory || j.learn_style !== undefined)) {
        parsed = {
          key: k,
          learn_style: j.user_settings?.learn_style ?? j.learn_style,
          name: j.user_settings?.name ?? j.name,
          facts: j.memory?.facts?.length ?? null,
          style_exchanges: j.memory?.style_exchanges?.length ?? null,
          tone_summary: j.memory?.tone_profile?.summary ?? null,
          conversations: Array.isArray(j.conversations) ? j.conversations.length : (j.memory?.processed_conversations?.length ?? null),
        };
      }
    } catch (_) {}
  }

  return { relevantKeys: relevant, parsed, endpoints, snapPreview: Object.fromEntries(Object.entries(snap).map(([k,v]) => [k, typeof v === 'string' ? v.slice(0, 500) : v])) };
})()`);

writeFileSync(join(OUT, 'learn_style_probe.json'), JSON.stringify(info, null, 2), 'utf8');
console.log(JSON.stringify(info, null, 2).slice(0, 8000));
ws.close();
