// Minimal JNI bridge around llama.cpp for InvincibleVoice's on-device LLM.
//
// Exposes three operations to Kotlin (see LlamaBridge.kt):
//   init()                       - one-time backend init
//   loadModel(path, threads, ctx)-> handle (or 0 on failure)
//   generate(handle, prompt, grammar, temp, maxTokens) -> generated text
//   freeModel(handle)
//
// generate() constrains sampling with a GBNF grammar (grammar_root = "root"),
// which guarantees the output is our { suggested_answers, suggested_keywords }
// JSON. Generation is synchronous and returns the full string; the small model
// on a modern phone produces the ~100 tokens fast enough (see spike results).

#include <jni.h>
#include <android/log.h>

#include <chrono>
#include <string>
#include <vector>

#include "llama.h"

#define LOG_TAG "LlamaJni"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

// Route llama.cpp's internal logs to logcat so we can see load/grammar errors.
void llama_log_cb(ggml_log_level level, const char* text, void*) {
  int prio = level == GGML_LOG_LEVEL_ERROR ? ANDROID_LOG_ERROR
             : level == GGML_LOG_LEVEL_WARN ? ANDROID_LOG_WARN
                                            : ANDROID_LOG_INFO;
  __android_log_print(prio, "llama.cpp", "%s", text);
}

struct LlamaHandle {
  llama_model* model = nullptr;
  llama_context* ctx = nullptr;
  const llama_vocab* vocab = nullptr;
  int32_t n_ctx = 2048;
};

std::string piece_to_string(const llama_vocab* vocab, llama_token token) {
  char buf[256];
  const int n = llama_token_to_piece(vocab, token, buf, sizeof(buf), 0, true);
  if (n < 0) {
    return std::string();
  }
  return std::string(buf, n);
}

}  // namespace

extern "C" {

JNIEXPORT void JNICALL
Java_com_invinciblevoice_app_LlamaBridge_nativeInit(JNIEnv*, jobject) {
  llama_log_set(llama_log_cb, nullptr);
  llama_backend_init();
  LOGI("llama backend initialized");
}

JNIEXPORT jlong JNICALL
Java_com_invinciblevoice_app_LlamaBridge_nativeLoadModel(
    JNIEnv* env, jobject, jstring jpath, jint jthreads, jint jctx) {
  const char* path = env->GetStringUTFChars(jpath, nullptr);

  llama_model_params mparams = llama_model_default_params();
  mparams.n_gpu_layers = 0;  // CPU only for now
  // mmap fails on Android's FUSE-emulated /storage; and internal storage is
  // small enough that reading fully into RAM is fine on these devices.
  mparams.use_mmap = false;

  llama_model* model = llama_model_load_from_file(path, mparams);
  env->ReleaseStringUTFChars(jpath, path);
  if (!model) {
    LOGE("failed to load model");
    return 0;
  }

  llama_context_params cparams = llama_context_default_params();
  cparams.n_ctx = (uint32_t)jctx;
  cparams.n_threads = jthreads;
  cparams.n_threads_batch = jthreads;

  llama_context* ctx = llama_init_from_model(model, cparams);
  if (!ctx) {
    LOGE("failed to create context");
    llama_model_free(model);
    return 0;
  }

  auto* h = new LlamaHandle();
  h->model = model;
  h->ctx = ctx;
  h->vocab = llama_model_get_vocab(model);
  h->n_ctx = (int32_t)jctx;
  LOGI("model loaded, handle=%p", h);
  return reinterpret_cast<jlong>(h);
}

JNIEXPORT jstring JNICALL
Java_com_invinciblevoice_app_LlamaBridge_nativeGenerate(
    JNIEnv* env, jobject, jlong handle, jstring jprompt, jstring jgrammar,
    jfloat jtemp, jint jmaxTokens) {
  auto* h = reinterpret_cast<LlamaHandle*>(handle);
  if (!h) {
    return env->NewStringUTF("");
  }

  const char* prompt = env->GetStringUTFChars(jprompt, nullptr);
  const std::string prompt_str(prompt);
  env->ReleaseStringUTFChars(jprompt, prompt);

  // Tokenize the prompt.
  const int n_prompt = -llama_tokenize(h->vocab, prompt_str.c_str(),
                                       (int32_t)prompt_str.size(), nullptr, 0,
                                       true, true);
  std::vector<llama_token> tokens(n_prompt);
  if (llama_tokenize(h->vocab, prompt_str.c_str(), (int32_t)prompt_str.size(),
                     tokens.data(), (int32_t)tokens.size(), true, true) < 0) {
    LOGE("tokenize failed");
    return env->NewStringUTF("");
  }

  // Fresh KV cache for this generation.
  llama_memory_clear(llama_get_memory(h->ctx), true);

  // Sampler chain: grammar (structure) + temperature + distribution sampling.
  llama_sampler_chain_params sparams = llama_sampler_chain_default_params();
  llama_sampler* smpl = llama_sampler_chain_init(sparams);

  const char* grammar = nullptr;
  jsize grammar_len = 0;
  if (jgrammar != nullptr) {
    grammar_len = env->GetStringUTFLength(jgrammar);
    grammar = env->GetStringUTFChars(jgrammar, nullptr);
  }
  if (grammar != nullptr && grammar_len > 0) {
    llama_sampler_chain_add(smpl,
                            llama_sampler_init_grammar(h->vocab, grammar, "root"));
  }
  llama_sampler_chain_add(smpl, llama_sampler_init_temp(jtemp));
  llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

  std::string output;
  llama_batch batch = llama_batch_get_one(tokens.data(), (int32_t)tokens.size());
  llama_token new_token = 0;
  int decoded = 0;

  const auto t_start = std::chrono::steady_clock::now();
  for (int i = 0; i < jmaxTokens; ++i) {
    if (llama_decode(h->ctx, batch) != 0) {
      LOGE("decode failed at step %d", i);
      break;
    }
    new_token = llama_sampler_sample(smpl, h->ctx, -1);
    if (llama_vocab_is_eog(h->vocab, new_token)) {
      break;
    }
    output += piece_to_string(h->vocab, new_token);
    decoded++;
    batch = llama_batch_get_one(&new_token, 1);
  }
  const auto t_end = std::chrono::steady_clock::now();
  const double secs =
      std::chrono::duration<double>(t_end - t_start).count();

  llama_sampler_free(smpl);
  if (grammar != nullptr) {
    env->ReleaseStringUTFChars(jgrammar, grammar);
  }
  LOGI("generated %d tokens in %.2fs (%.1f tok/s), prompt=%d tok", decoded,
       secs, decoded / (secs > 0 ? secs : 1), n_prompt);
  return env->NewStringUTF(output.c_str());
}

JNIEXPORT void JNICALL
Java_com_invinciblevoice_app_LlamaBridge_nativeFreeModel(JNIEnv*, jobject,
                                                         jlong handle) {
  auto* h = reinterpret_cast<LlamaHandle*>(handle);
  if (!h) {
    return;
  }
  if (h->ctx) {
    llama_free(h->ctx);
  }
  if (h->model) {
    llama_model_free(h->model);
  }
  delete h;
}

}  // extern "C"
