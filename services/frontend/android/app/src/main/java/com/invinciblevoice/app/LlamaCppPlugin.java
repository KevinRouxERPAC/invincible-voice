package com.invinciblevoice.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Capacitor plugin exposing the on-device llama.cpp engine to the web layer.
 *
 * A single model is held in the plugin. Generation runs on a dedicated
 * single-thread executor so the WebView/UI thread is never blocked, and each
 * call resolves once the (short) generation finishes.
 */
@CapacitorPlugin(name = "LlamaCpp")
public class LlamaCppPlugin extends Plugin {
    private final ExecutorService exec = Executors.newSingleThreadExecutor();
    private volatile long handle = 0L;
    private volatile boolean initialized = false;

    @PluginMethod
    public void isLoaded(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("loaded", handle != 0L);
        call.resolve(ret);
    }

    @PluginMethod
    public void loadModel(PluginCall call) {
        final String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        }
        final int threads = call.getInt("threads", 6);
        final int nCtx = call.getInt("nCtx", 2048);

        exec.execute(() -> {
            try {
                if (!initialized) {
                    LlamaBridge.nativeInit();
                    initialized = true;
                }
                if (handle != 0L) {
                    LlamaBridge.nativeFreeModel(handle);
                    handle = 0L;
                }
                long h = LlamaBridge.nativeLoadModel(path, threads, nCtx);
                if (h == 0L) {
                    call.reject("failed to load model at " + path);
                } else {
                    handle = h;
                    JSObject ret = new JSObject();
                    ret.put("loaded", true);
                    call.resolve(ret);
                }
            } catch (Throwable e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "model load error");
            }
        });
    }

    @PluginMethod
    public void generate(PluginCall call) {
        final String prompt = call.getString("prompt");
        if (prompt == null) {
            call.reject("prompt is required");
            return;
        }
        final String grammar = call.getString("grammar");
        final Float temperatureObj = call.getFloat("temperature", 0.7f);
        final float temperature = temperatureObj != null ? temperatureObj : 0.7f;
        final int maxTokens = call.getInt("maxTokens", 400);

        exec.execute(() -> {
            final long h = handle;
            if (h == 0L) {
                call.reject("model not loaded");
                return;
            }
            try {
                String text = LlamaBridge.nativeGenerate(h, prompt, grammar, temperature, maxTokens);
                JSObject ret = new JSObject();
                ret.put("text", text);
                call.resolve(ret);
            } catch (Throwable e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "generation error");
            }
        });
    }
}
