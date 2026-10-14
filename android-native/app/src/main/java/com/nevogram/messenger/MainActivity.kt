package com.nevogram.messenger

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Native Android entry point.
 * This initial screen is a scaffold; authentication and chat UI are being connected
 * to the existing Nevogram API in subsequent implementation steps.
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(32, 32, 32, 32)
            setBackgroundColor(Color.rgb(17, 27, 39))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        val title = TextView(this).apply {
            text = "✈  Nevogram"
            textSize = 30f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        val subtitle = TextView(this).apply {
            text = "Нативное приложение для Android"
            textSize = 16f
            setTextColor(Color.rgb(180, 196, 212))
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 0)
        }
        root.addView(title)
        root.addView(subtitle)
        setContentView(root)
    }
}
