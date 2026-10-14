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
    if (new URLSearchParams(location.search).get('switch') === '1') {
      localStorage.removeItem('token');
      state.token = null;
      history.replaceState({}, '', '/login');
      return showAccountPickerOrAuth();
    }
    if (!state.token) return showAccountPickerOrAuth();
    try {
      const data = await api('/me');
      state.me = data.user;
      startApp();
    } catch (e) {
      localStorage.removeItem('token');
      state.token = null;
      showAccountPickerOrAuth();
    }
  }

  function showAuth(username = '') {
    el('authScreen').classList.remove('hidden');
    el('app').classList.add('hidden');
    const picker = el('accountPicker');
    if (picker) picker.classList.add('hidden');
    el('authForm').classList.remove('hidden');
    el('usernameInput').value = username;
    el('passwordInput').value = '';
    el('twoFactorInput').value = '';
    el('authError').textContent = '';
    if (username) el('passwordInput').focus();
  }

  function showAccountPickerOrAuth() {
    let accounts = [];
    try { accounts = JSON.parse(localStorage.getItem('nevogramAccounts') || '[]'); } catch (_) {}
    accounts = normalizeAccounts(accounts);
    localStorage.setItem('nevogramAccounts', JSON.stringify(accounts));
    el('authScreen').classList.remove('hidden');
    el('app').classList.add('hidden');
    if (!accounts.length) return showAuth();
    el('authForm').classList.add('hidden');
    el('authError').textContent = '';
    const picker = el('accountPicker');
    picker.classList.remove('hidden');
    picker.innerHTML = '<h2 class="account-picker-title">Выберите аккаунт</h2>' +
      accounts.map(a => '<button type="button" class="account-picker-option" data-account-id="' + escapeHtml(a.id) + '"><span class="account-picker-avatar">' + escapeHtml((a.name || a.username || '?').slice(0, 1).toUpperCase()) + '</span><span class="account-picker-info"><strong>' + escapeHtml(a.name || a.username) + '</strong><small>@' + escapeHtml(a.username) + '</small></span><span class="account-picker-arrow">›</span></button>').join('') +
      '<button type="button" class="account-picker-other">Войти в другой аккаунт</button>';
    picker.querySelectorAll('[data-account-id]').forEach(button => {
      button.addEventListener('click', () => {
        const account = accounts.find(a => String(a.id) === button.dataset.accountId);
        if (account) showAuth(account.username || '');
      });
    });
    picker.querySelector('.account-picker-other').addEventListener('click', () => showAuth());
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
    handleChannelDeepLink();
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

  function normalizeAccounts(accounts) {
    const unique = [];
    const seen = new Set();
    for (const a of Array.isArray(accounts) ? accounts : []) {
      if (!a || !a.id || !a.token) continue;
      const id = String(a.id);
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push({ ...a, id });
    }
    return unique.slice(0, 3);
  }
  function rememberAccount() {
    let accounts = [];
    try { accounts = JSON.parse(localStorage.getItem('nevogramAccounts') || '[]'); } catch (_) {}
    const a = { token: state.token, id: String(state.me.id), username: state.me.username || state.me.email, name: state.me.name || state.me.username };
    accounts = normalizeAccounts(accounts).filter(x => String(x.id) !== a.id);
    accounts.unshift(a);
    localStorage.setItem('nevogramAccounts', JSON.stringify(accounts.slice(0, 3)));
  }
  document.querySelectorAll('.add-account-link').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      el('addAccountChoiceModal').classList.remove('hidden');
    });
  });
  el('loginExistingAccountBtn').addEventListener('click', () => { location.href = '/cananl?switch=1'; });
  el('createNewAccountBtn').addEventListener('click', () => { location.href = '/cananr'; });

  function setupNavigation(){
    document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(location.pathname==='/settings'?'settings':'home')));
    el('myProfileNav').onclick=e=>{e.preventDefault();location.href='/profile/'+encodeURIComponent(state.me.publicId||1)};
    el('searchOpenBtn').onclick=()=>{el('globalSearchModal').classList.remove('hidden');el('globalSearchInput').focus()};
    el('moreOpenBtn').onclick=()=>{renderAccountList();el('moreModal').classList.remove('hidden')};
    el('newChatFab').onclick=()=>{el('createMenuError').textContent='';el('createMenuModal').classList.remove('hidden');el('peopleSearchInput').focus()};
    el('newGroupMenuBtn').onclick=()=>{el('createMenuModal').classList.add('hidden');el('groupModal').classList.remove('hidden')};
    el('newChannelMenuBtn').onclick=()=>{el('createMenuModal').classList.add('hidden');el('channelModal').classList.remove('hidden');el('channelError').textContent='';};
    el('switchAccountBtn').onclick=renderAccountList;
    el('markAllReadBtn').onclick=async()=>{try{for(const c of state.chats)await api('/chats/'+c.id+'/read',{method:'POST'});await loadChats();el('moreModal').classList.add('hidden')}catch(e){alert(e.message)}};
    el('muteHourBtn').onclick=()=>{state.mutedUntil=Date.now()+3600000;localStorage.setItem('nevogramMutedUntil',String(state.mutedUntil));el('muteHourBtn').textContent='✓ Звук отключён на час'};
    const search=async(inputId,resultsId)=>{const q=el(inputId).value.trim(),box=el(resultsId);if(!q){box.innerHTML='';return}try{const d=await api('/search/users?q='+encodeURIComponent(q));box.innerHTML=d.users.map(u=>'<button class="search-result" data-user="'+escapeHtml(u.username)+'"><strong>'+escapeHtml(u.name||u.username)+'</strong><small>@'+escapeHtml(u.username)+'</small></button>').join('')||'<p class="search-empty">Ничего не найдено</p>';box.querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{try{const d=await api('/chats/direct',{method:'POST',body:{email:b.dataset.user}});el('globalSearchModal').classList.add('hidden');el('createMenuModal').classList.add('hidden');await loadChats();openChat(d.chat.id)}catch(e){alert(e.message)}})}catch(e){box.textContent=e.message}};
    el('globalSearchInput').oninput=()=>{search('globalSearchInput','globalSearchResults');searchChannels('globalSearchInput','globalChannelResults')};
    el('peopleSearchInput').oninput=()=>search('peopleSearchInput','peopleSearchResults');
  }
  function renderAccountList(){
    let accounts=[];try{accounts=JSON.parse(localStorage.getItem('nevogramAccounts')||'[]')}catch(_){}
    accounts=normalizeAccounts(accounts);
    localStorage.setItem('nevogramAccounts',JSON.stringify(accounts));
    const box=el('accountList');box.innerHTML='<p class="account-heading">Аккаунты ('+accounts.length+'/3)</p>'+accounts.map(a=>'<div class="account-row"><button type="button" class="account-option" data-account="'+escapeHtml(a.id)+'">'+escapeHtml(a.name||a.username)+' <small>@'+escapeHtml(a.username)+'</small></button><button type="button" class="remove-saved-account" data-remove-account="'+escapeHtml(a.id)+'" aria-label="Убрать аккаунт из списка" title="Убрать из списка">×</button></div>').join('')+(accounts.length>=3?'<p class="search-empty">Достигнут лимит: 3 аккаунта</p>':'<a class="add-account-link" href="/canan">＋ Добавить аккаунт</a>');
    box.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>{const a=accounts.find(x=>String(x.id)===b.dataset.account);if(a){localStorage.setItem('token',a.token);location.href='/home'}});
    box.querySelectorAll('[data-remove-account]').forEach(b=>b.onclick=(event)=>{event.stopPropagation();const account=accounts.find(x=>String(x.id)===b.dataset.removeAccount);if(!account)return;if(!confirm('Убрать аккаунт @'+(account.username||account.name)+' из списка переключения?'))return;const remaining=normalizeAccounts(accounts).filter(x=>String(x.id)!==String(account.id));localStorage.setItem('nevogramAccounts',JSON.stringify(remaining));renderAccountList();});
  }

  // ---------- Список чатов ----------
  async function loadChats() {
    const data = await api('/chats');
    state.chats = data.chats;
    if (state.activeChat) { const fresh = state.chats.find(c => c.id === state.activeChat.id); if (fresh) state.activeChat = { ...state.activeChat, ...fresh }; }
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
      const isDeletedAccount = chat.type === 'direct' && chat.title === 'Удалённый пользователь';
      item.innerHTML = `
        <div class="chat-item-content">
          <div class="chat-item-top">
            <div class="chat-item-title">${chat.type === 'channel' ? '📢 ' : ''}${escapeHtml(chat.title)}</div>
            <div class="chat-item-time">${time}</div>
          </div>
          <div class="chat-item-bottom">
            <div class="chat-item-preview">${preview}</div>
            ${chat.unread ? `<div class="chat-item-badge">${chat.unread}</div>` : ''}
          </div>
        </div>
        ${isDeletedAccount ? '<button type="button" class="remove-deleted-chat" aria-label="Убрать удалённый аккаунт из списка" title="Убрать из списка">×</button>' : ''}`;
      item.addEventListener('click', () => openChat(chat.id));
      const removeButton = item.querySelector('.remove-deleted-chat');
      if (removeButton) removeButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!confirm('Убрать удалённый аккаунт из списка чатов?')) return;
        removeButton.disabled = true;
        try {
          await api('/chats/' + encodeURIComponent(chat.id), { method: 'DELETE' });
          if (state.activeChat && state.activeChat.id === chat.id) {
            state.activeChat = null;
            el('chatView').classList.add('hidden');
            el('emptyState').classList.remove('hidden');
            document.getElementById('app').classList.remove('chat-open');
          }
          await loadChats();
        } catch (error) {
          alert(error.message);
          removeButton.disabled = false;
        }
      });
      list.appendChild(item);
    });
  }

  // ---------- Открытие чата ----------
  async function openChat(chatId) {
    el('messageInput').placeholder = 'Сообщение';
    const data = await api('/chats/' + chatId + '/messages');
    state.activeChat = data.chat;
    document.getElementById('app').classList.add('chat-open');
    el('emptyState').classList.add('hidden');
    el('chatView').classList.remove('hidden');
    el('chatTitle').textContent = data.chat.title;
    el('chatSubtitle').textContent = data.chat.type === 'channel' ? ((data.chat.username ? '@'+data.chat.username+' · ' : '') + (data.chat.subscriberCount || 1) + ' подписчиков') : '';
    el('messageInput').disabled = data.chat.type === 'channel' && !data.chat.canPost;
    el('messageInput').placeholder = data.chat.type === 'channel' && !data.chat.canPost ? 'Публиковать могут только администраторы' : 'Сообщение';
    el('messages').innerHTML = '';
    if (data.chat.type === 'channel') { const info = document.createElement('div'); info.className='channel-info'; info.innerHTML='<strong>'+escapeHtml(data.chat.title)+'</strong><p>'+escapeHtml(data.chat.description||'Канал Nevogram')+'</p>'; el('messages').appendChild(info); }
    data.messages.forEach(renderMessage);
    scrollMessagesToBottom();
    renderChatList();
    if (data.chat.type !== 'channel') state.socket.emit('read', { chatId });
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

  el('sendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = el('messageInput');
    const text = input.value.trim();
    if (!text) return;
    if (!state.activeChat) return;
    if (state.activeChat.type === 'channel' && !state.activeChat.canPost) return;
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


  async function handleChannelDeepLink() {
    const params = new URLSearchParams(location.search);
    const username = params.get('channel');
    const invite = params.get('invite');
    if (!username && !invite) return;
    try {
      const body = username ? { username } : { id: invite.split('.')[0], inviteCode: invite.split('.').slice(1).join('.') };
      const d = await api('/channels/join', { method: 'POST', body });
      history.replaceState({}, '', '/home');
      await loadChats(); openChat(d.chat.id);
    } catch (e) { alert(e.message); }
  }
  // ---------- Каналы ----------
  el('channelSubmit').addEventListener('click', async () => {
    el('channelError').textContent = '';
    try {
      const visibility = el('channelVisibility').value;
      const body = { name: el('channelNameInput').value.trim(), description: el('channelDescriptionInput').value.trim(), visibility, username: el('channelUsernameInput').value.trim() };
      const d = await api('/channels', { method: 'POST', body });
      el('channelModal').classList.add('hidden');
      ['channelNameInput','channelDescriptionInput','channelUsernameInput'].forEach(id => el(id).value='');
      await loadChats(); openChat(d.chat.id);
      if (!d.channel.isPublic) {
        const invite = await api('/channels/'+d.chat.id+'/invite');
        alert('Ссылка-приглашение: '+location.origin+invite.link);
      }
    } catch(e) { el('channelError').textContent = e.message; }
  });
  el('channelVisibility').addEventListener('change', () => {
    el('channelUsernameWrap').classList.toggle('hidden', el('channelVisibility').value !== 'public');
  });
  async function searchChannels(inputId, resultsId) {
    const q=el(inputId).value.trim(), box=el(resultsId);
    if (!q) { box.innerHTML=''; return; }
    try {
      const d=await api('/channels/search?q='+encodeURIComponent(q));
      const html=d.channels.map(c=>'<button class="search-result" data-channel="'+escapeHtml(c.id)+'"><strong>📢 '+escapeHtml(c.title)+'</strong><small>@'+escapeHtml(c.username)+' · '+c.subscriberCount+' подписчиков</small><small>'+escapeHtml(c.description||'')+'</small><small>'+(c.isMember?'Вы подписаны':'Нажмите, чтобы подписаться')+'</small></button>').join('');
      box.innerHTML=html || '<p class="search-empty">Каналы не найдены</p>';
      box.querySelectorAll('[data-channel]').forEach(b=>b.onclick=async()=>{
        try { const d=await api('/channels/join',{method:'POST',body:{id:b.dataset.channel}}); el('globalSearchModal').classList.add('hidden'); await loadChats(); openChat(d.chat.id); }
        catch(e){box.insertAdjacentHTML('beforeend','<p class="search-empty">'+escapeHtml(e.message)+'</p>');}
      });
    } catch(e) { box.textContent=e.message; }
  }

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
