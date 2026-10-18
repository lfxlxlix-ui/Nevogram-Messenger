package com.nevogram.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

private val Night = Color(0xFF080D16)
private val Panel = Color(0xFF131E2D)
private val Muted = Color(0xFF9AAEC8)
private val Accent = Color(0xFF1685FF)
private const val API = "https://nevogram-messenger.onrender.com"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { NevogramApp() }
    }
}

@Composable
private fun NevogramApp() {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var token by remember { mutableStateOf<String?>(null) }
    var displayName by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var chats by remember { mutableStateOf<List<ChatItem>>(emptyList()) }

    MaterialTheme {
        Surface(Modifier.fillMaxSize(), color = Night) {
            if (token == null) {
                Column(
                    Modifier.fillMaxSize().padding(horizontal = 28.dp),
                    verticalArrangement = Arrangement.Center
                ) {
                    LogoMark(Modifier.size(76.dp))
                    Spacer(Modifier.height(24.dp))
                    Text("Nevogram", color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Bold)
                    Text("Твои разговоры — в одном месте", color = Muted, fontSize = 15.sp)
                    Spacer(Modifier.height(32.dp))
                    OutlinedTextField(
                        value = username, onValueChange = { username = it },
                        modifier = Modifier.fillMaxWidth(), label = { Text("Логин", color = Muted) },
                        singleLine = true
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = password, onValueChange = { password = it },
                        modifier = Modifier.fillMaxWidth(), label = { Text("Пароль", color = Muted) },
                        visualTransformation = PasswordVisualTransformation(), singleLine = true
                    )
                    if (error.isNotBlank()) {
                        Spacer(Modifier.height(10.dp))
                        Text(error, color = Color(0xFFFF7777), fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(18.dp))
                    Button(
                        onClick = {
                            if (username.isBlank() || password.isBlank()) {
                                error = "Введи логин и пароль"
                            } else {
                                loading = true; error = ""
                                // Network work runs off the UI thread.
                                kotlinx.coroutines.MainScope().launchLogin(
                                    username.trim(), password,
                                    onSuccess = { t, name -> token = t; displayName = name; loading = false },
                                    onError = { message -> error = message; loading = false }
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        enabled = !loading,
                        colors = ButtonDefaults.buttonColors(containerColor = Accent),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        if (loading) CircularProgressIndicator(Modifier.size(22.dp), color = Color.White)
                        else Text("Войти", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(10.dp))
                    Text("Вход использует существующий аккаунт Nevogram.", color = Muted, fontSize = 12.sp)
                }
            } else {
                LaunchedEffect(token) {
                    loading = true
                    val result = withContext(Dispatchers.IO) { apiGet("/api/chats", token!!) }
                    chats = result.optJSONArray("chats")?.let { arr ->
                        (0 until arr.length()).map { i ->
                            val item = arr.getJSONObject(i)
                            ChatItem(
                                id = item.optString("id"),
                                title = item.optString("name").ifBlank { item.optString("title").ifBlank { "Чат" } },
                                preview = item.optJSONObject("lastMessage")?.optString("text").orEmpty()
                            )
                        }
                    }.orEmpty()
                    loading = false
                }
                Column(Modifier.fillMaxSize().padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LogoMark(Modifier.size(44.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Nevogram", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Bold)
                            Text(if (displayName.isBlank()) "Сообщения" else "Привет, $displayName", color = Muted, fontSize = 13.sp)
                        }
                        TextButton(onClick = { token = null; chats = emptyList() }) { Text("Выйти", color = Muted) }
                    }
                    Spacer(Modifier.height(24.dp))
                    Text("Твои чаты", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(12.dp))
                    when {
                        loading -> CircularProgressIndicator(color = Accent)
                        chats.isEmpty() -> Text("Пока нет чатов. Обнови список позже — подключение чатов продолжается.", color = Muted)
                        else -> chats.forEach { chat ->
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 5.dp)
                                    .background(Panel, RoundedCornerShape(18.dp)).padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(Modifier.size(46.dp).background(
                                    Brush.linearGradient(listOf(Color(0xFF00E5FF), Color(0xFF633CFF), Color(0xFFFF55B8))),
                                    CircleShape
                                ), contentAlignment = Alignment.Center) {
                                    Text(chat.title.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                                }
                                Spacer(Modifier.width(12.dp))
                                Column {
                                    Text(chat.title, color = Color.White, fontWeight = FontWeight.SemiBold)
                                    Text(chat.preview.ifBlank { "Начни разговор" }, color = Muted, fontSize = 13.sp, maxLines = 1)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class ChatItem(val id: String, val title: String, val preview: String)

@Composable
private fun LogoMark(modifier: Modifier = Modifier) {
    Box(
        modifier.background(
            Brush.linearGradient(listOf(Color(0xFF00E5FF), Color(0xFF075BFF), Color(0xFFE500FF), Color(0xFFFFB52E))),
            RoundedCornerShape(24.dp)
        ),
        contentAlignment = Alignment.Center
    ) {
        Text("➤", color = Color.White, fontSize = 38.sp, fontWeight = FontWeight.Black)
    }
}

private fun kotlinx.coroutines.CoroutineScope.launchLogin(
    username: String,
    password: String,
    onSuccess: (String, String) -> Unit,
    onError: (String) -> Unit
) {
    launch(Dispatchers.IO) {
        try {
            val body = JSONObject().put("username", username).put("password", password)
            val response = apiPost("/api/auth/login", body)
            val authToken = response.optString("token")
            if (authToken.isBlank()) throw IllegalStateException(
                if (response.optBoolean("requiresTwoFactor")) "Для аккаунта включена 2FA — поддержка кода появится в следующей сборке."
                else response.optString("error", "Не удалось войти")
            )
            val name = response.optJSONObject("user")?.optString("name").orEmpty()
            kotlinx.coroutines.withContext(Dispatchers.Main) { onSuccess(authToken, name) }
        } catch (e: Exception) {
            kotlinx.coroutines.withContext(Dispatchers.Main) { onError(e.message ?: "Ошибка подключения") }
        }
    }
}

private fun apiPost(path: String, body: JSONObject): JSONObject {
    val connection = (URL(API + path).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15000
        readTimeout = 20000
        doOutput = true
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
    }
    connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
    val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
    val text = stream.bufferedReader().use { it.readText() }
    if (connection.responseCode !in 200..299) throw IllegalStateException(JSONObject(text).optString("error", "Ошибка сервера"))
    return JSONObject(text)
}

private fun apiGet(path: String, token: String): JSONObject {
    val connection = (URL(API + path).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 15000
        readTimeout = 20000
        setRequestProperty("Authorization", "Bearer $token")
    }
    val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
    val text = stream.bufferedReader().use { it.readText() }
    if (connection.responseCode !in 200..299) throw IllegalStateException("Не удалось загрузить данные")
    return JSONObject(text)
}
