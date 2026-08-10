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
  const token = localStorage.getItem('bearerToken');
  const localRaw = localStorage.getItem('invincible-voice-local-userdata');
  let local = null;
  try { local = JSON.parse(localRaw); } catch (_) {}

  let server = null;
  let serverErr = null;
  try {
    const r = await fetch(base + '/v1/user/', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const text = await r.text();
    try { server = JSON.parse(text); } catch (_) { server = { raw: text.slice(0, 2000), status: r.status }; }
    if (!r.ok) serverErr = { status: r.status, body: text.slice(0, 500) };
  } catch (e) {
    serverErr = String(e);
  }

  const summarize = (u) => {
    if (!u) return null;
    const m = u.memory || {};
    const facts = m.facts || [];
    const exchanges = m.style_exchanges || [];
    const tone = m.tone_profile || {};
    const convs = u.conversations || [];
    return {
      email: u.email,
      name: u.user_settings?.name,
      learn_style: u.user_settings?.learn_style,
      facts_count: facts.length,
      facts_sample: facts.slice(0, 5).map(f => f.text || f),
      style_exchanges_count: exchanges.length,
      style_exchanges_sample: exchanges.slice(0, 3),
      tone_summary: tone.summary || null,
      tone_updated_at: tone.updated_at || null,
      conversations_count: Array.isArray(convs) ? convs.length : null,
      processed_conversations: (m.processed_conversations || []).length,
      conversations_since_tone_refresh: m.conversations_since_tone_refresh ?? null,
    };
  };

  return {
    local: summarize(local),
    server: summarize(server),
    serverErr,
  };
})()`);

writeFileSync(join(OUT, 'learn_style_status.json'), JSON.stringify(info, null, 2), 'utf8');
console.log(JSON.stringify(info, null, 2));
ws.close();
