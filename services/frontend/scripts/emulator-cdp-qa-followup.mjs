/**
 * Follow-up CDP checks: settings, offline toggle, health, quick phrase.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CDP_HTTP = 'http://127.0.0.1:9222';
const OUT = process.env.QA_OUT || join(process.cwd(), '..', '..', 'tmp-emulator-qa');
const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'https://invincible-backend-s2y5qx44wa-ew.a.run.app';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const pages = await fetch(`${CDP_HTTP}/json`).then((r) => r.json());
  const page = pages.find((p) => p.type === 'page');
  if (!page) throw new Error('no page');
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

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};

const { ws, send, evaluate } = await connect();

await evaluate(`([...document.querySelectorAll('button')].find(b=>/Fin|Stop|End/i.test(b.textContent||''))||{}).click?.()`);
await sleep(1500);

const openSettings = await evaluate(`(() => {
  const labeled = [...document.querySelectorAll('button')].find((b) =>
    /param|settings|réglage/i.test(
      (b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent,
    ),
  );
  if (labeled) {
    labeled.click();
    return labeled.getAttribute('aria-label') || labeled.textContent.trim() || 'labeled';
  }
  const gear = [...document.querySelectorAll('button')].find((b) => {
    const r = b.getBoundingClientRect();
    return !b.textContent.trim() && r.top < 140 && r.left > 280;
  });
  if (gear) {
    gear.click();
    return 'gear-pos';
  }
  return 'missing';
})()`);
record('Open settings', openSettings !== 'missing', openSettings);
await sleep(1200);

let settingsText = await evaluate('document.body.innerText');
writeFileSync(join(OUT, 'cdp_settings_full.txt'), settingsText || '', 'utf8');
record(
  'Settings modal content',
  /Changer les param|Sauvegarder|Se déconnecter/i.test(settingsText || ''),
  (settingsText || '').split('\n').filter(Boolean).slice(0, 8).join(' | '),
);

settingsText = await evaluate('document.body.innerText');
record(
  'Settings has no offline LLM toggle',
  !/Mode hors ligne/i.test(settingsText || ''),
  /Mode hors ligne/.test(settingsText || '') ? 'still present' : 'absent (ok)',
);
record(
  'Edit phrases entry in settings',
  /\+ Éditer|Éditer les phrases|Edit quick/i.test(settingsText || ''),
);

const health = await evaluate(`(async () => {
  const base = ${JSON.stringify(BACKEND.replace(/\/$/, ''))};
  try {
    const r = await fetch(base + '/v1/health');
    const j = await r.json();
    return { ok: r.ok, status: r.status, base, health: j };
  } catch (e) {
    return { ok: false, base, error: String(e) };
  }
})()`);
writeFileSync(join(OUT, 'cdp_health2.json'), JSON.stringify(health, null, 2), 'utf8');
record('Backend /v1/health from WebView', Boolean(health?.ok), JSON.stringify(health).slice(0, 350));

// Close settings
await evaluate(`(() => {
  const dlg = document.querySelector('[role="dialog"]');
  if (!dlg) return;
  const btns = [...dlg.querySelectorAll('button')];
  const icon = btns.find((b) => !b.textContent.trim() || b.textContent.trim().length <= 1);
  (icon || btns[0])?.click();
})()`);
await sleep(800);

const phrase = await evaluate(`(() => {
  const el = [...document.querySelectorAll('button')].find((b) => /J'ai soif/i.test(b.textContent || ''));
  if (!el) return 'missing';
  el.click();
  return el.textContent.trim();
})()`);
record('Quick phrase tap', phrase !== 'missing', phrase);
await sleep(3500);

const after = await evaluate('document.body.innerText.slice(0, 1200)');
writeFileSync(join(OUT, 'cdp_after_phrase.txt'), after || '', 'utf8');

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, '05_after_checks.png'), Buffer.from(shot.data, 'base64'));

writeFileSync(join(OUT, 'cdp_results2.json'), JSON.stringify(results, null, 2), 'utf8');
const failed = results.filter((r) => !r.ok);
console.log(`\nSUMMARY passed=${results.length - failed.length} failed=${failed.length}`);
ws.close();
process.exitCode = failed.length ? 1 : 0;
