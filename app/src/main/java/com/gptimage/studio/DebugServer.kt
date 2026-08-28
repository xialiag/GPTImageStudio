package com.gptimage.studio

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URLDecoder
import kotlin.concurrent.thread

/**
 * 本地调试服务器: 同一 WiFi 下浏览器访问 http://<手机IP>:19864/ 实时查看运行日志。
 *  - /json          状态 JSON
 *  - /logs?tail=N   最近 N 条日志(JSON)
 *  - /logs?after=S  增量日志(S 之后)
 *  - /logs?clear=1  清空日志
 *  - /              HTML 页面(自动刷新)
 */
object DebugServer {
    private const val PORT = 19864
    @Volatile private var running = false
    private var serverSocket: ServerSocket? = null

    fun start(context: android.content.Context) {
        if (running) return
        Logger.init(context.getExternalFilesDir(null)?.resolve("logs"))
        thread(isDaemon = true, name = "DebugServer") {
            try {
                Logger.i("DebugServer", "启动于 http://${getIp()}:$PORT/")
                serverSocket = ServerSocket(PORT)
                running = true
                while (running) {
                    try {
                        val sock = serverSocket!!.accept()
                        thread(isDaemon = true) { handle(sock) }
                    } catch (e: Exception) {
                        if (running) Logger.w("DebugServer", "accept: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                Logger.e("DebugServer", "start: ${e.message}")
            }
        }
    }

    fun stop() {
        running = false
        runCatching { serverSocket?.close() }
        serverSocket = null
    }

    fun isRunning(): Boolean = running

    private fun handle(sock: java.net.Socket) {
        try {
            sock.soTimeout = 3000
            val reader = BufferedReader(InputStreamReader(sock.getInputStream()))
            val requestLine = reader.readLine() ?: return
            // 读掉剩余请求头直到空行
            while (true) {
                val h = reader.readLine() ?: break
                if (h.isEmpty()) break
            }
            val (path, query) = parseRequest(requestLine)
            val body = when {
                path == "/json" -> statusJson()
                path == "/logs" -> logsJson(query)
                else -> statusHtml(query)
            }
            val ct = if (path == "/logs" && !query.contains("view=")) "application/json" else "text/html"
            val out = sock.getOutputStream()
            val headers = "HTTP/1.1 200 OK\r\nContent-Type: $ct; charset=utf-8\r\n" +
                "Access-Control-Allow-Origin: *\r\nContent-Length: ${body.toByteArray().size}\r\n" +
                "Connection: close\r\n\r\n"
            out.write(headers.toByteArray())
            out.write(body.toByteArray())
            out.flush()
        } catch (e: Exception) {
            Logger.w("DebugServer", "handle: ${e.message}")
        } finally {
            runCatching { sock.close() }
        }
    }

    private fun parseRequest(line: String): Pair<String, Map<String, String>> {
        val parts = line.split(" ")
        if (parts.size < 2) return "/" to emptyMap()
        val target = parts[1]
        val path = target.substringBefore('?')
        val q = target.substringAfter('?', "")
        val params = q.split("&").filter { it.contains("=") }.associate {
            val kv = it.split("=", limit = 2)
            URLDecoder.decode(kv[0], "UTF-8") to URLDecoder.decode(kv[1], "UTF-8")
        }
        return path to params
    }

    private fun statusJson(): String {
        val o = JSONObject()
        o.put("ok", true)
        o.put("running", running)
        o.put("logs", Logger.recent(100).map { it.toString() })
        return o.toString()
    }

    private fun logsJson(query: Map<String, String>): String {
        if (query["clear"] == "1") { Logger.clear(); return "[]" }
        val tail = query["tail"]?.toIntOrNull() ?: 200
        val after = query["after"]?.toLongOrNull()
        val lines = if (after != null) Logger.after(after) else Logger.recent(tail)
        val arr = JSONArray()
        lines.forEach { arr.put(JSONObject().put("seq", it.seq).put("t", it.time).put("l", it.level).put("tag", it.tag).put("m", it.msg)) }
        return arr.toString()
    }

    private fun getIp(): String {
        return try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val addrs = interfaces.nextElement().inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement() as InetAddress
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) return addr.hostAddress
                }
            }
            "127.0.0.1"
        } catch (e: Exception) { "127.0.0.1" }
    }

    /** 完整访问地址, 供前端显示 */
    fun getUrl(): String = "http://${getIp()}:$PORT/"

    private fun statusHtml(query: Map<String, String>): String {
        val tail = query["tail"]?.toIntOrNull() ?: 200
        val logsHtml = Logger.recent(tail).joinToString("") { "<div class=\"lg\">${esc(it.toString())}</div>" }
        return """<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GPTImage Studio Debug</title><style>
body{background:#0e0a1a;color:#d4d0e0;font:13px/1.6 monospace;padding:16px;max-width:900px;margin:auto}
h1{color:#a78bfa;font-size:18px}.sub{color:#7a7290;font-size:12px;margin-bottom:12px}
.lg{white-space:pre-wrap;border-bottom:1px solid #2a2040;padding:2px 0}
.lg[data-l="E"]{color:#fb7185}.lg[data-l="W"]{color:#fbbf24}.lg[data-l="I"]{color:#6ee7a0}
a{color:#a78bfa}button{background:#a78bfa;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer}
</style></head><body>
<h1>GPTImage Studio 调试日志</h1>
<div class="sub">端口 ${PORT} · 自动每 2 秒刷新 · <a href="/json">/json</a> <a href="/logs?tail=$tail">/logs</a></div>
<button onclick="fetch('/logs?clear=1').then(()=>location.reload())">清空日志</button>
<div id="log">$logsHtml</div>
<script>
let seq=0;
async function pull(){try{const r=await fetch('/logs?after='+seq,'');const a=await r.json();for(const x of a){const d=document.createElement('div');d.className='lg';d.dataset.l=x.l;d.textContent='['+x.t+']['+x.l+']['+x.tag+'] '+x.m;document.getElementById('log').appendChild(d);if(x.seq>seq)seq=x.seq;}const l=document.getElementById('log');while(l.children.length>400)l.removeChild(l.firstChild);}catch(e){}}
pull();setInterval(pull,2000);
</script></body></html>"""
    }

    private fun esc(s: String): String = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
}
