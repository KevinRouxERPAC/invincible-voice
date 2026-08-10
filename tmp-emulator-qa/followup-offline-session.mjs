import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.QA_OUT || join(process.cwd(), 'tmp-emulator-qa');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
await send('Page.enable');

// Ensure idle then open settings
await evaluate(`([...document.querySelectorAll('button')].find(b=>/Fin|Stop|End/i.test(b.textContent||''))||{}).click?.()`);
await sleep(1000);
await evaluate(`(() => {
  const labeled = [...document.querySelectorAll('button')].find((b) =>
    /param|settings|réglage/i.test((b.getAttribute('aria-label') || '') + ' ' + b.textContent),
  );
  if (labeled) { labeled.click(); return 'labeled'; }
  const gear = [...document.querySelectorAll('button')].find((b) => {
    const r = b.getBoundingClientRect();
    return !b.textContent.trim() && r.top < 160 && r.left > 250;
  });
  gear?.click();
  return gear ? 'gear' : 'missing';
})()`);
await sleep(1200);

const offlineInfo = await evaluate(`(() => {
  const all = document.body.innerText;
  const has = /Mode hors ligne/i.test(all);
  // Scroll dialog to offline section
  const dlg = document.querySelector('[role="dialog"]') || document.body;
  const el = [...dlg.querySelectorAll('*')].find((n) => /Mode hors ligne/i.test(n.textContent || '') && (n.textContent||'').length < 80);
  if (el) el.scrollIntoView({ block: 'center' });
  const toggle = [...dlg.querySelectorAll('button,[role=switch],input')].find((n) => {
    const p = n.closest('div,label,section')?.innerText || '';
    return /Mode hors ligne/i.test(p);
  });
  return {
    has,
    toggleTag: toggle ? toggle.tagName : null,
    toggleAria: toggle ? (toggle.getAttribute('aria-checked') || toggle.getAttribute('aria-pressed') || toggle.getAttribute('role') || '') : null,
    nearby: el ? (el.textContent || '').slice(0, 200) : null,
  };
})()`);
await sleep(500);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, '10_settings_offline.png'), Buffer.from(shot.data, 'base64'));
writeFileSync(join(OUT, '10_offline_info.json'), JSON.stringify(offlineInfo, null, 2));
console.log(JSON.stringify(offlineInfo, null, 2));

// Session: tap a suggested response
await evaluate(`(() => {
  const dlg = document.querySelector('[role="dialog"]');
  if (dlg) {
    const btns = [...dlg.querySelectorAll('button')];
    const icon = btns.find((b) => !b.textContent.trim() || b.textContent.trim().length <= 1);
    (icon || btns[0])?.click();
  }
})()`);
await sleep(800);
await evaluate(`([...document.querySelectorAll('button')].find(e=>/Démarrer la conversation|Start conversation/i.test(e.textContent||''))||{}).click?.()`);
await sleep(4500);
const pick = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('button')].filter((b) => {
    const t = (b.textContent || '').trim();
    return t.length > 8 && t.length < 120 && /Bonjour|Salut|ça va|suis là/i.test(t);
  });
  if (!cards.length) return { ok: false };
  cards[0].click();
  return { ok: true, text: cards[0].textContent.trim().slice(0, 80) };
})()`);
await sleep(4000);
const afterPick = await evaluate(`document.body.innerText.slice(0, 2000)`);
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, '11_after_response_pick.png'), Buffer.from(shot2.data, 'base64'));
writeFileSync(join(OUT, '11_after_response_pick.txt'), afterPick || '', 'utf8');
console.log('PICK', JSON.stringify(pick));
console.log((afterPick || '').split('\n').filter(Boolean).slice(0, 15).join(' | '));

// End
await evaluate(`([...document.querySelectorAll('button')].find(b=>/Fin|Stop|End/i.test(b.textContent||''))||{}).click?.()`);
ws.close();
