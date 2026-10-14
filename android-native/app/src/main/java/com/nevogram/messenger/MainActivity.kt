package com.nevogram.messenger

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private val baseUrl = "https://nevogram-messenger.onrender.com"
    private var token: String? = null
    private var socket: Socket? = null
    private var currentChatId: String? = null
    private var currentChatTitle: String = "Чат"
    private lateinit var root: LinearLayout
    private lateinit var content: LinearLayout
    private val bg = Color.rgb(17, 27, 39)
    private val panel = Color.rgb(28, 41, 56)
    private val accent = Color.rgb(78, 164, 245)
    private val white = Color.WHITE
    private val muted = Color.rgb(180, 196, 212)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showLogin()
    }

    override fun onDestroy() {
        disconnectSocket()
        super.onDestroy()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun makeRoot(title: String) {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(16))
            setBackgroundColor(bg)
        }
        val heading = TextView(this).apply {
            text = "✈  $title"
            textSize = 26f
            setTextColor(white)
            setPadding(0, 0, 0, dp(18))
        }
        root.addView(heading)
        content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
    }

    private fun field(hint: String, secret: Boolean = false): EditText =
        EditText(this).apply {
            this.hint = hint
            setTextColor(white)
            setHintTextColor(muted)
            textSize = 16f
            setSingleLine(true)
            setPadding(dp(14), dp(10), dp(14), dp(10))
            setBackgroundColor(panel)
            if (secret) inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            val lp = LinearLayout.LayoutParams(-1, dp(52))
            lp.bottomMargin = dp(12)
            layoutParams = lp
        }

    private fun button(label: String, action: () -> Unit): Button =
        Button(this).apply {
            text = label
            isAllCaps = false
            setTextColor(white)
            setBackgroundColor(accent)
            setOnClickListener { action() }
            val lp = LinearLayout.LayoutParams(-1, dp(48))
            lp.bottomMargin = dp(10)
            layoutParams = lp
        }

    private fun label(text: String, size: Float = 15f): TextView =
        TextView(this).apply {
            this.text = text
            textSize = size
            setTextColor(white)
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }

    private fun showLogin(message: String = "") {
        disconnectSocket()
        token = null
        currentChatId = null
        makeRoot("Nevogram")
        content.addView(label("Войди в свой аккаунт, чтобы открыть чаты.", 15f))
        val username = field("Логин")
        val password = field("Пароль", true)
        val twoFactor = field("Код 2FA (если включён)")
        content.addView(username)
        content.addView(password)
        content.addView(twoFactor)
        val status = label(message, 13f)
        status.setTextColor(Color.rgb(255, 130, 130))
        content.addView(status)
        content.addView(button("Войти") {
            val user = username.text.toString().trim().lowercase()
            val pass = password.text.toString()
            val code = twoFactor.text.toString().trim()
            if (user.isBlank() || pass.isBlank()) {
                status.text = "Введите логин и пароль"
            } else {
                status.text = "Выполняется вход…"
                request("POST", "/api/auth/login", JSONObject().put("username", user).put("password", pass).put("twoFactorCode", code), null) { result, error ->
                    if (error != null) { showLogin(error); return@request }
                    if (result?.optBoolean("requiresTwoFactor") == true) { showLogin("Введите код двухфакторной защиты."); return@request }
                    val receivedToken = result?.optString("token")
                    if (receivedToken.isNullOrBlank() || receivedToken == "null") {
                        showLogin("Сервер не вернул токен входа.")
                    } else {
                        token = receivedToken
                        connectSocket(receivedToken)
                        loadChats()
                    }
                }
            }
        })
        content.addView(label("Nevogram • мобильное приложение", 12f).apply { setTextColor(muted) })
    }

    private fun connectSocket(sessionToken: String) {
        disconnectSocket()
        try {
            val options = IO.Options().apply {
                auth = mapOf("token" to sessionToken)
                reconnection = true
                reconnectionAttempts = Int.MAX_VALUE
                reconnectionDelay = 1000
            }
            val newSocket = IO.socket(baseUrl, options)
            socket = newSocket
            newSocket.on("message:new", Emitter.Listener { args ->
                val data = args.firstOrNull() as? JSONObject ?: return@Listener
                val chatId = data.optString("chatId")
                runOnUiThread {
                    if (token == sessionToken && currentChatId == chatId) {
                        openChat(chatId, currentChatTitle)
                    } else if (token == sessionToken) {
                        // Refresh the list so its latest-message preview stays current.
                        if (currentChatId == null) loadChats()
                    }
                }
            })
            newSocket.on("chat:new", Emitter.Listener {
                runOnUiThread { if (token == sessionToken && currentChatId == null) loadChats() }
            })
            newSocket.on(Socket.EVENT_CONNECT_ERROR, Emitter.Listener {
                runOnUiThread {
                    if (token == sessionToken && currentChatId == null) {
                        // REST still works if the realtime connection is temporarily unavailable.
                    }
                }
            })
            newSocket.connect()
        } catch (_: Exception) {
            socket = null
        }
    }

    private fun disconnectSocket() {
        socket?.off()
        socket?.disconnect()
        socket?.close()
        socket = null
    }

    private fun loadChats() {
        request("GET", "/api/chats", null, token) { result, error ->
            if (error != null) { showLogin(error); return@request }
            currentChatId = null
            makeRoot("Ваши чаты")
            content.addView(button("Выйти из аккаунта") { showLogin() })
            val list = result?.optJSONArray("chats") ?: JSONArray()
            if (list.length() == 0) content.addView(label("Пока нет чатов. Когда вам напишут или вы начнёте переписку, она появится здесь.", 14f))
            for (i in 0 until list.length()) {
                val chat = list.optJSONObject(i) ?: continue
                val id = chat.optString("id")
                val title = chat.optString("title", "Чат")
                val last = chat.optJSONObject("lastMessage")?.optString("text", "Нет сообщений") ?: "Нет сообщений"
                content.addView(button("$title\n$last") { openChat(id, title) })
            }
        }
    }

    private fun openChat(id: String, title: String) {
        currentChatId = id
        currentChatTitle = title
        request("GET", "/api/chats/$id/messages", null, token) { result, error ->
            if (error != null) { loadChats(); return@request }
            // A delayed response for a chat the user already left must not replace the current screen.
            if (currentChatId != id) return@request
            makeRoot(title)
            content.addView(button("‹ Все чаты") { loadChats() })
            val scroll = ScrollView(this)
            val messages = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            val array = result?.optJSONArray("messages") ?: JSONArray()
            if (array.length() == 0) messages.addView(label("Сообщений пока нет.", 14f))
            for (i in 0 until array.length()) {
                val m = array.optJSONObject(i) ?: continue
                val who = m.optString("senderName", "Пользователь")
                val text = m.optString("text")
                messages.addView(label("$who\n$text", 15f).apply {
                    setBackgroundColor(panel)
                    val lp = LinearLayout.LayoutParams(-1, -2)
                    lp.bottomMargin = dp(8)
                    layoutParams = lp
                })
            }
            scroll.addView(messages)
            content.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))

            val composer = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(8), 0, 0)
            }
            val messageInput = EditText(this).apply {
                hint = "Сообщение"
                setTextColor(white)
                setHintTextColor(muted)
                textSize = 16f
                minHeight = dp(48)
                maxLines = 4
                setPadding(dp(12), dp(8), dp(12), dp(8))
                setBackgroundColor(panel)
                layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { rightMargin = dp(8) }
            }
            val send = Button(this).apply {
                text = "➤"
                contentDescription = "Отправить сообщение"
                isAllCaps = false
                setTextColor(white)
                setBackgroundColor(accent)
                layoutParams = LinearLayout.LayoutParams(dp(64), dp(52))
            }
            val sendStatus = label("", 12f).apply { setTextColor(muted) }
            fun sendMessage() {
                val cleanText = messageInput.text.toString().trim()
                if (cleanText.isEmpty()) return
                val activeSocket = socket
                if (activeSocket == null || !activeSocket.connected()) {
                    sendStatus.text = "Нет соединения. Переподключаемся…"
                    socket?.connect()
                    return
                }
                send.isEnabled = false
                activeSocket.emit("message:send", JSONObject().put("chatId", id).put("text", cleanText))
                messageInput.text.clear()
                sendStatus.text = "Отправлено"
                send.isEnabled = true
            }
            send.setOnClickListener { sendMessage() }
            messageInput.setOnEditorActionListener { _, actionId, event ->
                if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_SEND ||
                    (event != null && event.keyCode == android.view.KeyEvent.KEYCODE_ENTER && event.action == android.view.KeyEvent.ACTION_DOWN)) {
                    sendMessage()
                    true
                } else false
            }
            composer.addView(messageInput)
            composer.addView(send)
            content.addView(composer)
            content.addView(sendStatus)
        }
    }

    private fun request(method: String, path: String, body: JSONObject?, auth: String?, done: (JSONObject?, String?) -> Unit) {
        thread {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = 15000
                    readTimeout = 15000
                    setRequestProperty("Accept", "application/json")
                    if (auth != null) setRequestProperty("Authorization", "Bearer $auth")
                    if (body != null) {
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json; charset=utf-8")
                        outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                    }
                }
                val code = connection.responseCode
                val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
                val json = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
                if (code !in 200..299) throw Exception(json.optString("error", "Ошибка сервера ($code)"))
                runOnUiThread { done(json, null) }
            } catch (e: Exception) {
                runOnUiThread { done(null, e.message ?: "Не удалось подключиться к серверу") }
            } finally { connection?.disconnect() }
        }
    }
}
