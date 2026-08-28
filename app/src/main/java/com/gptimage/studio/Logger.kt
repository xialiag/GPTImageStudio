package com.gptimage.studio

import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.ConcurrentLinkedDeque

/** 一条带全局自增 seq 的日志(seq 供调试服务器增量拉取) */
data class LogLine(
    val seq: Long,
    val time: String,
    val level: String,
    val tag: String,
    val msg: String,
) {
    override fun toString(): String = "[$time][$level][$tag] $msg"
}

/**
 * 调试日志系统，记录应用运行日志，供 DebugServer 实时查看。
 * - 内存环形缓冲区(自动裁剪旧日志)
 * - 同时输出到 logcat 便于 adb 调试
 * - 自动落盘到日期文件(保留 7 天)
 */
object Logger {
    private val logs = ConcurrentLinkedDeque<LogLine>()
    private val seqGen = java.util.concurrent.atomic.AtomicLong(1)
    private const val MAX_LOGS = 1000
    private val timeFormat = object : ThreadLocal<SimpleDateFormat>() {
        override fun initialValue() = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault())
    }
    private val fileTimeFormat = object : ThreadLocal<SimpleDateFormat>() {
        override fun initialValue() = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.getDefault())
    }
    private val dayFormat = object : ThreadLocal<SimpleDateFormat>() {
        override fun initialValue() = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    }

    @Volatile private var logDir: File? = null
    private val fileLock = Any()

    /** 初始化日志目录(应用启动时调用; 清理 7 天前日志) */
    fun init(dir: File?) {
        if (dir == null) return
        try {
            dir.mkdirs()
            synchronized(fileLock) { logDir = dir }
            val cutoff = System.currentTimeMillis() - 7L * 24 * 3600 * 1000
            dir.listFiles { f -> f.name.startsWith("debug_") && f.name.endsWith(".log") && f.lastModified() < cutoff }
                ?.forEach { runCatching { it.delete() } }
        } catch (_: Exception) {}
    }

    fun d(tag: String, msg: String) = append("D", tag, msg, Log.DEBUG)
    fun i(tag: String, msg: String) = append("I", tag, msg, Log.INFO)
    fun w(tag: String, msg: String) = append("W", tag, msg, Log.WARN)
    fun e(tag: String, msg: String) = append("E", tag, msg, Log.ERROR)

    private fun append(level: String, tag: String, msg: String, lc: Int) {
        val line = LogLine(seqGen.getAndIncrement(), timeFormat.get().format(System.currentTimeMillis()), level, tag, msg)
        logs.addLast(line)
        while (logs.size > MAX_LOGS) logs.pollFirst()
        Log.println(lc, "GPTImage/$tag", msg)
        writeToFile(line)
    }

    private fun writeToFile(line: LogLine) {
        try {
            val dir = logDir ?: return
            val day = dayFormat.get().format(System.currentTimeMillis())
            val file = File(dir, "debug_$day.log")
            synchronized(fileLock) {
                file.appendText("${fileTimeFormat.get().format(System.currentTimeMillis())} [$line]\n")
            }
        } catch (_: Exception) {}
    }

    /** 取最近 N 条 */
    fun recent(n: Int): List<LogLine> {
        val list = logs.toList()
        if (list.size <= n) return list
        return list.takeLast(n)
    }

    /** 取 seq 之后的增量日志 */
    fun after(seq: Long): List<LogLine> {
        return logs.filter { it.seq > seq }
    }

    fun clear() { logs.clear() }

    /** 导出全部日志文本(按时间顺序) */
    fun dump(): String {
        return logs.joinToString("\n") { it.toString() }
    }
}
