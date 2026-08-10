# ProGuard / R8 rules for Capacitor (InvincibleVoice)
# Keep stack traces readable in Play Console crash reports.
-keepattributes SourceFile,LineNumberTable,Signature,*Annotation*,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# Capacitor core + plugins discovered via reflection / annotations
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep class org.apache.cordova.** { *; }
-keep public class * extends com.getcapacitor.Plugin
-keepclassmembers class * {
    @com.getcapacitor.annotation.CapacitorPlugin *;
    @com.getcapacitor.PluginMethod *;
}

# Community / Capgo plugins used by this app
-keep class com.getcapacitor.community.** { *; }
-keep class ee.forgr.capacitor.social.login.** { *; }

# App entry + any JS bridges
-keep class com.invinciblevoice.app.** { *; }

# Google / AndroidX bits sometimes touched by Social Login
-keep class com.google.android.gms.auth.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.api.**
