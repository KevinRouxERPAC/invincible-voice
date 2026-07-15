package com.invinciblevoice.app;

/**
 * Thin Java wrapper over the llama.cpp JNI bridge (see cpp/llama-jni.cpp).
 * All calls are blocking and must be invoked off the main thread.
 */
public final class LlamaBridge {
    static {
        System.loadLibrary("llama-jni");
    }

    private LlamaBridge() {}

    /** One-time backend initialization. */
    public static native void nativeInit();

    /** Loads a GGUF model; returns an opaque handle (0 on failure). */
    public static native long nativeLoadModel(String path, int threads, int nCtx);

    /**
     * Generates text constrained by the optional GBNF grammar (root = "root").
     * Returns the full generated string.
     */
    public static native String nativeGenerate(
        long handle,
        String prompt,
        String grammar,
        float temp,
        int maxTokens
    );

    /** Frees the model + context for the handle. */
    public static native void nativeFreeModel(long handle);
}
