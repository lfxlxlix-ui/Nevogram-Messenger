(() => {
  const state = {
    token: localStorage.getItem('token') || null,
    me: null,
    chats: [],
    activeChat: null,
    socket: null,
    mutedUntil: Number(localStorage.getItem('nevogramMutedUntil') || 0)
  };

  const el = (id) => document.getElementById(id);

  async function api(path, options = {}) {
    const res = await fetch('/api' + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
    return data;
  }

  // ---------- Вход по логину и паролю с опциональным 2FA-кодом ----------
  el('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    el('authError').textContent = '';
    try {
      const data = await api('/auth/login', { method: 'POST', body: {
        username: el('usernameInput').value.trim().toLowerCase(),
        password: el('passwordInput').value,
        twoFactorCode: el('twoFactorInput').value.trim()
      }});
      if (data.requiresTwoFactor) {
        el('authError').textContent = 'Введите секретный код 2FA в поле ниже и нажмите «Войти» ещё раз.';
        el('twoFactorInput').focus();
        return;
      }
      state.token = data.token;
      localStorage.setItem('token', data.token);
      state.me = data.user;
      startApp();
    } catch (err) {
      el('authError').textContent = err.message;
    }
  });

  async function tryResumeSession() {
    if (!state.token) return showAuth();
    try {
      const data = await api('/me');
      state.me = data.user;
      startApp();
    } catch (e) {
      localStorage.removeItem('token');
      state.token = null;
      showAuth();
    }
  }

  function showAuth() {
    el('authScreen').classList.remove('hidden');
    el('app').classList.add('hidden');
  }

  function startApp() {
    rememberAccount();
    el('authScreen').classList.add('hidden');
    el('app').classList.remove('hidden');
    el('meName').textContent = state.me.name + ' · @' + (state.me.username || state.me.email);
    el('meName').style.cursor = 'pointer';
    el('meName').title = 'Открыть мой профиль';
    el('meName').onclick = () => { window.location.href = '/profile/' + encodeURIComponent(state.me.publicId || 1); };
    connectSocket();
    loadChats();
    setupNavigation();
    if (window.location.pathname === '/settings') { loadPrivacySettings(); el('privacyModal').classList.remove('hidden'); }
  }

  // ---------- Сокет ----------
  function connectSocket() {
    state.socket = io({ auth: { token: state.token } });

    state.socket.on('chat:new', () => {
      loadChats().catch(() => {});
    });

    state.socket.on('message:new', (msg) => {
      if (state.activeChat && msg.chatId === state.activeChat.id) {
        renderMessage(msg);
        scrollMessagesToBottom();
        state.socket.emit('read', { chatId: state.activeChat.id });
      }
      loadChats();
    });

    state.socket.on('read', ({ chatId }) => {
      if (state.activeChat && chatId === state.activeChat.id) {
        document.querySelectorAll('.msg.out .meta').forEach(m => { m.textContent = m.textContent.replace('✓', '✓✓'); });
      }
    });

    state.socket.on('typing', ({ chatId }) => {
      if (state.activeChat && chatId === state.activeChat.id) {
        el('chatSubtitle').textContent = 'печатает…';
        clearTimeout(window.__typingTimeout);
        window.__typingTimeout = setTimeout(() => { el('chatSubtitle').textContent = ''; }, 2000);
      }
    });
  }

  function rememberAccount() {
    let accounts=[]; try{accounts=JSON.parse(localStorage.getItem('nevogramAccounts')||'[]')}catch(_){}
    if(!Array.isArray(accounts))accounts=[];
    const a={token:state.token,id:state.me.id,username:state.me.username||state.me.email,name:state.me.name||state.me.username};
    accounts=accounts.filter(x=>x.id!==a.id);accounts.unshift(a);localStorage.setItem('nevogramAccounts',JSON.stringify(accounts.slice(0,3)));
  }
  function setupNavigation(){
    document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(location.pathname==='/settings'?'settings':'home')));
    el('myProfileNav').onclick=e=>{e.preventDefault();location.href='/profile/'+encodeURIComponent(state.me.publicId||1)};
    el('searchOpenBtn').onclick=()=>{el('globalSearchModal').classList.remove('hidden');el('globalSearchInput').focus()};
    el('moreOpenBtn').onclick=()=>{renderAccountList();el('moreModal').classList.remove('hidden')};
    el('newChatFab').onclick=()=>{el('createMenuError').textContent='';el('createMenuModal').classList.remove('hidden');el('peopleSearchInput').focus()};
    el('newGroupMenuBtn').onclick=()=>{el('createMenuModal').classList.add('hidden');el('groupModal').classList.remove('hidden')};
    el('newChannelMenuBtn').onclick=()=>{el('createMenuError').textContent='Создание каналов ещё не подключено — добавим следующим этапом.'};
    el('switchAccountBtn').onclick=renderAccountList;
    el('markAllReadBtn').onclick=async()=>{try{for(const c of state.chats)await api('/chats/'+c.id+'/read',{method:'POST'});await loadChats();el('moreModal').classList.add('hidden')}catch(e){alert(e.message)}};
    el('muteHourBtn').onclick=()=>{state.mutedUntil=Date.now()+3600000;localStorage.setItem('nevogramMutedUntil',String(state.mutedUntil));el('muteHourBtn').textContent='✓ Звук отключён на час'};
    const search=async(inputId,resultsId)=>{const q=el(inputId).value.trim(),box=el(resultsId);if(!q){box.innerHTML='';return}try{const d=await api('/search/users?q='+encodeURIComponent(q));box.innerHTML=d.users.map(u=>'<button class="search-result" data-user="'+escapeHtml(u.username)+'"><strong>'+escapeHtml(u.name||u.username)+'</strong><small>@'+escapeHtml(u.username)+'</small></button>').join('')||'<p class="search-empty">Ничего не найдено</p>';box.querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{try{const d=await api('/chats/direct',{method:'POST',body:{email:b.dataset.user}});el('globalSearchModal').classList.add('hidden');el('createMenuModal').classList.add('hidden');await loadChats();openChat(d.chat.id)}catch(e){alert(e.message)}})}catch(e){box.textContent=e.message}};
    el('globalSearchInput').oninput=()=>search('globalSearchInput','globalSearchResults');
    el('peopleSearchInput').oninput=()=>search('peopleSearchInput','peopleSearchResults');
  }
  function renderAccountList(){
    let accounts=[];try{accounts=JSON.parse(localStorage.getItem('nevogramAccounts')||'[]')}catch(_){}
    if(!Array.isArray(accounts))accounts=[];
    const box=el('accountList');box.innerHTML='<p class="account-heading">Аккаунты ('+accounts.length+'/3)</p>'+accounts.map(a=>'<button class="account-option" data-account="'+escapeHtml(a.id)+'">'+escapeHtml(a.name||a.username)+' <small>@'+escapeHtml(a.username)+'</small></button>').join('')+(accounts.length>=3?'<p class="search-empty">Достигнут лимит: 3 аккаунта</p>':'<a class="add-account-link" href="/canan">＋ Добавить аккаунт</a>');
    box.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>{const a=accounts.find(x=>String(x.id)===b.dataset.account);if(a){localStorage.setItem('token',a.token);location.href='/home'}});
  }

  // ---------- Список чатов ----------
  async function loadChats() {
    const data = await api('/chats');
    state.chats = data.chats;
    renderChatList();
  }

  function renderChatList() {
    const list = el('chatList');
    list.innerHTML = '';
    state.chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'chat-item' + (state.activeChat && state.activeChat.id === chat.id ? ' active' : '');
      const time = chat.lastMessage ? formatTime(chat.lastMessage.createdAt) : '';
      const preview = chat.lastMessage ? escapeHtml(chat.lastMessage.text) : 'Нет сообщений';
      item.innerHTML = `
        <div class="chat-item-top">
          <div class="chat-item-title">${escapeHtml(chat.title)}</div>
          <div class="chat-item-time">${time}</div>
        </div>
        <div class="chat-item-bottom">
          <div class="chat-item-preview">${preview}</div>
          ${chat.unread ? `<div class="chat-item-badge">${chat.unread}</div>` : ''}
        </div>`;
      item.addEventListener('click', () => openChat(chat.id));
      list.appendChild(item);
    });
  }

  // ---------- Открытие чата ----------
  async function openChat(chatId) {
    const data = await api('/chats/' + chatId + '/messages');
    state.activeChat = data.chat;
    document.getElementById('app').classList.add('chat-open');
    el('emptyState').classList.add('hidden');
    el('chatView').classList.remove('hidden');
    el('chatTitle').textContent = data.chat.title;
    el('chatSubtitle').textContent = '';
    el('messages').innerHTML = '';
    data.messages.forEach(renderMessage);
    scrollMessagesToBottom();
    renderChatList();
    state.socket.emit('read', { chatId });
  }

  function renderMessage(msg) {
    const mine = msg.senderId === state.me.id;
    const div = document.createElement('div');
    div.className = 'msg ' + (mine ? 'out' : 'in');
    div.innerHTML = `
      ${!mine && state.activeChat && state.activeChat.type === 'group' ? `<div class="sender">${escapeHtml(msg.senderName)}</div>` : ''}
      <div class="text">${escapeHtml(msg.text)}</div>
      <div class="meta">${formatTime(msg.createdAt)}${mine ? ' ✓' : ''}</div>`;
    el('messages').appendChild(div);
  }

  function scrollMessagesToBottom() {
    const box = el('messages');
    box.scrollTop = box.scrollHeight;
  }

  el('sendForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = el('messageInput');
    const text = input.value.trim();
    if (!text || !state.activeChat) return;
    state.socket.emit('message:send', { chatId: state.activeChat.id, text });
    input.value = '';
  });

  let typingTimer = null;
  el('messageInput').addEventListener('input', () => {
    if (!state.activeChat) return;
    if (typingTimer) return;
    state.socket.emit('typing', { chatId: state.activeChat.id });
    typingTimer = setTimeout(() => { typingTimer = null; }, 1500);
  });

  // ---------- Новый личный чат ----------
  el('newDirectBtn').addEventListener('click', () => el('directModal').classList.remove('hidden'));
  el('directSubmit').addEventListener('click', async () => {
    el('directError').textContent = '';
    try {
      const data = await api('/chats/direct', { method: 'POST', body: { email: el('directEmailInput').value.trim() } });
      el('directModal').classList.add('hidden');
      el('directEmailInput').value = '';
      await loadChats();
      openChat(data.chat.id);
    } catch (err) {
      el('directError').textContent = err.message;
    }
  });

  // ---------- Новая группа ----------
  el('newGroupBtn').addEventListener('click', () => el('groupModal').classList.remove('hidden'));
  el('groupSubmit').addEventListener('click', async () => {
    el('groupError').textContent = '';
    try {
      const emails = el('groupEmailsInput').value.split(',').map(s => s.trim()).filter(Boolean);
      const data = await api('/chats/group', { method: 'POST', body: { name: el('groupNameInput').value.trim(), emails } });
      el('groupModal').classList.add('hidden');
      el('groupNameInput').value = '';
      el('groupEmailsInput').value = '';
      await loadChats();
      openChat(data.chat.id);
    } catch (err) {
      el('groupError').textContent = err.message;
    }
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'));
  });

  // Закрытие любого меню: крестик/кнопка «Закрыть», нажатие снаружи или Escape.
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal) modal.classList.add('hidden');
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal:not(.hidden)').forEach(modal => modal.classList.add('hidden'));
    }
  });


  // ---------- Настройки двухфакторной защиты ----------
  el('securitySaveBtn').addEventListener('click', async () => {
    el('securityError').textContent = '';
    try {
      const enabled = el('twoFactorEnabledInput').checked;
      const result = await api('/me/security', { method: 'PUT', body: { enabled, password: el('securityPasswordInput').value, secretCode: el('securityCodeInput').value.trim() } });
      if (state.me) state.me.twoFactorEnabled = result.enabled;
      el('securityError').textContent = enabled ? 'Двухфакторная защита включена.' : 'Двухфакторная защита выключена.';
      el('securityPasswordInput').value = '';
      el('securityCodeInput').value = '';
    } catch (err) { el('securityError').textContent = err.message; }
  });

  // ---------- Конфиденциальность ----------
  const privacyDefaults = { email: 'Все', online: 'Все', avatar: 'Все', messages: 'Все', groups: 'Все', channels: 'Все', username: 'Все' };
  function loadPrivacySettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('nevogramPrivacy') || '{}'); } catch (_) {}
    document.querySelectorAll('[data-privacy]').forEach(select => {
      const key = select.dataset.privacy;
      select.value = saved[key] || privacyDefaults[key] || 'Все';
    });
  }
  function savePrivacySettings() {
    const saved = {};
    document.querySelectorAll('[data-privacy]').forEach(select => { saved[select.dataset.privacy] = select.value; });
    localStorage.setItem('nevogramPrivacy', JSON.stringify(saved));
    el('privacyModal').classList.add('hidden');
  }
  el('privacyOpenBtn').addEventListener('click', () => {
    loadPrivacySettings();
    el('twoFactorEnabledInput').checked = Boolean(state.me && state.me.twoFactorEnabled);
    el('privacyModal').classList.remove('hidden');
  });
  el('privacySaveBtn').addEventListener('click', savePrivacySettings);

  // ---------- Утилиты ----------
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  tryResumeSession();
})();
