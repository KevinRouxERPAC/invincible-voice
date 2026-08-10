import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const OUT = process.env.QA_OUT || join(process.cwd(), 'tmp-emulator-qa');
mkdirSync(OUT, { recursive: true });

async function connect() {
  const pages = await fetch(`${CDP_HTTP}/json`).then((r) => r.json());
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
  if (!page) throw new Error('No CDP page');
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
  await send('Page.enable');
  return { ws, send, evaluate };
}

const { ws, send, evaluate } = await connect();
const text = await evaluate(`document.body ? document.body.innerText : ''`);
const buttons = await evaluate(`([...document.querySelectorAll('button,[role=button],a')].map(b => ({
  t: (b.textContent||'').trim().slice(0,80),
  aria: b.getAttribute('aria-label')||'',
  disabled: !!b.disabled
})).filter(x => x.t || x.aria).slice(0,100))`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, '00_start.png'), Buffer.from(shot.data, 'base64'));
writeFileSync(join(OUT, '00_body.txt'), text || '', 'utf8');
writeFileSync(join(OUT, '00_buttons.json'), JSON.stringify(buttons, null, 2), 'utf8');
console.log('--- BODY ---');
console.log((text || '').slice(0, 2500));
console.log('--- BUTTONS ---');
console.log(JSON.stringify(buttons, null, 2));
ws.close();
