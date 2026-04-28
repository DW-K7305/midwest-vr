package com.midwestvr.launcher

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.format.DateFormat
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.midwestvr.launcher.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.lifecycle.lifecycleScope
import java.util.Date

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val configStore by lazy { ConfigStore(this) }
    private val adapter = AppTileAdapter { entry ->
        // Tap → launch the underlying activity.
        val intent = packageManager.getLaunchIntentForPackage(entry.packageName)
        intent?.let {
            it.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            startActivity(it)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.recycler.layoutManager = GridLayoutManager(this, 4)
        binding.recycler.adapter = adapter

        // Hidden teacher-mode escape hatch: long-press the brand mark to
        // launch the system Settings (school staff troubleshooting).
        binding.brandMark.setOnLongClickListener {
            try {
                val settingsIntent = Intent(android.provider.Settings.ACTION_SETTINGS)
                settingsIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                startActivity(settingsIntent)
            } catch (_: Throwable) { /* swallow */ }
            true
        }

        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        val cfg = configStore.load()
        binding.title.text = cfg.schoolName ?: getString(R.string.app_name)
        binding.greeting.text = greeting(cfg.greeting)
        binding.allowlistBadge.visibility =
            if (cfg.allowlist.isNullOrEmpty()) View.GONE else View.VISIBLE

        lifecycleScope.launch {
            val tiles = withContext(Dispatchers.IO) {
                loadInstalledApps(cfg)
            }
            adapter.submit(tiles)
            binding.empty.visibility = if (tiles.isEmpty()) View.VISIBLE else View.GONE
        }
    }

    /** Read installed apps, optionally filter to allowlist, return AppTile list. */
    private fun loadInstalledApps(cfg: LauncherConfig): List<AppTile> {
        val pm = packageManager
        val flags = PackageManager.GET_META_DATA
        val launcherIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val resolved = pm.queryIntentActivities(launcherIntent, 0)
        val mine = packageName

        return resolved
            .asSequence()
            .map { it.activityInfo }
            .filter { it.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM == 0 || cfg.includeSystem }
            .filter { it.packageName != mine } // hide ourselves
            .filter { cfg.allowlist.isNullOrEmpty() || it.packageName in cfg.allowlist }
            .map {
                val label = it.loadLabel(pm).toString()
                val icon = try {
                    it.loadIcon(pm)
                } catch (_: Throwable) {
                    null
                }
                AppTile(
                    packageName = it.packageName,
                    label = label,
                    icon = icon
                )
            }
            .sortedBy { it.label.lowercase() }
            .toList()
    }

    private fun greeting(custom: String?): String {
        if (!custom.isNullOrBlank()) return custom
        val hour = (DateFormat.format("H", Date()) as CharSequence).toString().toIntOrNull() ?: 12
        return when (hour) {
            in 5..11 -> "Good morning"
            in 12..16 -> "Good afternoon"
            in 17..21 -> "Good evening"
            else -> "Welcome"
        }
    }
}
