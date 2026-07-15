package com.invinciblevoice.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the on-device LLM plugin before the bridge starts.
        registerPlugin(LlamaCppPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
