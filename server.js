const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { state, save, init } = require('./db');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'please-change-this-secret-' + Math.random();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get(['/register', '/cananr'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get(['/login', '/cananl', '/home', '/settings'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/cp', (req, res) => {
  res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Настройка профиля — Nevogram</title><link rel="stylesheet" href="/style.css"><style>
.cp-avatar{width:124px;height:124px;border-radius:50%;background:#202b38;border:2px solid #344457;color:#d9e5f2;font-size:42px;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;cursor:pointer;overflow:hidden}.cp-avatar img{width:100%;height:100%;object-fit:cover}.cp-hint{text-align:center;color:#9eafc2;font-size:14px;margin-bottom:22px}.cp-label{display:block;text-align:left;margin:12px 0 6px;color:#d9e5f2}
</style></head><body><main class="auth-screen"><section class="auth-card"><div class="auth-logo">✈️</div><h1>Настройка профиля</h1><p class="auth-sub">Добавь информацию о себе</p>
<button type="button" id="avatarButton" class="cp-avatar" aria-label="Добавить фотографию">＋</button><p class="cp-hint">Нажми на круг, чтобы добавить аватар</p><input id="avatarFile" type="file" accept="image/*" capture="user" hidden>
<label class="cp-label" for="firstName">Имя (обязательно)</label><input id="firstName" type="text" maxlength="40" placeholder="Имя" autocomplete="given-name" required>
<label class="cp-label" for="lastName">Фамилия (необязательно)</label><input id="lastName" type="text" maxlength="40" placeholder="Фамилия" autocomplete="family-name">
<div id="cpError" class="auth-error" role="alert"></div><button type="button" id="saveProfile">Продолжить</button>
</section></main><script>
const token=localStorage.getItem('token');const err=document.getElementById('cpError');const file=document.getElementById('avatarFile');const avatar=document.getElementById('avatarButton');let avatarData='';
if(!token){location.replace('/register');}
avatar.addEventListener('click',()=>file.click());
file.addEventListener('change',()=>{const f=file.files&&file.files[0];if(!f)return;if(!f.type.startsWith('image/')){err.textContent='Выберите изображение.';return;}if(f.size>5*1024*1024){err.textContent='Фото должно быть не больше 5 МБ.';file.value='';return;}const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');const scale=Math.min(1,512/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);avatarData=canvas.toDataURL('image/jpeg',0.82);avatar.innerHTML='<img alt="Аватар профиля" src="'+avatarData+'">';err.textContent='';};img.src=reader.result;};reader.readAsDataURL(f);});
document.getElementById('saveProfile').addEventListener('click',async()=>{err.textContent='';const firstName=document.getElementById('firstName').value.trim();const lastName=document.getElementById('lastName').value.trim();if(firstName.length<1){err.textContent='Введите имя';document.getElementById('firstName').focus();return;}try{const r=await fetch('/api/me/profile',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({firstName,lastName,avatar:avatarData})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Не удалось сохранить профиль');location.href='/home';}catch(e){err.textContent=e.message;}});
</script></body></html>`);
});


// Public profile links use numeric IDs, for example /profile/1.
app.get('/profile/:profileId', (req, res) => {
  const profileId = String(req.params.profileId || '').trim();
  if (!/^\d+$/.test(profileId)) return res.redirect('/login');
  const user = state.users.find((u, index) => String(u.publicId || index + 1) === profileId);
  if (!user) {
    return res.status(404).type('html').send(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Профиль не найден — Nevogram</title><link rel="stylesheet" href="/style.css"><body><main class="auth-screen"><section class="auth-card"><h1>Профиль не найден</h1><p class="auth-sub">Проверьте ссылку или логин пользователя.</p><a href="/login">Вернуться в Nevogram</a></section></main></body></html>`);
  }
  const esc = value => String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const username = esc(user.username || user.email);
  const name = esc(user.name || user.username || user.email);
  const publicId = esc(user.publicId || state.users.indexOf(user) + 1);
  res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0e1621"><title>${name} — Nevogram</title><link rel="stylesheet" href="/style.css"></head><body><main class="auth-screen"><section class="auth-card"><div class="auth-logo">✈️</div><h1>${name}</h1><p class="auth-sub">ID: ${publicId} · @${username}</p><p>Профиль пользователя Nevogram</p><a href="/login">Войти в Nevogram</a></section></main></body></html>`);
});

app.get('/admin', (req, res) => {
  res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0e1621"><title>Админ-панель — Nevogram</title><link rel="stylesheet" href="/style.css"></head><body><main class="auth-screen"><section class="auth-card" style="max-width:680px"><div class="auth-logo">✈️</div><h1>Nevogram Admin</h1><p class="auth-sub">Управление бета-приглашениями и пользователями</p><form id="adminLogin"><input id="adminPassword" type="password" placeholder="Пароль администратора" autocomplete="current-password" required><button>Войти</button></form><div id="adminError" class="auth-error"></div><section id="adminPanel" hidden><button id="createInvite" type="button">Создать бета-код</button><p id="newInvite"></p><h2>Приглашения</h2><div id="invites"></div><h2>Пользователи</h2><div id="users"></div></section><p class="register-hint"><a href="/home">Открыть мессенджер</a></p></section></main><script>
let adminToken= sessionStorage.getItem('nevogramAdminToken')||'';
const err=document.getElementById('adminError');
async function call(path,method='GET'){const r=await fetch('/api/admin'+path,{method,headers:{'Content-Type':'application/json',...(adminToken?{Authorization:'Bearer '+adminToken}:{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Ошибка запроса');return d;}
async function refresh(){const [i,u]=await Promise.all([call('/invites'),call('/users')]);document.getElementById('invites').innerHTML=i.invites.map(v=>'<p>'+(v.used?'':'<button type="button" data-delete-invite="'+v.id+'" style="margin-right:8px;background:#fff;color:#d11;border:1px solid #d11">Удалить</button>')+v.codePreview+' · '+(v.used?'использован':'не использован')+'</p>').join('')||'<p>Пока нет кодов</p>';document.querySelectorAll('[data-delete-invite]').forEach(btn=>btn.addEventListener('click',async()=>{if(btn.dataset.confirm!=='yes'){btn.dataset.confirm='yes';btn.textContent='точно?';btn.style.background='#fff';btn.style.color='#d11';btn.style.border='1px solid #d11';return;}try{await call('/invites/'+encodeURIComponent(btn.dataset.deleteInvite),'DELETE');await refresh();}catch(e){err.textContent=e.message;}}));document.getElementById('users').innerHTML=u.users.map(v=>'<p>@'+String(v.name||v.email).replace(/[&<>"]/g,'')+'</p>').join('')||'<p>Пока нет пользователей</p>';}
document.getElementById('adminLogin').addEventListener('submit',async e=>{e.preventDefault();err.textContent='';try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('adminPassword').value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка входа');adminToken=d.token;sessionStorage.setItem('nevogramAdminToken',adminToken);document.getElementById('adminPanel').hidden=false;document.getElementById('adminPassword').value='';await refresh();}catch(e){err.textContent=e.message;}});
document.getElementById('createInvite').addEventListener('click',async()=>{try{const d=await call('/invites','POST');document.getElementById('newInvite').textContent='Новый код (сохраните сейчас, он показывается один раз): '+d.code;await refresh();}catch(e){err.textContent=e.message;}});
if(adminToken){document.getElementById('adminPanel').hidden=false;refresh().catch(e=>{sessionStorage.removeItem('nevogramAdminToken');adminToken='';err.textContent=e.message;document.getElementById('adminPanel').hidden=true;});}
</script></body></html>`);
});

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
  return { id: u.id, publicId: u.publicId || state.users.indexOf(u) + 1, username: u.username || u.email, email: u.username || u.email, name: u.name, twoFactorEnabled: Boolean(u.twoFactorHash) };
}

// ---------- Регистрация по инвайту и вход по логину/паролю ----------
// Пароли и секреты 2FA хранятся только в виде bcrypt-хешей.
app.post('/api/auth/login', async (req, res) => {
  const username = String((req.body || {}).username || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const twoFactorCode = String((req.body || {}).twoFactorCode || '').trim();
  if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
  const user = state.users.find(u => (u.username || u.email || '').toLowerCase() === username);
  if (!user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль. Старые аккаунты нужно создать заново по инвайту.' });
  }
  if (user.twoFactorHash) {
    if (!twoFactorCode) return res.status(200).json({ requiresTwoFactor: true });
    if (!bcrypt.compareSync(twoFactorCode, user.twoFactorHash)) return res.status(401).json({ error: 'Неверный секретный код двухфакторной защиты' });
  }
  res.json({ token: sign({ userId: user.id }), user: publicUser(user) });
});

app.post('/api/register', async (req, res) => {
  const username = String((req.body || {}).username || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const code = String((req.body || {}).inviteCode || '').trim();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Логин: 3–24 символа, только латинские буквы, цифры и _' });
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов и не длиннее 72 байт' });
  if (!code) return res.status(400).json({ error: 'Введите бета-код приглашения' });
  if (state.users.some(u => (u.username || u.email || '').toLowerCase() === username)) return res.status(409).json({ error: 'Этот логин уже занят' });
  const invite = state.invites.find(inv => !inv.used && bcrypt.compareSync(code, inv.codeHash));
  if (!invite) return res.status(401).json({ error: 'Бета-код недействителен или уже использован' });
  const nextPublicId = state.users.reduce((max, u, index) => Math.max(max, Number(u.publicId) || index + 1), 0) + 1;
  const newUser = { id: nanoid(), publicId: nextPublicId, username, email: username, passwordHash: bcrypt.hashSync(password, 12), name: username, firstName: '', lastName: '', avatar: '', createdAt: Date.now(), twoFactorHash: null };
  state.users.push(newUser);
  invite.used = true;
  invite.usedByUserId = newUser.id;
  save();
  res.json({ ok: true, token: sign({ userId: newUser.id }), user: publicUser(newUser) });
});

app.put('/api/me/security', authMiddleware, (req, res) => {
  const password = String((req.body || {}).password || '');
  const secretCode = String((req.body || {}).secretCode || '').trim();
  const enabled = Boolean((req.body || {}).enabled);
  if (!req.user.passwordHash || !bcrypt.compareSync(password, req.user.passwordHash)) return res.status(401).json({ error: 'Для изменения защиты введите текущий пароль' });
  if (enabled) {
    if (!/^\d{6,12}$/.test(secretCode)) return res.status(400).json({ error: 'Секретный код должен содержать от 6 до 12 цифр' });
    req.user.twoFactorHash = bcrypt.hashSync(secretCode, 12);
  } else {
    req.user.twoFactorHash = null;
  }
  save();
  res.json({ ok: true, enabled: Boolean(req.user.twoFactorHash) });
});



app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.put('/api/me/profile', authMiddleware, (req, res) => {
  const firstName = String((req.body || {}).firstName || '').trim();
  const lastName = String((req.body || {}).lastName || '').trim();
  const avatar = String((req.body || {}).avatar || '');
  if (!firstName) return res.status(400).json({ error: 'Введите имя' });
  if (firstName.length > 40 || lastName.length > 40) return res.status(400).json({ error: 'Имя и фамилия должны быть не длиннее 40 символов' });
  if (avatar && (!avatar.startsWith('data:image/jpeg;base64,') || avatar.length > 1500000)) return res.status(400).json({ error: 'Фото не подходит или слишком большое' });
  req.user.firstName = firstName;
  req.user.lastName = lastName;
  req.user.name = [firstName, lastName].filter(Boolean).join(' ');
  if (avatar) req.user.avatar = avatar;
  save();
  res.json({ ok: true, user: publicUser(req.user) });
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
    unread,
    ...(chat.type === 'channel' ? { username: chat.username || null, description: chat.description || '', isPublic: Boolean(chat.isPublic), ownerId: chat.ownerId, subscriberCount: chat.memberIds.length, canPost: chat.ownerId === userId || (chat.adminIds || []).includes(userId) } : {})
  };
}

app.get('/api/search/users', authMiddleware, (req, res) => {
  const q = String(req.query.q || '').trim().replace(/^@/, '').toLowerCase();
  if (!q) return res.json({ users: [] });
  const users = state.users.filter(u => u.id !== req.user.id && (u.username || u.email || '').toLowerCase().includes(q))
    .slice(0, 20).map(u => ({ id: u.id, username: u.username || u.email, name: u.name || u.username || u.email, publicId: u.publicId }));
  res.json({ users });
});
app.post('/api/chats/:id/read', authMiddleware, (req, res) => {
  const chat = state.chats.find(c => c.id === req.params.id && c.memberIds.includes(req.user.id));
  if (!chat) return res.status(404).json({ error: 'Чат не найден' });
  state.messages.forEach(m => { if (m.chatId === chat.id && !m.readBy.includes(req.user.id)) m.readBy.push(req.user.id); });
  save();
  io.to(chat.id).emit('read', { chatId: chat.id, userId: req.user.id });
  res.json({ ok: true });
});
app.get('/api/chats', authMiddleware, (req, res) => {
  const myChats = state.chats.filter(c => c.memberIds.includes(req.user.id) && (c.type !== 'direct' || state.messages.some(m => m.chatId === c.id)));
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
    // Keep the new direct chat hidden until its first message is sent.
    io.in('user:' + req.user.id).socketsJoin(chat.id);
    io.in('user:' + other.id).socketsJoin(chat.id);
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

app.delete('/api/chats/:id', authMiddleware, (req, res) => {
  const chat = state.chats.find(c => c.id === req.params.id && c.memberIds.includes(req.user.id));
  if (!chat || chat.type !== 'direct') return res.status(404).json({ error: 'Личный чат не найден' });
  const otherId = chat.memberIds.find(id => id !== req.user.id);
  if (state.users.some(u => u.id === otherId)) {
    return res.status(400).json({ error: 'Можно убрать только чат с удалённым аккаунтом' });
  }
  chat.memberIds = chat.memberIds.filter(id => id !== req.user.id);
  io.in('user:' + req.user.id).socketsLeave(chat.id);
  save();
  res.json({ ok: true });
});

app.get('/api/chats/:id/messages', authMiddleware, (req, res) => {
  const chat = state.chats.find(c => c.id === req.params.id);
  if (!chat || !chat.memberIds.includes(req.user.id)) return res.status(403).json({ error: 'Нет доступа к этому чату' });
  const msgs = state.messages.filter(m => m.chatId === chat.id).map(m => ({
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    senderName: m.senderId === 'nevogram-ai' ? 'Nevogram AI' : ((state.users.find(u => u.id === m.senderId) || {}).name || '???'),
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


/* ---------- Каналы: публичные/приватные, подписка и публикации ---------- */
function channelUsernameTaken(username, exceptId) {
  return state.chats.some(c => c.type === 'channel' && c.id !== exceptId && c.username === username);
}
function channelPublicInfo(chat, userId) {
  return {
    id: chat.id, title: chat.name, username: chat.username || null,
    description: chat.description || '', isPublic: Boolean(chat.isPublic),
    ownerId: chat.ownerId, subscriberCount: chat.memberIds.length,
    isMember: chat.memberIds.includes(userId),
    canPost: chat.ownerId === userId || (chat.adminIds || []).includes(userId),
    inviteCode: chat.isPublic ? null : (chat.ownerId === userId ? chat.inviteCode : null)
  };
}
app.post('/api/channels', authMiddleware, (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim().slice(0, 80);
  const description = String(body.description || '').trim().slice(0, 500);
  const isPublic = body.visibility !== 'private';
  const username = String(body.username || '').trim().replace(/^@/, '').toLowerCase();
  if (!name) return res.status(400).json({ error: 'Укажите название канала' });
  if (isPublic && !/^[a-z0-9_]{5,32}$/.test(username)) return res.status(400).json({ error: 'Публичный @username: 5–32 символа, латиница, цифры и _' });
  if (isPublic && channelUsernameTaken(username)) return res.status(409).json({ error: 'Этот @username уже занят' });
  const chat = {
    id: nanoid(), type: 'channel', name, description, username: isPublic ? username : null,
    isPublic, inviteCode: nanoid(16), ownerId: req.user.id, adminIds: [], memberIds: [req.user.id],
    createdAt: Date.now()
  };
  state.chats.push(chat); save();
  io.in('user:' + req.user.id).socketsJoin(chat.id);
  res.status(201).json({ channel: channelPublicInfo(chat, req.user.id), chat: chatPreview(chat, req.user.id) });
});
app.get('/api/channels/search', authMiddleware, (req, res) => {
  const q = String(req.query.q || '').trim().replace(/^@/, '').toLowerCase();
  const channels = state.chats.filter(c => c.type === 'channel' && c.isPublic &&
    (!q || c.name.toLowerCase().includes(q) || (c.username || '').includes(q)))
    .slice(0, 30).map(c => ({ id:c.id, title:c.name, username:c.username, description:c.description || '',
      subscriberCount:c.memberIds.length, isMember:c.memberIds.includes(req.user.id) }));
  res.json({ channels });
});
app.get('/api/channels/:id', authMiddleware, (req, res) => {
  const chat = state.chats.find(c => c.id === req.params.id && c.type === 'channel');
  if (!chat) return res.status(404).json({ error: 'Канал не найден' });
  if (!chat.isPublic && !chat.memberIds.includes(req.user.id) && chat.ownerId !== req.user.id)
    return res.status(404).json({ error: 'Приватный канал доступен только по приглашению' });
  res.json({ channel: channelPublicInfo(chat, req.user.id), chat: chatPreview(chat, req.user.id) });
});
app.post('/api/channels/join', authMiddleware, (req, res) => {
  const body = req.body || {};
  const key = String(body.id || '');
  const code = String(body.inviteCode || '');
  const chat = state.chats.find(c => c.type === 'channel' && (c.id === key || c.username === String(body.username || '').replace(/^@/, '').toLowerCase()));
  if (!chat) return res.status(404).json({ error: 'Канал не найден' });
  if (!chat.isPublic && code !== chat.inviteCode && chat.ownerId !== req.user.id && !chat.memberIds.includes(req.user.id))
    return res.status(403).json({ error: 'Для приватного канала нужна действующая ссылка-приглашение' });
  if (!chat.memberIds.includes(req.user.id)) { chat.memberIds.push(req.user.id); save(); }
  io.in('user:' + req.user.id).socketsJoin(chat.id);
  io.to('user:' + chat.ownerId).emit('chat:new');
  res.json({ channel: channelPublicInfo(chat, req.user.id), chat: chatPreview(chat, req.user.id) });
});
app.post('/api/channels/:id/leave', authMiddleware, (req, res) => {
  const chat = state.chats.find(c => c.id === req.params.id && c.type === 'channel');
  if (!chat) return res.status(404).json({ error: 'Канал не найден' });
  if (chat.ownerId === req.user.id) return res.status(400).json({ error: 'Владелец не может покинуть канал — передайте владение или удалите его' });
  chat.memberIds = chat.memberIds.filter(id => id !== req.user.id);
  save();
  for (const socket of io.sockets.sockets.values()) if (socket.userId === req.user.id) socket.leave(chat.id);
  res.json({ ok: true });
});
app.get('/api/channels/:id/invite', authMiddleware, (req, res) => {
  const chat = state.chats.find(c => c.id === req.params.id && c.type === 'channel');
  if (!chat || chat.ownerId !== req.user.id) return res.status(403).json({ error: 'Только владелец может получить ссылку-приглашение' });
  res.json({ inviteCode: chat.inviteCode, link: locationForInvite(chat) });
});
function locationForInvite(chat) { return chat.isPublic ? '/?channel=' + encodeURIComponent(chat.username) : '/?invite=' + encodeURIComponent(chat.id + '.' + chat.inviteCode); }
app.patch('/api/channels/:id', authMiddleware, (req, res) => {
  const chat = state.chats.find(c => c.id === req.params.id && c.type === 'channel');
  if (!chat || chat.ownerId !== req.user.id) return res.status(403).json({ error: 'Только владелец может менять настройки канала' });
  const body = req.body || {};
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Название не может быть пустым' });
    chat.name = name.slice(0, 80);
  }
  if (body.description !== undefined) chat.description = String(body.description || '').trim().slice(0, 500);
  save();
  res.json({ channel: channelPublicInfo(chat, req.user.id) });
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

app.delete('/api/admin/invites/:id', adminMiddleware, (req, res) => {
  const index = state.invites.findIndex(inv => inv.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Приглашение не найдено' });
  if (state.invites[index].used) return res.status(409).json({ error: 'Использованный код удалить нельзя' });
  state.invites.splice(index, 1);
  save();
  res.json({ ok: true });
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
  socket.join('user:' + socket.userId);

  const myChats = state.chats.filter(c => c.memberIds.includes(socket.userId));
  myChats.forEach(c => socket.join(c.id));

  socket.broadcast.emit('presence', { userId: socket.userId, online: true });

  socket.on('message:send', ({ chatId, text }) => {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat || !chat.memberIds.includes(socket.userId)) return;
    if (chat.type === 'channel' && chat.ownerId !== socket.userId && !(chat.adminIds || []).includes(socket.userId)) return;
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
    const isFirstMessage = !state.messages.some(m => m.chatId === chatId);
    state.messages.push(msg);
    save();
    const senderName = (state.users.find(u => u.id === socket.userId) || {}).name;
    io.to(chatId).emit('message:new', { ...msg, senderName });

    if (isFirstMessage && chat.type === 'direct') {
      chat.memberIds.forEach(userId => io.to('user:' + userId).emit('chat:new'));
    }
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

init().then(() => {
  server.listen(PORT, () => console.log(`Мессенджер запущен на порту ${PORT}`));
}).catch(err => {
  console.error('Не удалось инициализировать хранилище:', err);
  process.exit(1);
});
