package com.gptimage.studio

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager
import kotlin.concurrent.thread

class ImageBridge(
    private val activity: Activity,
    private val webView: WebView
) {
    private val prefs = activity.getSharedPreferences("gpt_image_studio", Context.MODE_PRIVATE)
    private val TAG = "ImageBridge"

    // Allow self-signed certs for custom proxies
    private val insecureTrustManager = object : X509TrustManager {
        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }
    @Suppress("unused")
    private val insecureSslContext by lazy {
        SSLContext.getInstance("TLS").apply {
            init(null, arrayOf(insecureTrustManager), SecureRandom())
        }
    }

    @JavascriptInterface
    fun getApiKey(profile: String): String {
        return prefs.getString("apikey_$profile", "") ?: ""
    }

    @JavascriptInterface
    fun setApiKey(profile: String, key: String) {
        prefs.edit().putString("apikey_$profile", key.trim()).apply()
    }

    @JavascriptInterface
    fun deleteApiKey(profile: String) {
        prefs.edit().remove("apikey_$profile").apply()
    }

    @JavascriptInterface
    fun httpRequest(requestId: String, url: String, method: String, headersJson: String, bodyJson: String) {
        thread(start = true, isDaemon = true) {
            try {
                Logger.i(TAG, "HTTP $method $url")
                if (bodyJson.isNotEmpty() && bodyJson.length < 500) Logger.i(TAG, "BODY $bodyJson")
                val client = getOkHttpClient()
                val headers = JSONObject(headersJson)
                val body = if (method == "POST" && bodyJson.isNotEmpty()) {
                    bodyJson.toRequestBody("application/json".toMediaType())
                } else {
                    null
                }

                val requestBuilder = Request.Builder().url(url).method(method, body)
                headers.keys().forEach { key ->
                    requestBuilder.addHeader(key, headers.getString(key))
                }

                client.newCall(requestBuilder.build()).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: java.io.IOException) {
                        Logger.e(TAG, "HTTP ${url} fail: ${e.message}")
                        postError(requestId, e.message ?: "Network error")
                    }

                    override fun onResponse(call: Call, response: Response) {
                        try {
                            val responseBody = response.body?.string() ?: ""
                            val isVision = bodyJson.contains("\"image_url\"") || bodyJson.contains("\"image\"")
                            if (response.code >= 400) {
                                Logger.e(TAG, "HTTP ${response.code} ${url}\n$responseBody")
                            } else if (isVision) {
                                Logger.i(TAG, "HTTP ${response.code} ${url} (vision) RESP: ${responseBody.take(1200)}")
                            } else {
                                Logger.i(TAG, "HTTP ${response.code} ${url}")
                            }
                            val result = JSONObject().apply {
                                put("status", response.code)
                                put("headers", JSONObject().apply {
                                    response.headers.forEach { (k, v) -> put(k, v) }
                                })
                                put("body", responseBody)
                            }
                            postResult(requestId, result.toString())
                        } catch (e: Exception) {
                            postError(requestId, e.message ?: "Parse error")
                        }
                    }
                })
            } catch (e: Exception) {
                postError(requestId, e.message ?: "Unknown error")
            }
        }
    }

    @JavascriptInterface
    fun httpStream(requestId: String, url: String, method: String, headersJson: String, bodyJson: String) {
        thread(start = true, isDaemon = true) {
            try {
                val client = getOkHttpClient().newBuilder()
                    .readTimeout(5, TimeUnit.MINUTES)
                    .build()
                val headers = JSONObject(headersJson)
                val body = if (method == "POST" && bodyJson.isNotEmpty()) {
                    bodyJson.toRequestBody("application/json".toMediaType())
                } else null

                val requestBuilder = Request.Builder().url(url).method(method, body)
                headers.keys().forEach { key ->
                    requestBuilder.addHeader(key, headers.getString(key))
                }

                val response = client.newCall(requestBuilder.build()).execute()
                if (!response.isSuccessful) {
                    postError(requestId, "HTTP ${response.code}: ${response.body?.string() ?: ""}")
                    return@thread
                }

                postStreamStart(requestId)

                val reader = response.body?.charStream() ?: run {
                    postError(requestId, "No response body")
                    return@thread
                }

                val buffer = CharArray(4096)
                while (true) {
                    val read = reader.read(buffer)
                    if (read == -1) break
                    val chunk = String(buffer, 0, read)
                    postStreamChunk(requestId, chunk)
                }

                reader.close()
                response.close()
                postStreamEnd(requestId)
            } catch (e: Exception) {
                postError(requestId, e.message ?: "Stream error")
            }
        }
    }

    @JavascriptInterface
    fun cancelRequest(@Suppress("UNUSED_PARAMETER") requestId: String) {
        // Cancel is handled by JS side
    }

    // multipart 请求(edits 图生图用; WebView fetch 有 CORS, 走原生绕开)
    // multipartJson: {"fields": {k:v}, "files": [{name, filename, b64, mime}]}
    @JavascriptInterface
    fun httpRequestMultipart(requestId: String, url: String, method: String, headersJson: String, multipartJson: String) {
        thread(start = true, isDaemon = true) {
            try {
                Logger.i(TAG, "HTTP(multipart) $method $url")
                val client = getOkHttpClient()
                val mp = JSONObject(multipartJson)
                val fields = mp.optJSONObject("fields") ?: JSONObject()
                val filesArr = mp.optJSONArray("files") ?: JSONArray()
                val builder = okhttp3.MultipartBody.Builder()
                    .setType(okhttp3.MultipartBody.FORM)
                fields.keys().forEach { k ->
                    builder.addFormDataPart(k, fields.optString(k))
                }
                for (i in 0 until filesArr.length()) {
                    val f = filesArr.getJSONObject(i)
                    val name = f.optString("name", "file")
                    val filename = f.optString("filename", name + ".png")
                    val b64 = f.optString("b64", "")
                    val mime = f.optString("mime", "image/png")
                    val bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
                    builder.addFormDataPart(name, filename, okhttp3.RequestBody.create(mime.toMediaType(), bytes))
                }
                val body = builder.build()
                val reqBuilder = Request.Builder().url(url).method(method, body)
                val headers = JSONObject(headersJson)
                headers.keys().forEach { k -> reqBuilder.addHeader(k, headers.optString(k)) }
                client.newCall(reqBuilder.build()).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: java.io.IOException) {
                        Logger.e(TAG, "HTTP(multipart) ${url} fail: ${e.message}")
                        postError(requestId, e.message ?: "Network error")
                    }
                    override fun onResponse(call: Call, response: Response) {
                        try {
                            val responseBody = response.body?.string() ?: ""
                            if (response.code >= 400) Logger.e(TAG, "HTTP(multipart) ${response.code} $url\n$responseBody")
                            else Logger.i(TAG, "HTTP(multipart) ${response.code} $url")
                            postResult(requestId, JSONObject().apply {
                                put("status", response.code)
                                put("body", responseBody)
                            }.toString())
                        } catch (e: Exception) { postError(requestId, e.message ?: "Parse error") }
                    }
                })
            } catch (e: Exception) {
                Log.e(TAG, "httpRequestMultipart failed", e)
                postError(requestId, e.message ?: "Multipart error")
            }
        }
    }

    @JavascriptInterface
    fun saveImage(base64Data: String, filename: String): Boolean {
        return try {
            val bytes = Base64.decode(base64Data, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: throw Exception("Failed to decode image")
            val saved = saveToMediaStore(bitmap, filename)
            if (saved) {
                Logger.i(TAG, "Image saved to gallery")
                true
            } else {
                saveToAppDir(bytes, filename) != null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Save image failed", e)
            false
        }
    }

    @JavascriptInterface
    fun saveImageFromUrl(imageUrl: String, filename: String): Boolean {
        return try {
            val bytes = downloadBytes(imageUrl)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: throw Exception("Failed to decode image")
            val saved = saveToMediaStore(bitmap, filename)
            if (saved) { Logger.i(TAG, "Image saved to gallery"); true }
            else { saveToAppDir(bytes, filename) != null }
        } catch (e: Exception) {
            Log.e(TAG, "saveImageFromUrl failed", e)
            false
        }
    }

    // 下载图片二进制 (保存到目录用)
    private fun downloadBytes(url: String): ByteArray {
        val client = getOkHttpClient()
        val request = Request.Builder().url(url).build()
        val response = client.newCall(request).execute()
        return response.body?.bytes() ?: throw Exception("Empty response")
    }

    @JavascriptInterface
    fun vibrate(durationMs: Long) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator?.vibrate(
                    VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else {
                @Suppress("DEPRECATION")
                val v = activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                v?.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        } catch (_: Exception) { }
    }

    @JavascriptInterface
    fun openImagePicker() {
        activity.runOnUiThread {
            webView.evaluateJavascript("window._nativeBridge.openPicker()", null)
        }
    }

    @JavascriptInterface
    fun getDisplayMetrics(): String {
        val dm = activity.resources.displayMetrics
        val config = activity.resources.configuration
        return JSONObject().apply {
            put("widthPx", dm.widthPixels)
            put("heightPx", dm.heightPixels)
            put("density", dm.density.toDouble())
            put("densityDpi", dm.densityDpi)
            put("orientation", when (config.orientation) {
                Configuration.ORIENTATION_LANDSCAPE -> "landscape"
                else -> "portrait"
            })
        }.toString()
    }

    // --- Internal helpers ---

    private fun getOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(3, TimeUnit.MINUTES)
            .writeTimeout(30, TimeUnit.MINUTES)
            .build()
    }

    private fun saveToMediaStore(bitmap: Bitmap, filename: String): Boolean {
        return try {
            val outputDir = prefs.getString("save_dir", defaultSaveDir) ?: defaultSaveDir
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, filename)
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH, outputDir)
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
            }
            val resolver = activity.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?: return false

            resolver.openOutputStream(uri)?.use { os ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, os)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear()
                values.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "MediaStore save failed", e)
            false
        }
    }

    private fun saveToAppDir(bytes: ByteArray, filename: String): File? {
        return try {
            val dir = File(activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "GPTImageStudio")
            dir.mkdirs()
            val file = File(dir, filename)
            FileOutputStream(file).use { it.write(bytes) }
            file
        } catch (e: Exception) {
            Log.e(TAG, "App dir save failed", e)
            null
        }
    }

    // ===== 自动落盘到应用私有目录(免权限, 生成即存) =====
    @JavascriptInterface
    fun saveToPrivateDir(base64Data: String, filename: String): String {
        return try {
            val bytes = Base64.decode(base64Data, Base64.DEFAULT)
            val file = saveToAppDir(bytes, filename) ?: return ""
            Logger.i(TAG, "私有目录落盘: ${file.absolutePath}")
            file.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "saveToPrivateDir failed", e)
            ""
        }
    }

    // ===== 删除落盘文件(用户删除历史时) =====
    @JavascriptInterface
    fun deleteSavedFile(path: String): Boolean {
        return try {
            val f = File(path)
            if (f.exists()) { f.delete(); true } else false
        } catch (e: Exception) {
            Log.e(TAG, "deleteSavedFile failed", e)
            false
        }
    }

    // 读取私有目录文件为 dataURL(历史页用, 避免 localStorage 存大 base64)
    @JavascriptInterface
    fun readSavedFile(path: String): String {
        return try {
            val f = File(path)
            if (!f.exists()) return ""
            val bytes = f.readBytes()
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            val mime = "image/png"
            "data:$mime;base64,$b64"
        } catch (e: Exception) {
            Log.e(TAG, "readSavedFile failed", e)
            ""
        }
    }
    // ===== 异步落盘/读图桥 (大 base64/大文件走后台线程, 避免同步桥阻塞 JS 主线程) =====
    @JavascriptInterface
    fun saveToPrivateDirAsync(requestId: String, base64Data: String, filename: String) {
        thread(start = true, isDaemon = true) {
            try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                val file = saveToAppDir(bytes, filename)
                val result = if (file != null) {
                    Logger.i(TAG, "私有目录落盘(async): ${file.absolutePath}")
                    file.absolutePath
                } else ""
                postResult(requestId, JSONObject().apply { put("result", result) }.toString())
            } catch (e: Exception) {
                Log.e(TAG, "saveToPrivateDirAsync failed", e)
                postError(requestId, e.message ?: "save error")
            }
        }
    }

    @JavascriptInterface
    fun readSavedFileAsync(requestId: String, path: String) {
        thread(start = true, isDaemon = true) {
            try {
                val f = File(path)
                if (!f.exists()) {
                    postResult(requestId, JSONObject().apply { put("result", "") }.toString())
                    return@thread
                }
                val bytes = f.readBytes()
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                Logger.i(TAG, "readSavedFileAsync: ${f.absolutePath} bytes=${bytes.size}")
                postResult(requestId, JSONObject().apply { put("result", "data:image/png;base64,$b64") }.toString())
            } catch (e: Exception) {
                Log.e(TAG, "readSavedFileAsync failed", e)
                postError(requestId, e.message ?: "read error")
            }
        }
    }

    // ===== 保存到指定目录 (BBDown 方式: 直接 File 写) =====
    private val defaultSaveDir = "Pictures/GPTImageStudio"

    /** 规范化保存目录: 有权限用公共路径, 否则回退应用私有目录 */
    private fun normalizeSaveDir(path: String?): File {
        val clean = path?.trim()?.trimStart('/') ?: return defaultSaveDirFile()
        // 公共存储路径
        if (clean.startsWith("Download/") || clean.startsWith("Pictures/") || clean.startsWith("DCIM/")
            || clean.startsWith("Music/") || clean.startsWith("Movies/") || clean.startsWith("Documents/")) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
                Log.w(TAG, "公共存储未授权, 回退应用私有目录: $clean")
                return defaultSaveDirFile()
            }
            val f = File(Environment.getExternalStorageDirectory(), clean)
            f.mkdirs()
            return f
        }
        // 应用私有目录下(免权限)
        val f = File(activity.getExternalFilesDir(null), clean)
        f.mkdirs()
        return f
    }

    private fun defaultSaveDirFile(): File {
        val f = File(activity.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "GPTImageStudio")
        f.mkdirs()
        return f
    }

    // ===== 所有文件访问权限 (公共目录保存需要, 对齐 BBDownAndroid) =====
    @JavascriptInterface
    fun hasAllFilesAccess(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager()
    }

    /** 跳转系统"所有文件访问"授权设置页 */
    @JavascriptInterface
    fun requestAllFilesAccess() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Android 11+: 打开"所有文件访问"授权页(需 FLAG_ACTIVITY_NEW_TASK, 对齐 BBDown)
                val intent = android.content.Intent(
                    android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    android.net.Uri.parse("package:" + activity.packageName)
                )
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(intent)
            } else {
                // Android 10及以下: 运行时申请写权限
                val perm = android.Manifest.permission.WRITE_EXTERNAL_STORAGE
                if (activity.checkSelfPermission(perm) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    androidx.core.app.ActivityCompat.requestPermissions(activity, arrayOf(perm), 1001)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "requestAllFilesAccess failed: ${e.message}")
            try {
                // 某些定制ROM不支持带 package 的跳转, 回退到通用授权页
                val intent = android.content.Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.startActivity(intent)
            } catch (e2: Exception) { Log.e(TAG, "fallback failed: ${e2.message}") }
        }
    }

    @JavascriptInterface
    fun getSaveDir(): String {
        return prefs.getString("save_dir", defaultSaveDir) ?: defaultSaveDir
    }

    @JavascriptInterface
    fun setSaveDir(path: String) {
        val clean = path.trim().trimStart('/')
        prefs.edit().putString("save_dir", if (clean.isBlank()) defaultSaveDir else clean).apply()
    }

    /** 保存 base64 到指定目录 (用户选择的输出目录) */
    @JavascriptInterface
    fun saveToDir(base64Data: String, filename: String, dir: String): Boolean {
        return try {
            val bytes = Base64.decode(base64Data, Base64.DEFAULT)
            val target = normalizeSaveDir(dir)
            target.mkdirs()
            val file = File(target, filename)
            FileOutputStream(file).use { it.write(bytes) }
            Log.i(TAG, "Saved to dir: ${file.absolutePath}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "saveToDir failed", e)
            false
        }
    }

    /** 保存 URL 图片到指定目录 */
    @JavascriptInterface
    fun saveUrlToDir(imageUrl: String, filename: String, dir: String): Boolean {
        return try {
            val bytes = downloadBytes(imageUrl)
            val target = normalizeSaveDir(dir)
            target.mkdirs()
            val file = File(target, filename)
            FileOutputStream(file).use { it.write(bytes) }
            true
        } catch (e: Exception) {
            Log.e(TAG, "saveUrlToDir failed", e)
            false
        }
    }

    private fun postResult(requestId: String, data: String) {
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window._nativeBridge.onResult('$requestId', $data)", null
            )
        }
    }

    private fun postError(requestId: String, message: String) {
        val escaped = message.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window._nativeBridge.onError('$requestId', '$escaped')", null
            )
        }
    }

    private fun postStreamStart(requestId: String) {
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window._nativeBridge.onStreamStart('$requestId')", null
            )
        }
    }

    private fun postStreamChunk(requestId: String, chunk: String) {
        val escaped = chunk.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window._nativeBridge.onStreamChunk('$requestId', '$escaped')", null
            )
        }
    }

    private fun postStreamEnd(requestId: String) {
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "window._nativeBridge.onStreamEnd('$requestId')", null
            )
        }
    }

    private fun postCallback(method: String, arg: String) {
        webView.evaluateJavascript("window._nativeBridge.$method($arg)", null)
    }

    // 读取焚决预设数据 (JSON, 独立于 JS 代码)
    @JavascriptInterface
    fun loadFenjuePresets(): String {
        try {
            val input = activity.assets.open("fenjue.json")
            val bytes = input.readBytes()
            input.close()
            return String(bytes, Charsets.UTF_8)
        } catch (e: Exception) {
            Log.e(TAG, "loadFenjuePresets failed: ${e.message}")
            return "[]"
        }
    }

    // 复制文本到系统剪贴板 (可靠, 替代 navigator.clipboard)
    @JavascriptInterface
    fun copyToClipboard(text: String): Boolean {
        return try {
            val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cm.setPrimaryClip(android.content.ClipData.newPlainText("gptimage", text))
            true
        } catch (e: Exception) {
            Log.e(TAG, "copyToClipboard failed: ${e.message}")
            false
        }
    }

    // 调试服务器开关
    @JavascriptInterface
    fun setDebugServer(on: Boolean) {
        if (on) DebugServer.start(activity) else DebugServer.stop()
        Logger.i(TAG, "DebugServer " + if (on) "开启" else "关闭")
    }

    @JavascriptInterface
    fun isDebugServerRunning(): Boolean = DebugServer.isRunning()

    @JavascriptInterface
    fun getDebugServerUrl(): String = DebugServer.getUrl()

    // JS 日志桥: 让 JS 侧的关键日志写入 Logger(DebugServer 可读)
    @JavascriptInterface
    fun log(level: String, tag: String, msg: String) {
        when (level) {
            "E" -> Logger.e(tag, msg)
            "W" -> Logger.w(tag, msg)
            "D" -> Logger.d(tag, msg)
            else -> Logger.i(tag, msg)
        }
    }

    // 获取日志文本(日志页面用)
    @JavascriptInterface
    fun getDebugLogs(): String = Logger.dump()

    @JavascriptInterface
    fun clearDebugLogs(): Boolean {
        Logger.clear(); return true
    }
}
