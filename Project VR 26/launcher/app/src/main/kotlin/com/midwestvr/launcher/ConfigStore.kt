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
 *   "allowlist": ["com.beatgames.beatsaber", "com.AnotherAxiom.GorillaTag"],
 *   "kiosk_app": "com.beatgames.beatsaber"   // optional — class-mode lock
 * }
 *
 * If `allowlist` is null/empty, all third-party apps show. If `include_system`
 * is true, system apps (Settings, Quest browser, etc.) also show.
 *
 * If `kiosk_app` is set, MainActivity ignores everything else and immediately
 * (re-)launches that single package on every onResume. Combined with this
 * launcher being the system home activity, that's the Class Mode lock: the
 * student physically cannot navigate away from the chosen app until an admin
 * clears the field from the desktop app.
 */
data class LauncherConfig(
    val schoolName: String? = null,
    val greeting: String? = null,
    val includeSystem: Boolean = false,
    val allowlist: List<String>? = null,
    val kioskApp: String? = null
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
                allowlist = list,
                kioskApp = obj.optString("kiosk_app").ifBlank { null }
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
            cfg.kioskApp?.let { put("kiosk_app", it) }
        }
        file.writeText(obj.toString(2))
    }
}
