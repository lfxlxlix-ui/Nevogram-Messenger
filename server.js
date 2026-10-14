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
const SESSION_SECRET = process.env.SESSION_SECRET || 'nevogram-session-secret-change-in-render-settings';

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get(['/register', '/cananr'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get(['/login', '/cananl', '/home', '/chats'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get(['/cp', '/editprofile'], (req, res) => {
  res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#17212b"><title>Редактировать профиль — Nevogram</title><link rel="stylesheet" href="/style.css"><style>
body{background:#0e1621;color:#eaf2f8}.edit-wrap{width:min(100% - 24px,620px);margin:24px auto}.edit-card{background:#17212b;border:1px solid #263746;border-radius:18px;overflow:hidden;padding-bottom:24px}.edit-head{display:flex;align-items:center;gap:18px;padding:16px 20px;border-bottom:1px solid #263746}.edit-head a{font-size:28px;color:#72b5f8;text-decoration:none}.edit-head h1{font-size:20px;margin:0}.cover{height:180px;background:linear-gradient(135deg,#2b5278,#1c354b);position:relative;background-position:center;background-size:cover}.cover video{width:100%;height:100%;object-fit:cover}.cover-button{position:absolute;right:14px;bottom:14px;background:#0e1621cc;border:1px solid #ffffff55;color:white;border-radius:10px;padding:10px 12px;cursor:pointer}.avatar-row{padding:0 22px;display:flex;align-items:end;gap:16px;margin-top:-52px;position:relative}.avatar{width:112px;height:112px;border-radius:50%;border:4px solid #17212b;background:#34516b;display:flex;align-items:center;justify-content:center;overflow:hidden;color:white;font-size:36px;cursor:pointer;flex-shrink:0}.avatar img{width:100%;height:100%;object-fit:cover}.avatar-note{font-size:13px;color:#9eafc2;margin-bottom:12px}.edit-fields{padding:18px 22px 0}.field{display:block;margin:14px 0}.field span{display:block;color:#a9c1d4;font-size:13px;margin:0 0 7px}.field input{width:100%;box-sizing:border-box;background:#0e1621;border:1px solid #34495b;color:#f5f7fa;border-radius:10px;padding:13px 14px;font-size:16px;outline:none}.field input:focus{border-color:#72b5f8}.username-input{display:flex;align-items:center;background:#0e1621;border:1px solid #34495b;border-radius:10px;padding-left:14px}.username-input b{color:#72b5f8;font-size:16px}.username-input input{border:0;background:transparent}.hint{font-size:12px;color:#91a5b5;margin-top:6px}.birthday-locked{color:#a9c1d4;font-size:13px;margin-top:8px}.save{margin:20px 22px 0;width:calc(100% - 44px);border:0;border-radius:10px;background:#2b7ac4;color:white;font-weight:700;padding:14px;font-size:16px;cursor:pointer}.edit-error{padding:0 22px;color:#ff9c9c;margin-top:10px}.edit-success{padding:0 22px;color:#8bd9a8;margin-top:10px}@media(max-width:480px){.cover{height:145px}.edit-wrap{margin:12px auto}.avatar{width:96px;height:96px}}
</style></head><body><main class="edit-wrap"><section class="edit-card"><header class="edit-head"><a href="/chats" aria-label="Назад">‹</a><h1>Редактировать профиль</h1></header><div id="cover" class="cover"><video id="coverVideo" autoplay muted loop playsinline hidden></video><button class="cover-button" id="coverButton" type="button">Изменить баннер</button></div><input id="coverFile" type="file" accept="image/*,video/*" hidden><div class="avatar-row"><button type="button" class="avatar" id="avatarButton" aria-label="Изменить аватар">＋</button><span class="avatar-note">Нажми на круг, чтобы изменить аватар</span></div><input id="avatarFile" type="file" accept="image/*" hidden><div class="edit-fields"><label class="field"><span>Имя</span><input id="firstName" maxlength="40" autocomplete="given-name" placeholder="Имя" required></label><label class="field"><span>Фамилия (необязательно)</span><input id="lastName" maxlength="40" autocomplete="family-name" placeholder="Фамилия"></label><label class="field"><span>Username</span><div class="username-input"><b>@</b><input id="username" maxlength="32" autocomplete="username" placeholder="username" autocapitalize="none" spellcheck="false"></div><div class="hint">Без @ — символ @ добавится автоматически. Латиница, цифры и _.</div></label><label class="field"><span>Дата рождения</span><input id="birthday" type="date"><div id="birthdayHint" class="birthday-locked">После сохранения дату рождения изменить будет нельзя.</div></label></div><div id="editError" class="edit-error" role="alert"></div><div id="editSuccess" class="edit-success" role="status"></div><button type="button" class="save" id="saveProfile">Сохранить изменения</button></section></main><script>
const token=sessionStorage.getItem('token');if(!token)location.replace('/login');
const $=id=>document.getElementById(id);let avatarData='',coverData='',birthdaySaved=false;
const error=$('editError'),success=$('editSuccess');
function previewFile(file,kind){return new Promise((resolve,reject)=>{if(!file)return resolve('');const isVideo=file.type.startsWith('video/');if(kind==='avatar'&&isVideo)return reject(new Error('Для аватара выберите фото.'));if(kind==='cover'&&!file.type.startsWith('image/')&&!isVideo)return reject(new Error('Выберите фото или видео.'));if(file.size>(isVideo?6:5)*1024*1024)return reject(new Error(isVideo?'Видео должно быть не больше 6 МБ.':'Изображение должно быть не больше 5 МБ.'));if(isVideo){const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Не удалось прочитать файл.'));reader.readAsDataURL(file);return;}const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');const max=kind==='avatar'?512:1400;const scale=Math.min(1,max/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.82));};img.onerror=()=>reject(new Error('Не удалось открыть изображение.'));img.src=reader.result;};reader.onerror=()=>reject(new Error('Не удалось прочитать файл.'));reader.readAsDataURL(file);});}
function showAvatar(src,name){$('avatarButton').innerHTML=src?'<img alt="Аватар" src="'+src+'">':(name||'?').slice(0,1).toUpperCase()||'＋';}
function showCover(src){const v=$('coverVideo');v.pause();v.removeAttribute('src');v.load();v.hidden=true;$('cover').style.backgroundImage='';if(!src)return;if(src.startsWith('data:video/')){v.src=src;v.hidden=false;}else{$('cover').style.backgroundImage='url("'+src+'")';}}
$('avatarButton').addEventListener('click',()=>$('avatarFile').click());$('coverButton').addEventListener('click',()=>$('coverFile').click());
$('avatarFile').addEventListener('change',async()=>{try{avatarData=await previewFile($('avatarFile').files[0],'avatar');showAvatar(avatarData,$('firstName').value);error.textContent='';}catch(e){error.textContent=e.message;}});
$('coverFile').addEventListener('change',async()=>{try{coverData=await previewFile($('coverFile').files[0],'cover');showCover(coverData);error.textContent='';}catch(e){error.textContent=e.message;}});
$('username').addEventListener('input',()=>{$('username').value=$('username').value.replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g,'').toLowerCase();});
async function loadProfile(){try{const r=await fetch('/api/me',{headers:{Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось загрузить профиль');const u=d.user||{};$('firstName').value=u.firstName||((u.name||'').split(' ')[0]||'');$('lastName').value=u.lastName||((u.name||'').split(' ').slice(1).join(' '));$('username').value=(u.username||'').replace(/^@/,'');avatarData=u.avatar||'';coverData=u.banner||'';showAvatar(avatarData,$('firstName').value);showCover(coverData);birthdaySaved=Boolean(u.birthday);$('birthday').value=u.birthday||'';$('birthday').disabled=birthdaySaved;if(birthdaySaved)$('birthdayHint').textContent='Дата рождения уже сохранена и не может быть изменена.';}catch(e){error.textContent=e.message;}}
$('saveProfile').addEventListener('click',async()=>{error.textContent='';success.textContent='';const firstName=$('firstName').value.trim(),lastName=$('lastName').value.trim(),username=$('username').value.trim(),birthday=$('birthday').value;if(!firstName){error.textContent='Введите имя.';return;}if(username&&!/^[a-z0-9_]{3,32}$/.test(username)){error.textContent='Username: 3–32 символа, латиница, цифры и _. ';return;}if(!birthdaySaved&&!birthday){error.textContent='Выберите дату рождения.';return;}try{const r=await fetch('/api/me/profile',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({firstName,lastName,username,birthday,avatar:avatarData,banner:coverData})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Не удалось сохранить профиль');birthdaySaved=Boolean(d.user?.birthday);$('birthday').disabled=birthdaySaved;if(birthdaySaved)$('birthdayHint').textContent='Дата рождения сохранена и больше не может быть изменена.';success.textContent='Изменения сохранены.';setTimeout(()=>{location.href='/profile/'+encodeURIComponent(d.user.publicId||'');},700);}catch(e){error.textContent=e.message;}});
loadProfile();
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
  const avatar = typeof user.avatar === 'string' && user.avatar.startsWith('data:image/') ? user.avatar : '';
  const about = esc(user.bio || user.about || 'Здесь пока ничего нет');
  const verifiedBadge = user.verified ? '<span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:3px 8px;border-radius:999px;background:#1d6fb8;color:#fff;font-size:12px;vertical-align:middle" title="Подлинность аккаунта подтверждена администрацией">✓ Подтверждён</span>' : '';
  const initial = esc((user.name || user.username || '?').slice(0, 1).toUpperCase());
  res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#17212b"><title>${name} — Nevogram</title><link rel="stylesheet" href="/style.css"><style>
  body{margin:0;background:#0e1621;color:#f5f7fa;font-family:Arial,sans-serif}.profile-page{min-height:100vh;max-width:620px;margin:0 auto;background:#17212b}.profile-top{height:58px;display:flex;align-items:center;gap:24px;padding:0 18px;background:#17212b;position:sticky;top:0;border-bottom:1px solid #263746}.profile-top a{font-size:28px;color:#72b5f8;text-decoration:none}.profile-top strong{font-size:18px;font-weight:600}.profile-cover{height:100px;background:linear-gradient(135deg,#2b5278,#1c354b)}.profile-hero{padding:0 22px 22px;background:#17212b}.profile-avatar{width:112px;height:112px;border-radius:50%;margin-top:-56px;border:4px solid #17212b;background:#5288b8;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:600;overflow:hidden}.profile-avatar img{width:100%;height:100%;object-fit:cover}.profile-name{font-size:24px;font-weight:700;margin-top:12px}.profile-online{font-size:14px;color:#8dabbf;margin-top:5px}.profile-actions{display:flex;gap:10px;margin-top:20px}.profile-actions a{flex:1;text-align:center;padding:12px 8px;border-radius:10px;text-decoration:none;font-weight:600;background:#2b5278;color:#fff}.profile-actions a.secondary{background:#243442;color:#c9d8e5}.profile-section{margin-top:10px;padding:18px 22px;background:#17212b}.profile-label{font-size:13px;color:#72b5f8;margin-bottom:8px}.profile-value{font-size:15px;line-height:1.45;overflow-wrap:anywhere}.profile-id{margin-top:16px;color:#91a5b5;font-size:13px}@media(min-width:621px){body{padding:24px 0}.profile-page{min-height:calc(100vh - 48px);border-radius:14px;overflow:hidden;box-shadow:0 10px 40px #0005}}
  </style></head><body><main class="profile-page"><header class="profile-top"><a href="/home" aria-label="Назад">‹</a><strong>Профиль</strong></header><div class="profile-cover"></div><section class="profile-hero"><div class="profile-avatar">${avatar ? '<img src="' + avatar + '" alt="Аватар">' : initial}</div><div class="profile-name">${name}${verifiedBadge}</div><div class="profile-online">@${username}</div><div class="profile-actions" id="profileActions" data-profile-id="${publicId}"><a id="writeProfile" href="/home">✉ Написать</a><a id="editProfile" class="secondary" href="/editprofile" hidden>✎ Изменить профиль</a></div></section><script>(async()=>{const token=sessionStorage.getItem("token");if(!token)return;try{const r=await fetch("/api/me",{headers:{Authorization:"Bearer "+token}});if(!r.ok)return;const d=await r.json();const actions=document.getElementById("profileActions");if(String(d.user?.publicId||"")===actions.dataset.profileId){document.getElementById("writeProfile").hidden=true;document.getElementById("editProfile").hidden=false;}}catch(e){}})();</script><section class="profile-section"><div class="profile-label">О себе</div><div class="profile-value">${about}</div><div class="profile-id">ID пользователя: ${publicId}</div></section></main></body></html>`);
});

app.get('/admin', (req, res) => {
  res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0e1621"><title>Админ-панель — Nevogram</title><link rel="stylesheet" href="/style.css"></head><body><main class="auth-screen"><section class="auth-card" style="max-width:680px"><div class="auth-logo">✈️</div><h1>Nevogram Admin</h1><p class="auth-sub">Управление бета-приглашениями и пользователями</p><form id="adminLogin"><label id="adminPasswordLabel" for="adminPassword" style="display:block;text-align:left;margin:10px 0 6px">Первый пароль администратора</label><input id="adminPassword" type="password" placeholder="Введи первый пароль" autocomplete="current-password" required style="display:block;width:100%;box-sizing:border-box"><button id="adminLoginButton" type="submit">Далее</button></form><div id="adminError" class="auth-error"></div><section id="adminPanel" hidden><button id="createInvite" type="button">Создать бета-код</button><p id="newInvite"></p><h2>Приглашения</h2><div id="invites"></div><h2>Пользователи</h2><div id="users"></div><h2>Заявки на верификацию</h2><div id="verificationRequests"></div></section><p class="register-hint"><a href="/home">Открыть мессенджер</a></p></section></main><script>
let adminToken= sessionStorage.getItem('nevogramAdminToken')||'';
const err=document.getElementById('adminError');
async function call(path,method='GET',body){const r=await fetch('/api/admin'+path,{method,headers:{'Content-Type':'application/json',...(adminToken?{Authorization:'Bearer '+adminToken}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Ошибка запроса');return d;}
async function refresh(){const [i,u,v]=await Promise.all([call('/invites'),call('/users'),call('/verification-requests')]);document.getElementById('invites').innerHTML=i.invites.map(v=>'<p>'+(v.used?'':'<button type="button" data-delete-invite="'+v.id+'" style="margin-right:8px;background:#fff;color:#d11;border:1px solid #d11">Удалить</button>')+v.codePreview+' · '+(v.used?'использован':'не использован')+'</p>').join('')||'<p>Пока нет кодов</p>';document.querySelectorAll('[data-delete-invite]').forEach(btn=>btn.addEventListener('click',async()=>{if(btn.dataset.confirm!=='yes'){btn.dataset.confirm='yes';btn.textContent='точно?';btn.style.background='#fff';btn.style.color='#d11';btn.style.border='1px solid #d11';return;}try{await call('/invites/'+encodeURIComponent(btn.dataset.deleteInvite),'DELETE');await refresh();}catch(e){err.textContent=e.message;}}));document.getElementById('users').innerHTML=u.users.map(v=>'<label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #263746"><input type="checkbox" data-verify-user="'+v.id+'" '+(v.verified?'checked':'')+' style="width:auto;margin:0"><span>@'+String(v.name||v.email).replace(/[&<>\"]/g,'')+'</span><small style="color:#72b5f8">'+(v.verified?'✓ подтверждён':'')+'</small></label>').join('')||'<p>Пока нет пользователей</p>';document.querySelectorAll('[data-verify-user]').forEach(box=>box.addEventListener('change',async()=>{box.disabled=true;try{await call('/users/'+encodeURIComponent(box.dataset.verifyUser)+'/verification','PATCH',{verified:box.checked});await refresh();}catch(e){err.textContent=e.message;box.checked=!box.checked;box.disabled=false;}}));document.getElementById('verificationRequests').innerHTML=v.requests.map(r=>'<article style="border:1px solid #2a3c4d;border-radius:12px;padding:12px;margin:10px 0"><b>@'+String(r.username).replace(/[&<>\"]/g,'')+'</b> · '+(r.status==='pending'?'На рассмотрении':r.status==='approved'?'Одобрена':'Отклонена')+'<p>Соцсеть: '+String(r.network).replace(/[&<>\"]/g,'')+' · ник: '+String(r.socialUsername).replace(/[&<>\"]/g,'')+'</p><p>Подписчики: '+String(r.followers).replace(/[&<>\"]/g,'')+'</p><p>Зачем нужна верификация: '+String(r.reason).replace(/[&<>\"]/g,'')+'</p><p>Ссылка на канал: '+String(r.channelLink || r.proof || '').replace(/[&<>\"]/g,'')+'</p>'+(r.status==='pending'?'<button type="button" data-request-decision="approved" data-request-id="'+r.id+'">Одобрить</button> <button type="button" data-request-decision="rejected" data-request-id="'+r.id+'">Отклонить</button>':'')+'</article>').join('')||'<p>Заявок пока нет.</p>';document.querySelectorAll('[data-request-decision]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await call('/verification-requests/'+encodeURIComponent(btn.dataset.requestId),'PATCH',{decision:btn.dataset.requestDecision});await refresh();}catch(e){err.textContent=e.message;btn.disabled=false;}}));}}
let adminLoginStep='first';document.getElementById('adminLogin').addEventListener('submit',async e=>{e.preventDefault();err.textContent='';try{const input=document.getElementById('adminPassword');const body=adminLoginStep==='first'?{password:input.value}:{step:'second',secondPassword:input.value};const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка входа');if(d.needsSecondPassword){adminLoginStep='second';input.value='';input.placeholder='Введи второй пароль';input.autocomplete='off';document.getElementById('adminPasswordLabel').textContent='Второй пароль администратора';document.getElementById('adminLoginButton').textContent='Подтвердить';input.focus();return;}adminToken=d.token;sessionStorage.setItem('nevogramAdminToken',adminToken);document.getElementById('adminPanel').hidden=false;await refresh();}catch(e){err.textContent=e.message;}});
document.getElementById('createInvite').addEventListener('click',async()=>{try{const d=await call('/invites','POST');document.getElementById('newInvite').textContent='Новый код (сохраните сейчас, он показывается один раз): '+d.code;await refresh();}catch(e){err.textContent=e.message;}});
if(adminToken){document.getElementById('adminPanel').hidden=false;refresh().catch(e=>{document.getElementById('adminPanel').hidden=true;sessionStorage.removeItem('nevogramAdminToken');adminToken='';err.textContent='Сессия администратора устарела. Войди заново, используя оба пароля. ('+e.message+')';});}
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
  const configured = Boolean(process.env.ADMIN_SECOND_PASSWORD);
  if (req.path.endsWith('/security-setup')) {
    if (configured || !data.setupOnly) return res.status(403).json({ error: 'Настройка защиты недоступна' });
    return next();
  }
  if (!configured || data.securityVerified !== true) return res.status(403).json({ error: 'Сначала настройте или подтвердите дополнительную защиту администратора' });
  next();
}

function publicUser(u) {
  return { id: u.id, publicId: u.publicId || state.users.indexOf(u) + 1, username: u.username || u.email, email: u.username || u.email, name: u.name, verified: Boolean(u.verified), twoFactorEnabled: Boolean(u.twoFactorHash) };
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
  const body = req.body || {};
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const username = String(body.username || '').trim().replace(/^@+/, '').toLowerCase();
  const avatar = String(body.avatar || '');
  const banner = String(body.banner || '');
  const birthday = String(body.birthday || '').trim();
  if (!firstName) return res.status(400).json({ error: 'Введите имя' });
  if (firstName.length > 40 || lastName.length > 40) return res.status(400).json({ error: 'Имя и фамилия должны быть не длиннее 40 символов' });
  if (username && !/^[a-z0-9_]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username должен содержать 3–32 символа: латиницу, цифры или _' });
  if (username && state.users.some(u => u.id !== req.user.id && String(u.username || '').toLowerCase() === username)) return res.status(409).json({ error: 'Этот username уже занят' });
  if (avatar && (!avatar.startsWith('data:image/jpeg;base64,') || avatar.length > 1500000)) return res.status(400).json({ error: 'Фото профиля не подходит или слишком большое' });
  if (banner && (!/^data:(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime));base64,/.test(banner) || banner.length > 8500000)) return res.status(400).json({ error: 'Баннер должен быть фото или видео до 6 МБ' });
  if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return res.status(400).json({ error: 'Укажите корректную дату рождения' });
  if (birthday && !req.user.birthday) {
    const parsed = new Date(birthday + 'T00:00:00Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthday || parsed > new Date()) return res.status(400).json({ error: 'Укажите корректную дату рождения' });
  }
  if (req.user.birthday && birthday && birthday !== req.user.birthday) return res.status(400).json({ error: 'Дата рождения уже сохранена и не может быть изменена' });
  req.user.firstName = firstName;
  req.user.lastName = lastName;
  req.user.name = [firstName, lastName].filter(Boolean).join(' ');
  if (username) req.user.username = username;
  if (avatar) req.user.avatar = avatar;
  if (banner) req.user.banner = banner;
  if (birthday && !req.user.birthday) req.user.birthday = birthday;
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

// ---------- Админка: инвайт-коды, пользователи и заявки на верификацию ----------
if (!Array.isArray(state.verificationRequests)) state.verificationRequests = [];
// Админ НЕ имеет доступа к переписке людей — только управляет кодами приглашений и видит список аккаунтов.
app.post('/api/admin/login', (req, res) => {
  const { password, secondPassword, step } = req.body || {};
  if (step === 'second') {
    if (!process.env.ADMIN_SECOND_PASSWORD) return res.status(503).json({ error: 'В Render → Environment добавь ADMIN_SECOND_PASSWORD, затем перезапусти сервис' });
    if (typeof secondPassword !== 'string' || secondPassword !== process.env.ADMIN_SECOND_PASSWORD) return res.status(401).json({ error: 'Неверный второй пароль' });
    return res.json({ token: sign({ admin: true, securityVerified: true }) });
  }
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Неверный пароль администратора' });
  if (!process.env.ADMIN_SECOND_PASSWORD) return res.status(503).json({ error: 'В Render → Environment добавь ADMIN_SECOND_PASSWORD, затем перезапусти сервис' });
  res.json({ needsSecondPassword: true });
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

app.post('/api/me/verification-request', authMiddleware, (req, res) => {
  if (!Array.isArray(state.verificationRequests)) state.verificationRequests = [];
  const existing = state.verificationRequests.find(r => r.userId === req.user.id && r.status === 'pending');
  if (existing) return res.status(409).json({ error: 'У вас уже есть заявка на рассмотрении.' });
  const body = req.body || {};
  const network = String(body.network || '').trim().slice(0, 40);
  const socialUsername = String(body.socialUsername || '').trim().slice(0, 100);
  const followers = String(body.followers || '').trim().slice(0, 40);
  const reason = String(body.reason || '').trim().slice(0, 1000);
  const channelLink = String(body.channelLink || '').trim().slice(0, 1500);
  if (!network || !socialUsername || !followers || !reason || !channelLink) return res.status(400).json({ error: 'Заполните все поля заявки.' });
  const request = { id: nanoid(), userId: req.user.id, network, socialUsername, followers, reason, channelLink, status: 'pending', createdAt: Date.now() };
  state.verificationRequests.push(request); save();
  res.status(201).json({ ok: true, request: { id: request.id, status: request.status } });
});

app.get('/api/me/verification-request', authMiddleware, (req, res) => {
  const requests = (state.verificationRequests || []).filter(r => r.userId === req.user.id).sort((a,b) => b.createdAt-a.createdAt);
  res.json({ requests: requests.map(r => ({ id:r.id, network:r.network, socialUsername:r.socialUsername, followers:r.followers, reason:r.reason, channelLink:r.channelLink || r.proof || '', status:r.status, createdAt:r.createdAt, reviewedAt:r.reviewedAt || null, adminNote:r.adminNote || '' })) });
});

app.get('/api/admin/verification-requests', adminMiddleware, (req, res) => {
  const requests = (state.verificationRequests || []).slice().sort((a,b) => b.createdAt-a.createdAt).map(r => {
    const user = state.users.find(u => u.id === r.userId);
    return { ...r, username: user ? (user.username || user.email) : 'удалённый аккаунт', userName: user ? user.name : '' };
  });
  res.json({ requests });
});

app.patch('/api/admin/verification-requests/:id', adminMiddleware, (req, res) => {
  const request = (state.verificationRequests || []).find(r => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Заявка не найдена.' });
  if (request.status !== 'pending') return res.status(409).json({ error: 'Эта заявка уже рассмотрена.' });
  const decision = String((req.body || {}).decision || '');
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Укажите решение.' });
  const user = state.users.find(u => u.id === request.userId);
  if (decision === 'approved' && !user) return res.status(404).json({ error: 'Аккаунт пользователя не найден.' });
  request.status = decision;
  request.reviewedAt = Date.now();
  request.adminNote = String((req.body || {}).note || '').trim().slice(0, 500);
  if (user) { user.verified = decision === 'approved'; user.verifiedAt = user.verified ? Date.now() : null; }
  save();
  res.json({ ok: true, status: request.status });
});

app.get('/api/admin/users', adminMiddleware, (req, res) => {
  res.json({ users: state.users.map(u => ({ id: u.id, email: u.email, name: u.name, verified: Boolean(u.verified), createdAt: u.createdAt })) });
});

app.patch('/api/admin/users/:id/verification', adminMiddleware, (req, res) => {
  const user = state.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (typeof (req.body || {}).verified !== 'boolean') return res.status(400).json({ error: 'Укажите статус верификации' });
  user.verified = req.body.verified;
  user.verifiedAt = user.verified ? Date.now() : null;
  save();
  res.json({ ok: true, id: user.id, verified: user.verified });
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
