# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Keep bridge interface
-keep class com.gptimage.studio.ImageBridge { *; }

# Keep JavaScript interface
-keepclassmembers class com.gptimage.studio.ImageBridge {
    @android.webkit.JavascriptInterface <methods>;
}
