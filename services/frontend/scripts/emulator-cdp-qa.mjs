/**
 * Minimal CDP driver for Android WebView QA via adb forward tcp:9222.
 * Usage: node scripts/emulator-cdp-qa.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const OUT = process.env.QA_OUT || join(process.cwd(), '..', '..', 'tmp-emulator-qa');

mkdirSync(OUT, { recursive: true });

async function getPageWs() {
  const pages = await fetch(`${CDP_HTTP}/json`).then((r) => r.json());
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
  if (!page) throw new Error('No CDP page found');
  return page.webSocketDebuggerUrl;
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.ws = null;
  }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails));
    }
    return result.result?.value;
  }
  close() {
    this.ws?.close();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  const wsUrl = await getPageWs();
  const cdp = new Cdp(wsUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  // Snapshot visible text
  const bodyText = await cdp.evaluate(
    `document.body ? document.body.innerText.slice(0, 2500) : ''`,
  );
  writeFileSync(join(OUT, 'cdp_body_settings.txt'), bodyText || '', 'utf8');
  record(
    'Settings modal open',
    /Changer les param|Change settings|Sauvegarder|Save/i.test(bodyText || ''),
    (bodyText || '').split('\n').slice(0, 6).join(' | '),
  );

  // Offline toggle present on native
  record(
    'OfflineFallback / SOS available on home',
    /URGENCE|Emergency|Phrases rapides|Démarrer/i.test(bodyText || ''),
    (bodyText || '').split('\n').filter(Boolean).slice(0, 4).join(' | '),
  );

  // Close settings via Escape / click X by evaluating
  await cdp.evaluate(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const close = btns.find(b => /fermer|close|annuler|cancel/i.test(b.getAttribute('aria-label')||'') || b.textContent.trim() === '×' || b.textContent.trim() === 'X');
      if (close) { close.click(); return 'clicked-close'; }
      // backdrop
      const backdrop = document.querySelector('[aria-modal="true"]')?.parentElement?.querySelector('button, [role="button"]');
      const x = [...document.querySelectorAll('button')].find(b => b.closest('[role="dialog"]') && (b.getAttribute('aria-label')||'').match(/close|fermer|annuler/i));
      if (x) { x.click(); return 'clicked-x'; }
      // force cancel via known pattern
      const cancel = [...document.querySelectorAll('button')].find(b => /annuler/i.test(b.textContent));
      if (cancel) { cancel.click(); return 'cancel'; }
      return 'no-close';
    })()
  `);
  await sleep(800);

  let home = await cdp.evaluate(`document.body.innerText.slice(0, 2000)`);
  // If still in settings, try clicking the X in header more aggressively
  if (/Sauvegarder|Changer les param/i.test(home)) {
    await cdp.evaluate(`
      (() => {
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg) return 'no-dialog';
        const buttons = [...dlg.querySelectorAll('button')];
        // First button in header is often close
        const headerBtn = dlg.querySelector('header button, [class*="Header"] button, button');
        // Prefer buttons without text (icon-only close)
        const icon = buttons.find(b => !b.textContent.trim() || b.textContent.trim().length <= 2);
        (icon || headerBtn)?.click();
        return 'forced';
      })()
    `);
    await sleep(800);
    home = await cdp.evaluate(`document.body.innerText.slice(0, 2000)`);
  }
  writeFileSync(join(OUT, 'cdp_body_home.txt'), home || '', 'utf8');
  record(
    'Return to idle home',
    /Démarrer la conversation|Start conversation|Phrases rapides|URGENCE|Emergency/i.test(home || ''),
    (home || '').split('\n').filter(Boolean).slice(0, 8).join(' | '),
  );

  // Open phrases editor
  const phrasesNav = await cdp.evaluate(`
    (() => {
      const el = [...document.querySelectorAll('button, a')].find(e => /Éditer les phrases|Edit quick phrases|\\+ Éditer|\\+ Edit/i.test(e.textContent||''));
      if (!el) return 'missing';
      el.click();
      return el.textContent.trim().slice(0, 40);
    })()
  `);
  await sleep(1000);
  const phrases = await cdp.evaluate(`document.body.innerText.slice(0, 2000)`);
  writeFileSync(join(OUT, 'cdp_body_phrases.txt'), phrases || '', 'utf8');
  record(
    'Open quick phrases editor',
    /Phrases rapides|Quick phrases|Ajouter|Add phrase/i.test(phrases || '') && phrasesNav !== 'missing',
    `click=${phrasesNav}`,
  );

  // Back from phrases
  await cdp.evaluate(`
    (() => {
      const back = [...document.querySelectorAll('button')].find(b => /Retour|Back/i.test(b.textContent||'') || /retour|back/i.test(b.getAttribute('aria-label')||''));
      back?.click();
      return back ? 'back' : 'no-back';
    })()
  `);
  await sleep(800);

  // Re-open phrases via long label to verify nav sync fix
  const reopen = await cdp.evaluate(`
    (() => {
      // close settings if any
      const close = [...document.querySelectorAll('button')].find(b => /fermer|close|annuler/i.test((b.getAttribute('aria-label')||'')+b.textContent));
      // open editor again from idle
      const homeEdit = [...document.querySelectorAll('button')].find(e => /Éditer les phrases|Edit quick phrases/i.test(e.textContent||''));
      if (homeEdit) { homeEdit.click(); return 'home-edit'; }
      const plus = [...document.querySelectorAll('button')].find(e => /\\+ Éditer|\\+ Edit/i.test(e.textContent||''));
      if (plus) { plus.click(); return 'plus-edit'; }
      return 'fail';
    })()
  `);
  await sleep(1000);
  const phrases2 = await cdp.evaluate(`document.body.innerText.slice(0, 1500)`);
  record(
    'Re-open phrases editor after Back (nav sync)',
    /Phrases rapides|Quick phrases|Ajouter/i.test(phrases2 || '') && reopen !== 'fail',
    `nav=${reopen}`,
  );

  // Close and open history
  await cdp.evaluate(`
    (() => {
      const x = [...document.querySelectorAll('button')].find(b => /fermer|close|annuler|retour|back/i.test(((b.getAttribute('aria-label')||'')+' '+b.textContent).toLowerCase()));
      x?.click();
    })()
  `);
  await sleep(600);
  // Ensure idle
  await cdp.evaluate(`
    (() => {
      const still = /Sauvegarder|Changer les param|Phrases rapides/.test(document.body.innerText) && document.querySelector('[role="dialog"]');
      if (still) {
        const btns = [...document.querySelectorAll('[role="dialog"] button')];
        const icon = btns.find(b => !b.textContent.trim() || b.textContent.trim().length <= 1);
        icon?.click();
      }
    })()
  `);
  await sleep(500);

  const histClick = await cdp.evaluate(`
    (() => {
      const el = [...document.querySelectorAll('button, a')].find(e => /historique|history/i.test(e.textContent||''));
      if (!el) return 'missing';
      el.click();
      return el.textContent.trim();
    })()
  `);
  await sleep(1000);
  const hist = await cdp.evaluate(`document.body.innerText.slice(0, 2000)`);
  writeFileSync(join(OUT, 'cdp_body_history.txt'), hist || '', 'utf8');
  record(
    'Open conversation history',
    histClick !== 'missing' && !/Démarrer la conversation/i.test(hist || ''),
    `click=${histClick} | ${(hist || '').split('\\n').filter(Boolean).slice(0, 5).join(' | ')}`,
  );

  // Back home then start conversation
  await cdp.evaluate(`
    (() => {
      const back = [...document.querySelectorAll('button')].find(b => /retour|back|accueil|home|nouvelle/i.test((b.textContent||'').toLowerCase()));
      back?.click();
    })()
  `);
  await sleep(800);

  const start = await cdp.evaluate(`
    (() => {
      const el = [...document.querySelectorAll('button')].find(e => /Démarrer la conversation|Start conversation|Start chatting/i.test(e.textContent||''));
      if (!el) return 'missing';
      el.click();
      return 'started';
    })()
  `);
  await sleep(4000);
  const session = await cdp.evaluate(`document.body.innerText.slice(0, 2500)`);
  writeFileSync(join(OUT, 'cdp_body_session.txt'), session || '', 'utf8');
  record(
    'Start conversation (cloud session)',
    start === 'started' && !/Démarrer la conversation/i.test(session || ''),
    (session || '').split('\n').filter(Boolean).slice(0, 10).join(' | '),
  );

  // Health / network from page
  const health = await cdp.evaluate(`
    (async () => {
      try {
        const urls = [
          (window.__NEXT_DATA__ && 'next'),
        ];
        // Probe backend via same helper if exposed; else fetch env-baked path from meta
        const candidates = [];
        for (const s of document.querySelectorAll('script')) {
          const t = s.textContent || '';
          const m = t.match(/https:\\/\\/[a-z0-9.-]+\\.run\\.app/i);
          if (m) candidates.push(m[0]);
        }
        const base = candidates[0];
        if (!base) return { ok: false, error: 'no-backend-url-in-page' };
        const r = await fetch(base + '/v1/health', { credentials: 'include' }).catch(e => ({ ok: false, status: 0, err: String(e) }));
        if (r && r.ok) {
          const j = await r.json();
          return { ok: true, base, health: j };
        }
        return { ok: false, base, status: r && r.status, err: r && r.err };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    })()
  `);
  writeFileSync(join(OUT, 'cdp_health.json'), JSON.stringify(health, null, 2), 'utf8');
  record('Backend health from WebView', Boolean(health?.ok), JSON.stringify(health).slice(0, 300));

  // Emergency button present on idle — go home first if needed
  await cdp.evaluate(`
    (() => {
      const stop = [...document.querySelectorAll('button')].find(b => /Fin|Stop|End|Quitter/i.test(b.textContent||''));
      stop?.click();
    })()
  `);
  await sleep(1500);
  const urg = await cdp.evaluate(`
    (() => {
      const el = [...document.querySelectorAll('button')].find(e => /URGENCE|Emergency|SOS|aide/i.test(e.textContent||''));
      return el ? el.textContent.trim().slice(0, 40) : 'missing';
    })()
  `);
  record('Emergency button present', urg !== 'missing', urg);

  // Capacitor plugins presence
  const plugins = await cdp.evaluate(`
    (() => {
      const c = window.Capacitor;
      if (!c) return { capacitor: false };
      const names = Object.keys(c.Plugins || {});
      return {
        capacitor: true,
        isNative: c.isNativePlatform?.() ?? null,
        platform: c.getPlatform?.() ?? null,
        plugins: names,
        hasSpeech: names.includes('SpeechRecognition') || Boolean(c.Plugins?.SpeechRecognition),
        hasTts: names.includes('TextToSpeech') || Boolean(c.Plugins?.TextToSpeech),
        hasHaptics: names.includes('Haptics') || Boolean(c.Plugins?.Haptics),
        hasSocial: names.includes('SocialLogin') || Boolean(c.Plugins?.SocialLogin),
      };
    })()
  `);
  writeFileSync(join(OUT, 'cdp_plugins.json'), JSON.stringify(plugins, null, 2), 'utf8');
  record('Capacitor native platform', Boolean(plugins?.isNative && plugins?.platform === 'android'), JSON.stringify(plugins));
  record('Plugin SpeechRecognition', Boolean(plugins?.hasSpeech));
  record('Plugin TextToSpeech', Boolean(plugins?.hasTts));
  record('Plugin Haptics', Boolean(plugins?.hasHaptics));
  record('Plugin SocialLogin', Boolean(plugins?.hasSocial));

  writeFileSync(join(OUT, 'cdp_results.json'), JSON.stringify(results, null, 2), 'utf8');
  const failed = results.filter((r) => !r.ok);
  console.log('\\n=== SUMMARY ===');
  console.log(`passed=${results.length - failed.length} failed=${failed.length} total=${results.length}`);
  if (failed.length) {
    for (const f of failed) console.log('FAIL:', f.name, f.detail);
    process.exitCode = 1;
  }
  cdp.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
