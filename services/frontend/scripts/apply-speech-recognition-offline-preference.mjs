import fs from 'node:fs';
import path from 'node:path';

// Best-effort patch: make Android SpeechRecognizer prefer offline when possible.
// This doesn't embed a new STT model, but it makes the system component use
// the offline mode when language packs are installed.

const projectRoot = process.cwd();

const speechRecognitionJavaPath = path.join(
  projectRoot,
  'node_modules',
  '@capacitor-community',
  'speech-recognition',
  'android',
  'src',
  'main',
  'java',
  'com',
  'getcapacitor',
  'community',
  'speechrecognition',
  'SpeechRecognition.java',
);

if (!fs.existsSync(speechRecognitionJavaPath)) {
  // Dependencies not installed yet. Fine: the postinstall will re-run later.
  process.exit(0);
}

const file = fs.readFileSync(speechRecognitionJavaPath, 'utf8');
const offlineLine = 'intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);';
if (file.includes(offlineLine)) {
  console.log('[stt-offline] SpeechRecognition.java already patched.');
  process.exit(0);
}

const dictationModeLine = 'intent.putExtra("android.speech.extra.DICTATION_MODE", partialResults);';
if (!file.includes(dictationModeLine)) {
  console.warn(
    '[stt-offline] Could not find dictation mode line in SpeechRecognition.java; no change applied.',
  );
  process.exit(0);
}

const patched = file.replace(
  dictationModeLine,
  `${dictationModeLine}\n\n        ${offlineLine}`,
);

fs.writeFileSync(speechRecognitionJavaPath, patched, 'utf8');
console.log('[stt-offline] Patched SpeechRecognition.java to prefer offline STT.');

// Gradle 9.x (AGP 9) rejects `proguard-android.txt` (contains -dontoptimize).
// The plugin still ships the old name; patch it so `gradlew assembleDebug`
// works on modern toolchains.
const speechRecognitionGradlePath = path.join(
  projectRoot,
  'node_modules',
  '@capacitor-community',
  'speech-recognition',
  'android',
  'build.gradle',
);

if (fs.existsSync(speechRecognitionGradlePath)) {
  const gradleFile = fs.readFileSync(speechRecognitionGradlePath, 'utf8');
  const oldProguard = "getDefaultProguardFile('proguard-android.txt')";
  const newProguard =
    "getDefaultProguardFile('proguard-android-optimize.txt')";
  if (gradleFile.includes(oldProguard)) {
    fs.writeFileSync(
      speechRecognitionGradlePath,
      gradleFile.replace(oldProguard, newProguard),
      'utf8',
    );
    console.log(
      '[stt-offline] Patched speech-recognition build.gradle (proguard-android-optimize).',
    );
  }
}

