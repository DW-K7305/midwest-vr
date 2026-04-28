package com.midwestvr.launcher

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Schema for the JSON the MidWest-VR Mac app pushes to each headset:
 *
 * {
 *   "school_name": "Lincoln Middle School",
 *   "greeting": "Welcome, Wildcats",
 *   "include_system": false,
 *   "allowlist": ["com.beatgames.beatsaber", "com.AnotherAxiom.GorillaTag"]
 * }
 *
 * If `allowlist` is null/empty, all third-party apps show. If `include_system`
 * is true, system apps (Settings, Quest browser, etc.) also show.
 */
data class LauncherConfig(
    val schoolName: String? = null,
    val greeting: String? = null,
    val includeSystem: Boolean = false,
    val allowlist: List<String>? = null
)

class ConfigStore(private val ctx: Context) {

    private val file: File
        get() = File(ctx.getExternalFilesDir(null), "launcher_config.json")

    fun load(): LauncherConfig {
        if (!file.exists()) return LauncherConfig()
        return try {
            val raw = file.readText()
            val obj = JSONObject(raw)
            val list = obj.optJSONArray("allowlist")?.let { arr ->
                List(arr.length()) { arr.optString(it) }.filter { it.isNotBlank() }
            }
            LauncherConfig(
                schoolName = obj.optString("school_name").ifBlank { null },
                greeting = obj.optString("greeting").ifBlank { null },
                includeSystem = obj.optBoolean("include_system", false),
                allowlist = list
            )
        } catch (_: Throwable) {
            LauncherConfig()
        }
    }

    /** Used by the Mac app's adb-pushed config or by future in-headset settings. */
    @Suppress("unused")
    fun save(cfg: LauncherConfig) {
        val obj = JSONObject().apply {
            put("school_name", cfg.schoolName ?: "")
            put("greeting", cfg.greeting ?: "")
            put("include_system", cfg.includeSystem)
            put("allowlist", JSONArray(cfg.allowlist ?: emptyList<String>()))
        }
        file.writeText(obj.toString(2))
    }
}
