const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { state, save } = require('./db');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'please-change-this-secret-' + Math.random();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));

const server = http.createServer(app);
const io = new Server(server);

// ---------- Подпись токенов (без внешних библиотек, на встроенном crypto) ----------
function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const data = verify(token);
  if (!data || !data.userId) return res.status(401).json({ error: 'Не авторизован' });
  const user = state.users.find(u => u.id === data.userId);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  req.user = user;
  next();
}

function adminMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const data = verify(token);
  if (!data || data.admin !== true) return res.status(401).json({ error: 'Нет доступа' });
  next();
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name };
}

// ---------- Вход по почте с одноразовым кодом ----------
const nodemailer = require('nodemailer');
const loginCodes = new Map();
function mailTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}
async function sendLoginCode(email, code) {
  const transport = mailTransport();
  if (!transport) throw new Error('Отправка почты ещё не настроена. Администратор должен добавить SMTP-настройки в Render.');
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Код входа в Nevogram',
    text: 'Ваш код входа в Nevogram: ' + code + '\nКод действует 10 минут. Если вы не запрашивали вход, просто проигнорируйте письмо.',
    html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px"><h2>Nevogram</h2><p>Ваш код входа:</p><div style="font-size:32px;letter-spacing:8px;font-weight:bold;padding:18px;background:#f1f4f8;border-radius:12px;text-align:center">' + code + '</div><p>Код действует 10 минут. Никому не сообщайте его.</p></div>'
  });
}
function makeSixDigitCode() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }

app.post('/api/auth/request-code', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Введите корректную почту' });
  const user = state.users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'Аккаунт с такой почтой не найден. Зарегистрируйтесь по приглашению.' });
  const previous = loginCodes.get(email);
  if (previous && Date.now() - previous.sentAt < 60_000) return res.status(429).json({ error: 'Подождите минуту перед повторной отправкой кода' });
  const code = makeSixDigitCode();
  try {
    await sendLoginCode(email, code);
    loginCodes.set(email, { hash: crypto.createHash('sha256').update(code).digest('hex'), expiresAt: Date.now() + 10 * 60_000, sentAt: Date.now(), attempts: 0, userId: user.id });
    res.json({ ok: true, message: 'Код отправлен на почту' });
  } catch (err) {
    console.error('Email send failed:', err.message);
    res.status(503).json({ error: err.message || 'Не удалось отправить письмо' });
  }
});

app.post('/api/auth/verify-code', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const code = String((req.body || {}).code || '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Введите код из 6 цифр' });
  const pending = loginCodes.get(email);
  if (!pending || pending.expiresAt < Date.now()) { loginCodes.delete(email); return res.status(401).json({ error: 'Код истёк или не запрашивался. Запросите новый.' }); }
  pending.attempts++;
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  if (pending.attempts > 5) { loginCodes.delete(email); return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.' }); }
  if (hash !== pending.hash) return res.status(401).json({ error: 'Неверный код' });
  const user = state.users.find(u => u.id === pending.userId && u.email === email);
  loginCodes.delete(email);
  if (!user) return res.status(401).json({ error: 'Аккаунт не найден' });
  res.json({ token: sign({ userId: user.id }), user: publicUser(user) });
});

app.post('/api/register', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const code = String((req.body || {}).inviteCode || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Введите корректную почту' });
  if (!code) return res.status(400).json({ error: 'Введите код приглашения' });
  if (state.users.some(u => u.email === email)) return res.status(409).json({ error: 'Аккаунт с такой почтой уже существует. Войдите.' });
  const invite = state.invites.find(inv => !inv.used && bcrypt.compareSync(code, inv.codeHash));
  if (!invite) return res.status(401).json({ error: 'Код приглашения недействителен или уже использован' });
  const newUser = { id: nanoid(), email, codeHash: invite.codeHash, name: email.split('@')[0], createdAt: Date.now() };
  const loginCode = makeSixDigitCode();
  try {
    // Сначала отправляем письмо: при ошибке почты аккаунт и инвайт не расходуются.
    await sendLoginCode(email, loginCode);
    state.users.push(newUser);
    invite.used = true;
    invite.usedByUserId = newUser.id;
    save();
    loginCodes.set(email, { hash: crypto.createHash('sha256').update(loginCode).digest('hex'), expiresAt: Date.now() + 10 * 60_000, sentAt: Date.now(), attempts: 0, userId: newUser.id });
    res.json({ ok: true, message: 'Аккаунт создан. Код входа отправлен на почту.' });
  } catch (err) {
    console.error('Registration email failed:', err.message);
    res.status(503).json({ error: err.message || 'Не удалось отправить письмо. Проверьте почтовые настройки Render.' });
  }
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.patch('/api/me', authMiddleware, (req, res) => {
  const { name } = req.body || {};
  if (name && String(name).trim()) {
    req.user.name = String(name).trim().slice(0, 50);
    save();
  }
  res.json({ user: publicUser(req.user) });
});

// ---------- Чаты ----------
function chatPreview(chat, userId) {
  const msgs = state.messages.filter(m => m.chatId === chat.id);
  const last = msgs[msgs.length - 1] || null;
  const unread = msgs.filter(m => m.senderId !== userId && !m.readBy.includes(userId)).length;
  let title = chat.name;
  if (chat.type === 'direct') {
    const otherId = chat.memberIds.find(id => id !== userId);
    const other = state.users.find(u => u.id === otherId);
    title = other ? other.name : 'Удалённый пользователь';
  }
  return {
    id: chat.id,
    type: chat.type,
    title,
    lastMessage: last ? { text: last.text, createdAt: last.createdAt, senderId: last.senderId } : null,
    unread
  };
}

app.get('/api/chats', authMiddleware, (req, res) => {
  const myChats = state.chats.filter(c => c.memberIds.includes(req.user.id));
  const list = myChats.map(c => chatPreview(c, req.user.id));
  list.sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
  res.json({ chats: list });
});

app.post('/api/chats/direct', authMiddleware, (req, res) => {
  const { email } = req.body || {};
  const normEmail = String(email || '').trim().toLowerCase();
  const other = state.users.find(u => u.email === normEmail);
  if (!other) return res.status(404).json({ error: 'Такой пользователь ещё не зарегистрирован в мессенджере' });
  if (other.id === req.user.id) return res.status(400).json({ error: 'Нельзя начать чат с самим собой' });

  let chat = state.chats.find(c => c.type === 'direct' &&
    c.memberIds.includes(req.user.id) && c.memberIds.includes(other.id));
  if (!chat) {
    chat = { id: nanoid(), type: 'direct', name: null, memberIds: [req.user.id, other.id], createdAt: Date.now() };
    state.chats.push(chat);
    save();
  }
  res.json({ chat: chatPreview(chat, req.user.id) });
});

app.post('/api/chats/group', authMiddleware, (req, res) => {
  const { name, emails } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите название группы' });
  const memberIds = new Set([req.user.id]);
  (emails || []).forEach(e => {
    const u = state.users.find(u => u.email === String(e).trim().toLowerCase());
    if (u) memberIds.add(u.id);
  });
  const chat = { id: nanoid(), type: 'group', name: String(name).trim().slice(0, 80), memberIds: [...memberIds], createdAt: Date.now() };
  state.chats.push(chat);
  save();
  res.json({ chat: chatPreview(chat, req.user.id) });
});

app.get('/api/chats/:id/messages', authMiddleware, (req, res) => {
  const chat = state.chats.find(c => c.id === req.params.id);
  if (!chat || !chat.memberIds.includes(req.user.id)) return res.status(403).json({ error: 'Нет доступа к этому чату' });
  const msgs = state.messages.filter(m => m.chatId === chat.id).map(m => ({
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    senderName: (state.users.find(u => u.id === m.senderId) || {}).name || '???',
    text: m.text,
    createdAt: m.createdAt,
    read: m.readBy.length > 1 // прочитано кем-то кроме автора
  }));
  res.json({ messages: msgs, chat: chatPreview(chat, req.user.id) });
});

app.get('/api/chats/:id/members', authMiddleware, (req, res) => {
  const chat = state.chats.find(c => c.id === req.params.id);
  if (!chat || !chat.memberIds.includes(req.user.id)) return res.status(403).json({ error: 'Нет доступа' });
  res.json({ members: chat.memberIds.map(id => publicUser(state.users.find(u => u.id === id))) });
});

// ---------- Админка: инвайт-коды и пользователи ----------
// Админ НЕ имеет доступа к переписке людей — только управляет кодами приглашений и видит список аккаунтов.
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Неверный пароль администратора' });
  res.json({ token: sign({ admin: true }) });
});

app.post('/api/admin/invites', adminMiddleware, (req, res) => {
  const rawCode = nanoid(8).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const codeHash = bcrypt.hashSync(rawCode, 10);
  const invite = { id: nanoid(), codeHash, codePreview: rawCode.slice(0, 2) + '••••', used: false, usedByUserId: null, createdAt: Date.now() };
  state.invites.push(invite);
  save();
  res.json({ code: rawCode, id: invite.id }); // код показывается только один раз
});

app.get('/api/admin/invites', adminMiddleware, (req, res) => {
  const list = state.invites.map(inv => ({
    id: inv.id,
    codePreview: inv.codePreview,
    used: inv.used,
    usedByEmail: inv.usedByUserId ? (state.users.find(u => u.id === inv.usedByUserId) || {}).email : null,
    createdAt: inv.createdAt
  }));
  res.json({ invites: list });
});

app.get('/api/admin/users', adminMiddleware, (req, res) => {
  res.json({ users: state.users.map(u => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt })) });
});

// ---------- WebSocket: обмен сообщениями в реальном времени ----------
const onlineUsers = new Map(); // userId -> Set(socketId)

io.use((socket, next) => {
  const data = verify(socket.handshake.auth?.token);
  if (!data || !data.userId) return next(new Error('unauthorized'));
  const user = state.users.find(u => u.id === data.userId);
  if (!user) return next(new Error('unauthorized'));
  socket.userId = user.id;
  next();
});

io.on('connection', (socket) => {
  if (!onlineUsers.has(socket.userId)) onlineUsers.set(socket.userId, new Set());
  onlineUsers.get(socket.userId).add(socket.id);

  const myChats = state.chats.filter(c => c.memberIds.includes(socket.userId));
  myChats.forEach(c => socket.join(c.id));

  socket.broadcast.emit('presence', { userId: socket.userId, online: true });

  socket.on('message:send', ({ chatId, text }) => {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat || !chat.memberIds.includes(socket.userId)) return;
    const clean = String(text || '').trim().slice(0, 4000);
    if (!clean) return;
    const msg = {
      id: nanoid(),
      chatId,
      senderId: socket.userId,
      text: clean,
      createdAt: Date.now(),
      readBy: [socket.userId]
    };
    state.messages.push(msg);
    save();
    const senderName = (state.users.find(u => u.id === socket.userId) || {}).name;
    io.to(chatId).emit('message:new', { ...msg, senderName });
  });

  socket.on('typing', ({ chatId }) => {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat || !chat.memberIds.includes(socket.userId)) return;
    socket.to(chatId).emit('typing', { chatId, userId: socket.userId });
  });

  socket.on('read', ({ chatId }) => {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat || !chat.memberIds.includes(socket.userId)) return;
    let changed = false;
    state.messages.forEach(m => {
      if (m.chatId === chatId && !m.readBy.includes(socket.userId)) {
        m.readBy.push(socket.userId);
        changed = true;
      }
    });
    if (changed) {
      save();
      io.to(chatId).emit('read', { chatId, userId: socket.userId });
    }
  });

  socket.on('disconnect', () => {
    const set = onlineUsers.get(socket.userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(socket.userId);
        socket.broadcast.emit('presence', { userId: socket.userId, online: false });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Мессенджер запущен на порту ${PORT}`);
});
