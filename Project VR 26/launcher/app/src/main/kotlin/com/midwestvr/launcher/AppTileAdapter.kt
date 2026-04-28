package com.midwestvr.launcher

import android.graphics.drawable.Drawable
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.midwestvr.launcher.databinding.ItemAppTileBinding

data class AppTile(
    val packageName: String,
    val label: String,
    val icon: Drawable?
)

class AppTileAdapter(
    private val onTap: (AppTile) -> Unit
) : ListAdapter<AppTile, AppTileAdapter.VH>(DIFF) {

    fun submit(items: List<AppTile>) = submitList(items)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemAppTileBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        holder.bind(getItem(position))
    }

    inner class VH(private val binding: ItemAppTileBinding)
        : RecyclerView.ViewHolder(binding.root) {

        fun bind(tile: AppTile) {
            binding.label.text = tile.label
            tile.icon?.let { binding.icon.setImageDrawable(it) }
            binding.root.setOnClickListener { onTap(tile) }
        }
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<AppTile>() {
            override fun areItemsTheSame(a: AppTile, b: AppTile) =
                a.packageName == b.packageName
            override fun areContentsTheSame(a: AppTile, b: AppTile) =
                a.packageName == b.packageName && a.label == b.label
        }
    }
}
