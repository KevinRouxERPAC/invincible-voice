/**
 * Full Android emulator QA via CDP (adb forward tcp:9222).
 * Starts from idle home; covers checklist §3 / §4 / §6 + regressions post-offline removal.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CDP_HTTP = process.env.CDP_HTTP || 'http://127.0.0.1:9222';
const OUT = process.env.QA_OUT || join(process.cwd(), 'tmp-emulator-qa');
const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'https://invincible-backend-789604937344.europe-west1.run.app';

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const pages = await fetch(`${CDP_HTTP}/json`).then((r) => r.json());
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
  if (!page) throw new Error('No CDP page found');
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
function record(name, ok, detail = '') {
  results.push({ name, ok, detail: String(detail).slice(0, 500) });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + String(detail).slice(0, 180) : ''}`);
}

async function shot(send, name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(s.data, 'base64'));
}

async function body(evaluate, n = 3000) {
  return evaluate(`document.body ? document.body.innerText.slice(0, ${n}) : ''`);
}

async function clickByText(evaluate, reSource, opts = {}) {
  return evaluate(`(() => {
    const re = ${reSource};
    const els = [...document.querySelectorAll('button,a,[role=button]')];
    const el = els.find((e) => {
      const hay = ((e.getAttribute('aria-label')||'') + ' ' + (e.title||'') + ' ' + (e.textContent||'')).trim();
      return re.test(hay);
    });
    if (!el) return { ok: false, reason: 'missing' };
    if (${opts.disabledOk ? 'false' : 'true'} && el.disabled) return { ok: false, reason: 'disabled', text: (el.textContent||'').trim().slice(0,40) };
    el.click();
    return { ok: true, text: ((el.getAttribute('aria-label')||'') + '|' + (el.textContent||'').trim()).slice(0,60) };
  })()`);
}

async function ensureIdle(evaluate) {
  for (let i = 0; i < 4; i++) {
    const t = await body(evaluate, 1500);
    if (/Démarrer la conversation|Start conversation/i.test(t) && !/Sauvegarder|Changer les param/i.test(t)) {
      return true;
    }
    await evaluate(`(() => {
      const stop = [...document.querySelectorAll('button')].find(b => /Fin|Stop|End|Quitter/i.test(b.textContent||''));
      if (stop) { stop.click(); return 'stop'; }
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) {
        const btns = [...dlg.querySelectorAll('button')];
        const icon = btns.find(b => !b.textContent.trim() || b.textContent.trim().length <= 2);
        const cancel = btns.find(b => /annuler|fermer|close|retour|back/i.test((b.textContent||'')+(b.getAttribute('aria-label')||'')));
        (cancel || icon || btns[0])?.click();
        return 'close-dialog';
      }
      const back = [...document.querySelectorAll('button')].find(b => /Retour|Back|Accueil/i.test(b.textContent||'') || /retour|back/i.test(b.getAttribute('aria-label')||''));
      back?.click();
      return 'back';
    })()`);
    await sleep(900);
  }
  return false;
}

const { ws, send, evaluate } = await connect();

try {
  // ---- 0. Home / auth ----
  await ensureIdle(evaluate);
  await shot(send, '01_home.png');
  let t = await body(evaluate);
  writeFileSync(join(OUT, '01_home.txt'), t || '', 'utf8');
  record('Home idle (logged in)', /Démarrer la conversation/i.test(t || ''), (t || '').split('\n').filter(Boolean).slice(0, 6).join(' | '));
  record('Emergency CTA on home', /URGENCE|Emergency|À l'aide/i.test(t || ''));
  record('Quick phrases on home', /J'ai soif|Phrases rapides/i.test(t || ''));
  record('History entry on home', /historique|history/i.test(t || ''));
  record('No offline LLM UI on home', !/Mode hors ligne|télécharger le modèle|ModelDownload|llama\.cpp/i.test(t || ''));

  // ---- 1. Capacitor plugins ----
  const plugins = await evaluate(`(() => {
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
      hasLlama: names.some(n => /llama/i.test(n)) || Boolean(c.Plugins?.LlamaCpp),
    };
  })()`);
  writeFileSync(join(OUT, 'plugins.json'), JSON.stringify(plugins, null, 2), 'utf8');
  record('Capacitor Android native', Boolean(plugins?.isNative && plugins?.platform === 'android'), JSON.stringify(plugins));
  record('Plugin SpeechRecognition', Boolean(plugins?.hasSpeech));
  record('Plugin TextToSpeech', Boolean(plugins?.hasTts));
  record('Plugin Haptics', Boolean(plugins?.hasHaptics));
  record('Plugin SocialLogin', Boolean(plugins?.hasSocial));
  record('No LlamaCpp plugin (removed)', !plugins?.hasLlama, JSON.stringify(plugins?.plugins || []));

  // ---- 2. Backend health from WebView ----
  const health = await evaluate(`(async () => {
    const base = ${JSON.stringify(BACKEND.replace(/\/$/, ''))};
    try {
      const r = await fetch(base + '/v1/health');
      const j = await r.json().catch(() => null);
      return { ok: r.ok, status: r.status, base, health: j };
    } catch (e) {
      return { ok: false, base, error: String(e) };
    }
  })()`);
  writeFileSync(join(OUT, 'health.json'), JSON.stringify(health, null, 2), 'utf8');
  record('Backend /v1/health from WebView', Boolean(health?.ok), JSON.stringify(health).slice(0, 350));

  // ---- 3. Quick phrase tap (native TTS path) ----
  const phrase = await clickByText(evaluate, `/J'ai soif/i`);
  record("Tap quick phrase J'ai soif", Boolean(phrase?.ok), JSON.stringify(phrase));
  await sleep(3500);
  await shot(send, '02_after_phrase.png');
  t = await body(evaluate);
  writeFileSync(join(OUT, '02_after_phrase.txt'), t || '', 'utf8');
  // Should still be on home (phrase speak doesn't start session)
  record('Still on home after phrase', /Démarrer la conversation/i.test(t || ''));

  // ---- 4. Emergency button ----
  const urg = await clickByText(evaluate, `/URGENCE|Emergency|À l'aide|SOS/i`);
  record('Tap Emergency', Boolean(urg?.ok), JSON.stringify(urg));
  await sleep(3500);
  await shot(send, '03_after_emergency.png');
  t = await body(evaluate);
  writeFileSync(join(OUT, '03_after_emergency.txt'), t || '', 'utf8');
  // Emergency may open confirm or speak — record presence of UI change or still home
  record(
    'Emergency interaction (no crash)',
    Boolean(t && t.length > 20),
    (t || '').split('\n').filter(Boolean).slice(0, 8).join(' | '),
  );
  await ensureIdle(evaluate);

  // ---- 5. Quick phrases editor ----
  let nav = await clickByText(evaluate, `/Éditer les phrases rapides|Edit quick phrases/i`);
  if (!nav?.ok) nav = await clickByText(evaluate, `/\\+ Éditer|\\+ Edit|Phrases rapides/i`);
  await sleep(1200);
  await shot(send, '04_phrases_editor.png');
  t = await body(evaluate);
  writeFileSync(join(OUT, '04_phrases_editor.txt'), t || '', 'utf8');
  record(
    'Open quick phrases editor',
    Boolean(nav?.ok) && /Phrases rapides|Quick phrases|Ajouter|Add/i.test(t || ''),
    `nav=${JSON.stringify(nav)}`,
  );
  // Back
  await clickByText(evaluate, `/Retour|Back/i`);
  await sleep(900);
  await ensureIdle(evaluate);

  // Re-open (nav sync regression)
  nav = await clickByText(evaluate, `/Éditer les phrases rapides|Edit quick phrases/i`);
  if (!nav?.ok) nav = await clickByText(evaluate, `/\\+ Éditer|\\+ Edit/i`);
  await sleep(1000);
  t = await body(evaluate);
  record(
    'Re-open phrases editor (nav sync)',
    Boolean(nav?.ok) && /Phrases rapides|Quick phrases|Ajouter|Add/i.test(t || ''),
    JSON.stringify(nav),
  );
  await clickByText(evaluate, `/Retour|Back|Fermer|Close/i`);
  await sleep(800);
  await ensureIdle(evaluate);

  // ---- 6. History ----
  nav = await clickByText(evaluate, `/historique|history/i`);
  await sleep(1500);
  await shot(send, '05_history.png');
  t = await body(evaluate);
  writeFileSync(join(OUT, '05_history.txt'), t || '', 'utf8');
  record(
    'Open conversation history',
    Boolean(nav?.ok) && !/Démarrer la conversation/i.test(t || ''),
    (t || '').split('\n').filter(Boolean).slice(0, 8).join(' | '),
  );
  await clickByText(evaluate, `/Retour|Back|Accueil|Nouvelle|Fermer|Close/i`);
  await sleep(900);
  await ensureIdle(evaluate);

  // ---- 7. Settings (mobile) ----
  // Gear is often icon-only top-right
  const openSettings = await evaluate(`(() => {
    const labeled = [...document.querySelectorAll('button')].find((b) =>
      /param|settings|réglage/i.test(
        (b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent,
      ),
    );
    if (labeled) { labeled.click(); return labeled.getAttribute('aria-label') || labeled.textContent.trim() || 'labeled'; }
    const gear = [...document.querySelectorAll('button')].find((b) => {
      const r = b.getBoundingClientRect();
      return !b.textContent.trim() && r.top < 160 && r.left > 250;
    });
    if (gear) { gear.click(); return 'gear-pos'; }
    // last resort: any svg-only button in header
    const iconBtns = [...document.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.top < 120 && r.width > 0 && (!b.textContent.trim() || b.textContent.trim().length <= 2);
    });
    if (iconBtns.length) { iconBtns[iconBtns.length - 1].click(); return 'icon-' + iconBtns.length; }
    return 'missing';
  })()`);
  record('Open settings', openSettings !== 'missing', openSettings);
  await sleep(1400);
  await shot(send, '06_settings.png');
  t = await body(evaluate);
  writeFileSync(join(OUT, '06_settings.txt'), t || '', 'utf8');
  record(
    'Settings modal content',
    /Changer les param|Change settings|Sauvegarder|Save|Se déconnecter|Log out|Déconnexion/i.test(t || ''),
    (t || '').split('\n').filter(Boolean).slice(0, 10).join(' | '),
  );
  record(
    'Settings has NO offline LLM toggle',
    !/Mode hors ligne/i.test(t || ''),
    /Mode hors ligne/.test(t || '') ? 'still present' : 'absent (ok)',
  );
  record(
    'Mobile settings editable fields present',
    /Nom|Name|Langue|Language|Débit|Speech rate|learn|Accessib/i.test(t || ''),
    (t || '').split('\n').filter(Boolean).slice(0, 12).join(' | '),
  );
  record(
    'Desktop-only settings hint (or limited mobile surface)',
    /desktop|ordinateur|more settings|davantage|voix|voice/i.test(t || '') || /Sauvegarder/i.test(t || ''),
  );
  record(
    'Edit phrases entry reachable from settings',
    /\+ Éditer|Éditer les phrases|Edit quick|Phrases rapides/i.test(t || ''),
  );

  // Close settings
  await evaluate(`(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return 'no-dialog';
    const btns = [...dlg.querySelectorAll('button')];
    const cancel = btns.find(b => /annuler|fermer|close/i.test((b.textContent||'')+(b.getAttribute('aria-label')||'')));
    const icon = btns.find((b) => !b.textContent.trim() || b.textContent.trim().length <= 1);
    (cancel || icon || btns[0])?.click();
    return 'closed';
  })()`);
  await sleep(900);
  await ensureIdle(evaluate);

  // ---- 8. Start cloud conversation ----
  nav = await clickByText(evaluate, `/Démarrer la conversation|Start conversation|Start chatting/i`);
  record('Tap start conversation', Boolean(nav?.ok), JSON.stringify(nav));
  await sleep(5000);
  await shot(send, '07_session.png');
  t = await body(evaluate);
  writeFileSync(join(OUT, '07_session.txt'), t || '', 'utf8');
  const inSession =
    Boolean(nav?.ok) &&
    !/Démarrer la conversation/i.test(t || '') &&
    (/Fin|Stop|End|micro|écoute|listening|parole|keyword|réponse|response|En attente|Waiting/i.test(t || '') ||
      documentHasSessionUi(t));
  record(
    'Cloud session started',
    inSession,
    (t || '').split('\n').filter(Boolean).slice(0, 12).join(' | '),
  );

  // Settings blocked mid-session?
  const openSettingsInSession = await evaluate(`(() => {
    const labeled = [...document.querySelectorAll('button')].find((b) =>
      /param|settings|réglage/i.test((b.getAttribute('aria-label') || '') + ' ' + b.textContent),
    );
    if (labeled) { labeled.click(); return 'labeled'; }
    const gear = [...document.querySelectorAll('button')].find((b) => {
      const r = b.getBoundingClientRect();
      return !b.textContent.trim() && r.top < 160 && r.left > 250;
    });
    if (gear) { gear.click(); return 'gear'; }
    return 'missing';
  })()`);
  await sleep(1000);
  const afterSettingsAttempt = await body(evaluate);
  writeFileSync(join(OUT, '08_settings_in_session.txt'), afterSettingsAttempt || '', 'utf8');
  await shot(send, '08_settings_in_session.png');
  const settingsBlockedOrToast =
    !/Changer les param|Sauvegarder/i.test(afterSettingsAttempt || '') ||
    /conversation|en cours|bloqu|interdit|cannot|can't|unable|fermé|indisponible/i.test(afterSettingsAttempt || '');
  record(
    'Settings during conversation (blocked or toast)',
    openSettingsInSession === 'missing' || settingsBlockedOrToast,
    `open=${openSettingsInSession} | ${(afterSettingsAttempt || '').split('\n').filter(Boolean).slice(0, 8).join(' | ')}`,
  );

  // End session
  await clickByText(evaluate, `/Fin|Stop|End|Quitter/i`);
  await sleep(2000);
  await ensureIdle(evaluate);
  await shot(send, '09_back_home.png');
  t = await body(evaluate);
  record('Return home after session', /Démarrer la conversation/i.test(t || ''), (t || '').split('\n').filter(Boolean).slice(0, 6).join(' | '));

  // ---- Summary ----
  writeFileSync(join(OUT, 'full_qa_results.json'), JSON.stringify(results, null, 2), 'utf8');
  const failed = results.filter((r) => !r.ok);
  console.log('\n=== SUMMARY ===');
  console.log(`passed=${results.length - failed.length} failed=${failed.length} total=${results.length}`);
  if (failed.length) {
    for (const f of failed) console.log('FAIL:', f.name, '—', f.detail);
  }
  process.exitCode = failed.length ? 1 : 0;
} catch (e) {
  console.error('QA crashed:', e);
  process.exitCode = 1;
} finally {
  ws.close();
}

function documentHasSessionUi(t) {
  return /Fin de la conversation|End conversation|Arrêter|Mute|Muet/i.test(t || '');
}
