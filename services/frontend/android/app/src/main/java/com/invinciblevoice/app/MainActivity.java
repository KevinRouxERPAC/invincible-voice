package com.invinciblevoice.app;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

// Implements ModifiedMainActivityForSocialLoginPlugin: the @capgo social-login
// plugin refuses Google sign-in with scopes unless the host activity declares
// this marker interface (see GoogleProvider#login) and forwards the Google
// authorization result back to the plugin via onActivityResult.
public class MainActivity
    extends BridgeActivity
    implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the on-device LLM plugin before the bridge starts.
        registerPlugin(LlamaCppPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        // Google's authorization screen returns through onActivityResult; hand
        // the matching request codes to the social-login plugin so it can finish
        // resolving the scopes/token.
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
            && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.i("MainActivity", "SocialLogin plugin handle is null");
                return;
            }
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.i("MainActivity", "SocialLogin plugin instance is wrong type");
                return;
            }
            ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    // Marker method required by ModifiedMainActivityForSocialLoginPlugin. Its
    // mere presence is what tells the plugin the activity is wired correctly.
    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
