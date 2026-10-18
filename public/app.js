(() => {
  // Keep a session token in both stores so refreshes and account restore stay consistent.
  const state = {
    token: sessionStorage.getItem('token') || localStorage.getItem('token') || null,
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
    if (!res.ok) {
      const error = new Error(data.error || 'Ошибка запроса');
      error.status = res.status;
      throw error;
    }
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
        el('twoFactorInput').hidden = false;
        el('twoFactorInput').setAttribute('aria-label', 'Секретный код двухфакторной защиты');
        el('authError').textContent = 'Для этого аккаунта включена 2FA. Введите секретный код и нажмите «Войти» ещё раз.';
        el('twoFactorInput').focus();
        return;
      }
      state.token = data.token;
      sessionStorage.setItem('token', data.token);
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
      sessionStorage.removeItem('token');
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
      if (e.status === 401) {
        sessionStorage.removeItem('token');
        localStorage.removeItem('token');
        state.token = null;
        showAccountPickerOrAuth();
      } else {
        // Keep the token when the server/network fails temporarily; do not turn a transient error into a logout.
        el('authScreen').classList.remove('hidden');
        el('app').classList.add('hidden');
        showAuth();
        el('authError').textContent = 'Не удалось проверить сессию (ошибка соединения или сервера). Обнови страницу ещё раз; вход не сброшен.';
      }
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
    el('twoFactorInput').hidden = true;
    el('authError').textContent = '';
    if (username) el('passwordInput').focus();
  }

  function showAccountPickerOrAuth() {
    let accounts = [];
    try { accounts = JSON.parse(sessionStorage.getItem('nevogramAccounts') || '[]'); } catch (_) {}
    accounts = normalizeAccounts(accounts);
    sessionStorage.setItem('nevogramAccounts', JSON.stringify(accounts));
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

    state.socket.on('presence', event => {
      state.chats.forEach(chat => { if (chat.type === 'direct' && chat.directUser && chat.directUser.id === event.userId) { chat.directUser.online = Boolean(event.online); if (event.lastSeenAt) chat.directUser.lastSeenAt = event.lastSeenAt; } });
      if (state.activeChat && state.activeChat.type === 'direct' && state.activeChat.directUser && state.activeChat.directUser.id === event.userId) {
        state.activeChat.directUser.online = Boolean(event.online); if (event.lastSeenAt) state.activeChat.directUser.lastSeenAt = event.lastSeenAt;
        el('chatSubtitle').textContent = directUserStatus(state.activeChat.directUser);
      }
    });

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

    state.socket.on('message:updated', ({ chatId, messageId, text, editedAt }) => {
      if (!state.activeChat || state.activeChat.id !== chatId) return;
      const node = el('messages').querySelector('[data-message-id="' + CSS.escape(messageId) + '"]');
      if (node) { node.querySelector('.text').textContent = text; const meta=node.querySelector('.meta'); if(meta) meta.textContent = formatTime(editedAt) + ' · изменено'; }
    });
    state.socket.on('message:deleted', ({ chatId, messageId }) => {
      if (state.activeChat && state.activeChat.id === chatId) el('messages').querySelector('[data-message-id="' + CSS.escape(messageId) + '"]')?.remove();
    });
    state.socket.on('message:error', ({ error }) => alert(error || 'Не удалось выполнить действие'));
    state.socket.on('voice:error', ({ error }) => { el('voiceStatus').textContent = error || 'Ошибка голосового чата'; });
    state.socket.on('voice:started', ({ chatId }) => { if (state.activeChat?.id === chatId) { el('voiceStatus').textContent = 'Голосовой чат активен'; el('voiceJoinBtn').classList.toggle('hidden', Boolean(voiceChatId)); } });
    state.socket.on('voice:stopped', ({ chatId }) => { if (state.activeChat?.id === chatId) { leaveVoiceLocal(); el('voiceJoinBtn').classList.add('hidden'); el('voiceStatus').textContent = 'Голосовой чат завершён'; } });
    state.socket.on('voice:peer-joined', async ({ peerId }) => { if (voiceChatId && voiceChatId === state.activeChat?.id) await createVoiceOffer(peerId); });
    state.socket.on('voice:peers', async ({ chatId, peers }) => { if (voiceChatId === chatId) for (const peerId of peers) await createVoiceOffer(peerId); });
    state.socket.on('voice:offer', async ({ from, chatId, offer }) => {
      if (!voiceChatId || voiceChatId !== chatId) return;
      try {
        const pc = getVoicePeer(from); await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        state.socket.emit('voice:answer', { to: from, chatId, answer: pc.localDescription });
      } catch (e) { el('voiceStatus').textContent = 'Не удалось подключить участника: ' + e.message; }
    });
    state.socket.on('voice:answer', async ({ from, chatId, answer }) => { if (voiceChatId !== chatId) return; const pc=voicePeers.get(from); if(pc) try { await pc.setRemoteDescription(answer); } catch(_) {} });
    state.socket.on('voice:ice', async ({ from, chatId, candidate }) => { if (voiceChatId !== chatId) return; const pc=voicePeers.get(from); if(pc && candidate) try { await pc.addIceCandidate(candidate); } catch(_) {} });
    state.socket.on('voice:peer-left', ({ peerId }) => closeVoicePeer(peerId));

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
  // Delegation also handles the Add account link rendered dynamically inside the three-dots menu.
  document.addEventListener('click', event => {
    const link = event.target.closest('.add-account-link');
    if (!link) return;
    event.preventDefault();
    const choiceModal = el('addAccountChoiceModal');
    if (choiceModal) choiceModal.classList.remove('hidden');
  });
  el('loginExistingAccountBtn').addEventListener('click', () => { location.href = '/cananl?switch=1'; });
  el('createNewAccountBtn').addEventListener('click', () => { location.href = '/cananr'; });

  function setupNavigation(){
    document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(location.pathname==='/settings'?'settings':'home')));
    // Keep settings inside the authenticated app instead of navigating through a fresh page load.
    const settingsNav = document.querySelector('[data-nav="settings"]');
    if (settingsNav) settingsNav.addEventListener('click', event => {
      event.preventDefault();
      window.location.href = '/settings';
    });
    el('myProfileNav').onclick=e=>{e.preventDefault();location.href='/profile/'+encodeURIComponent(state.me.publicId||1)};
    el('searchOpenBtn').onclick=()=>{el('globalSearchModal').classList.remove('hidden');el('globalSearchInput').focus()};
    el('moreOpenBtn').onclick=(event)=>{event.stopPropagation();renderAccountList();el('moreModal').classList.remove('hidden')};
    el('newChatFab').onclick=()=>{el('createMenuError').textContent='';el('createMenuModal').classList.remove('hidden');el('peopleSearchInput').focus()};
    el('newGroupMenuBtn').onclick=()=>{el('createMenuModal').classList.add('hidden');el('groupModal').classList.remove('hidden')};
    el('newChannelMenuBtn').onclick=()=>{el('createMenuModal').classList.add('hidden');el('channelModal').classList.remove('hidden');el('channelError').textContent='';};
    el('switchAccountBtn').onclick=()=>{renderAccountList();el('accountList').scrollIntoView({behavior:'smooth',block:'nearest'});};
    el('closeMoreBtn').onclick=()=>el('moreModal').classList.add('hidden');
    el('markAllReadBtn').onclick=async()=>{try{for(const c of state.chats)await api('/chats/'+c.id+'/read',{method:'POST'});await loadChats();el('moreModal').classList.add('hidden')}catch(e){alert(e.message)}};
    el('muteHourBtn').onclick=()=>{state.mutedUntil=Date.now()+3600000;localStorage.setItem('nevogramMutedUntil',String(state.mutedUntil));el('muteHourBtn').textContent='✓ Звук отключён на час'};
    const search=async(inputId,resultsId)=>{const q=el(inputId).value.trim(),box=el(resultsId);if(!q){box.innerHTML='';return}try{const d=await api('/search/users?q='+encodeURIComponent(q));box.innerHTML=d.users.map(u=>'<button class="search-result" data-user="'+escapeHtml(u.username)+'"><strong>'+escapeHtml(u.name||u.username)+'</strong><small>@'+escapeHtml(u.username)+'</small></button>').join('')||'<p class="search-empty">Ничего не найдено</p>';box.querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{try{const d=await api('/chats/direct',{method:'POST',body:{email:b.dataset.user}});el('globalSearchModal').classList.add('hidden');el('createMenuModal').classList.add('hidden');await loadChats();openChat(d.chat.id)}catch(e){alert(e.message)}})}catch(e){box.textContent=e.message}};
    el('globalSearchInput').oninput=()=>{search('globalSearchInput','globalSearchResults');searchChannels('globalSearchInput','globalChannelResults')};
    el('peopleSearchInput').oninput=()=>search('peopleSearchInput','peopleSearchResults');
  }
  function renderAccountList(){
    let accounts=[];try{accounts=JSON.parse(localStorage.getItem('nevogramAccounts')||'[]')}catch(_){}
    accounts=normalizeAccounts(accounts);
    // The currently active profile always occupies a slot, even if it was removed from the saved list.
    if (state.me && state.token) {
      const current = { token: state.token, id: String(state.me.id), username: state.me.username || state.me.email, name: state.me.name || state.me.username };
      accounts = accounts.filter(a => String(a.id) !== current.id);
      accounts.unshift(current);
      accounts = accounts.slice(0, 3);
    }
    localStorage.setItem('nevogramAccounts',JSON.stringify(accounts));
    const box=el('accountList');box.innerHTML='<p class="account-heading">Аккаунты ('+accounts.length+'/3)</p>'+accounts.map(a=>'<div class="account-row"><button type="button" class="account-option" data-account="'+escapeHtml(a.id)+'">'+escapeHtml(a.name||a.username)+' <small>@'+escapeHtml(a.username)+'</small></button><button type="button" class="remove-saved-account" data-remove-account="'+escapeHtml(a.id)+'" aria-label="Убрать аккаунт из списка" title="Убрать из списка">×</button></div>').join('')+(accounts.length>=3?'<p class="search-empty">Достигнут лимит: 3 аккаунта</p>':'<a class="add-account-link" href="#addAccountChoice">＋ Добавить аккаунт</a>');
    box.querySelectorAll('[data-account]').forEach(b=>b.onclick=()=>{const a=accounts.find(x=>String(x.id)===b.dataset.account);if(a){sessionStorage.setItem('token',a.token);localStorage.setItem('token',a.token);location.href='/chats'}});
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

  function formatLastSeen(timestamp) {
    if (!timestamp) return 'давно не был(а) в сети';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'давно не был(а) в сети';
    const now = new Date();
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === now.toDateString()) return 'был(а) в сети сегодня в ' + time;
    const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
    if (date.toDateString() === yesterday.toDateString()) return 'был(а) в сети вчера в ' + time;
    return 'был(а) в сети ' + date.toLocaleDateString('ru-RU', { day:'numeric', month:'short' }) + ' в ' + time;
  }
  function directUserStatus(user) { return user ? (user.online ? 'в сети' : formatLastSeen(user.lastSeenAt)) : 'Пользователь'; }
  function renderChatHeader(chat) {
    const user = chat && chat.type === 'direct' ? chat.directUser : null;
    el('chatTitle').textContent = chat ? chat.title : '';
    const openProfile = () => { if (user && user.publicId) window.location.href = '/profile/' + encodeURIComponent(user.publicId); };
    const openChannelSettings = () => { if (chat && chat.type === 'channel') openChannelAdmins(chat); };
    const headerAction = user ? openProfile : (chat && chat.type === 'channel' ? openChannelSettings : null);
    el('chatTitle').style.cursor = headerAction ? 'pointer' : 'default';
    el('chatTitle').onclick = headerAction;
    el('chatAvatar').style.cursor = headerAction ? 'pointer' : 'default';
    el('chatAvatar').onclick = headerAction;
    el('chatSubtitle').style.cursor = headerAction ? 'pointer' : 'default';
    el('chatSubtitle').onclick = headerAction;
    const avatar = el('chatAvatar');
    if (user && user.avatar) avatar.innerHTML = '<img src="' + escapeHtml(user.avatar) + '" alt="">';
    else avatar.textContent = chat && chat.type === 'channel' ? '📢' : (chat && chat.title ? chat.title.slice(0,1).toUpperCase() : '');
    avatar.style.display = chat && (chat.type === 'direct' || chat.type === 'channel') ? 'flex' : 'none';
    const bar = el('channelActionBar');
    if (bar) {
      bar.classList.toggle('hidden', !chat || chat.type !== 'channel');
      if (chat && chat.type === 'channel') {
        el('channelAdminsOpenBtn').classList.toggle('hidden', !(chat.isOwner || chat.isAdmin || chat.adminPermissions?.manageAdmins));
        el('channelInviteBtn').classList.toggle('hidden', !chat.isOwner);
        el('channelLeaveBtn').classList.toggle('hidden', Boolean(chat.isOwner));
        el('voiceStartBtn').classList.toggle('hidden', !(chat.isOwner || chat.adminPermissions?.voiceChat));
        el('voiceLeaveBtn').classList.add('hidden');
        el('voiceJoinBtn').classList.toggle('hidden', !chat.voiceActive);
        el('voiceStatus').textContent = chat.voiceActive ? 'Голосовой чат активен' : '';
      }
    }
  }

  let voiceChatId = null;
  let voiceStream = null;
  let voiceIsHost = false;
  const voicePeers = new Map();
  async function startVoiceChat() {
    const chat = state.activeChat;
    if (!chat || chat.type !== 'channel' || !state.socket) return;
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      voiceChatId = chat.id;
      voiceIsHost = true;
      el('voiceStartBtn').classList.add('hidden');
      el('voiceLeaveBtn').classList.remove('hidden');
      el('voiceStatus').textContent = 'Подключение к голосовому чату…';
      state.socket.emit('voice:start', { chatId: chat.id });
    } catch (e) { el('voiceStatus').textContent = 'Нет доступа к микрофону: ' + e.message; }
  }
  async function joinVoiceChat() {
    const chat=state.activeChat;if(!chat||chat.type!=='channel')return;
    try { voiceStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false}); voiceChatId=chat.id;voiceIsHost=false;el('voiceJoinBtn').classList.add('hidden');el('voiceStartBtn').classList.add('hidden');el('voiceLeaveBtn').classList.remove('hidden');el('voiceStatus').textContent='Подключение…';state.socket.emit('voice:join',{chatId:chat.id}); }
    catch(e){el('voiceStatus').textContent='Нет доступа к микрофону: '+e.message;}
  }
  function getVoicePeer(peerId) {
    if (voicePeers.has(peerId)) return voicePeers.get(peerId);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    voicePeers.set(peerId, pc);
    if (voiceStream) voiceStream.getTracks().forEach(track => pc.addTrack(track, voiceStream));
    pc.onicecandidate = e => { if(e.candidate && voiceChatId) state.socket.emit('voice:ice',{to:peerId,chatId:voiceChatId,candidate:e.candidate}); };
    pc.ontrack = e => { let audio=el('voiceAudios').querySelector('[data-peer="'+CSS.escape(peerId)+'"]'); if(!audio){audio=document.createElement('audio');audio.autoplay=true;audio.dataset.peer=peerId;el('voiceAudios').appendChild(audio);} audio.srcObject=e.streams[0]; };
    pc.onconnectionstatechange = () => { if(['failed','closed','disconnected'].includes(pc.connectionState)) closeVoicePeer(peerId); };
    return pc;
  }
  async function createVoiceOffer(peerId) {
    try { const pc=getVoicePeer(peerId); const offer=await pc.createOffer(); await pc.setLocalDescription(offer); state.socket.emit('voice:offer',{to:peerId,chatId:voiceChatId,offer:pc.localDescription}); } catch(e){ console.warn('Voice offer failed',e); }
  }
  function closeVoicePeer(peerId) { const pc=voicePeers.get(peerId); if(pc){pc.close();voicePeers.delete(peerId);} const audio=el('voiceAudios').querySelector('[data-peer="'+CSS.escape(peerId)+'"]');if(audio)audio.remove(); }
  function leaveVoiceLocal() {
    if(voiceChatId && state.socket) state.socket.emit('voice:leave',{chatId:voiceChatId});
    voicePeers.forEach((pc,id)=>{pc.close();});voicePeers.clear();
    if(voiceStream) voiceStream.getTracks().forEach(t=>t.stop());voiceStream=null;
    el('voiceAudios').innerHTML='';el('voiceLeaveBtn').classList.add('hidden');
    const chat=state.activeChat;el('voiceStartBtn').classList.toggle('hidden',!(chat && (chat.isOwner || chat.adminPermissions?.voiceChat)));
    el('voiceJoinBtn').classList.toggle('hidden',!(chat && chat.type === 'channel'));
    voiceChatId=null;voiceIsHost=false;
  }
  el('channelAdminsOpenBtn').addEventListener('click',()=>{if(state.activeChat)openChannelAdmins(state.activeChat);});
  el('channelInviteBtn').addEventListener('click',async()=>{const chat=state.activeChat;if(!chat||chat.type!=='channel'||!chat.isOwner)return;try{const d=await api('/channels/'+encodeURIComponent(chat.id)+'/invite');const link=location.origin+d.link;try{await navigator.clipboard.writeText(link);alert('Ссылка-приглашение скопирована:\n'+link);}catch(_){prompt('Скопируй ссылку-приглашение:',link);}}catch(e){alert(e.message);}});
  el('channelLeaveBtn').addEventListener('click',async()=>{const chat=state.activeChat;if(!chat||chat.type!=='channel'||chat.isOwner)return;if(!confirm('Отписаться от канала «'+chat.title+'»?'))return;try{await api('/channels/'+encodeURIComponent(chat.id)+'/leave',{method:'POST'});state.activeChat=null;el('chatView').classList.add('hidden');el('emptyState').classList.remove('hidden');document.getElementById('app').classList.remove('chat-open');await loadChats();}catch(e){alert(e.message);}});
  el('voiceStartBtn').addEventListener('click',startVoiceChat);
  el('voiceJoinBtn').addEventListener('click',joinVoiceChat);
  el('voiceLeaveBtn').addEventListener('click',()=>{if(voiceChatId && voiceIsHost)state.socket.emit('voice:stop',{chatId:voiceChatId});leaveVoiceLocal();});

  async function openChannelAdmins(chat) {
    el('channelAdminsError').textContent = '';
    try {
      const [membersData, adminsData] = await Promise.all([
        api('/chats/' + encodeURIComponent(chat.id) + '/members'),
        api('/channels/' + encodeURIComponent(chat.id) + '/admins')
      ]);
      const members = membersData.members || [];
      const admins = adminsData.admins || [];
      const select = el('channelAdminUser');
      select.innerHTML = '';
      members.filter(m => String(m.id) !== String(chat.ownerId)).forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = (m.name || m.username || 'Пользователь') + (admins.some(a => String(a.userId) === String(m.id)) ? ' · администратор' : '');
        select.appendChild(option);
      });
      el('channelAdminSaveBtn').disabled = !adminsData.canManage || !select.options.length;
      el('channelAdminSaveBtn').title = adminsData.canManage ? '' : 'Нет разрешения назначать администраторов';
      const list = el('channelAdminsList');
      list.innerHTML = '<strong>Текущие администраторы</strong>';
      if (!admins.length) list.innerHTML += '<p>Пока нет назначенных администраторов.</p>';
      admins.forEach(admin => {
        const row = document.createElement('div');
        row.className = 'channel-admin-row';
        const label = document.createElement('span');
        label.textContent = admin.name + ' (@' + admin.username + ')';
        row.appendChild(label);
        if (adminsData.canManage) {
          const remove = document.createElement('button');
          remove.type = 'button'; remove.className = 'btn-secondary'; remove.textContent = 'Снять';
          remove.addEventListener('click', async () => {
            try {
              await api('/channels/' + encodeURIComponent(chat.id) + '/admins/' + encodeURIComponent(admin.userId), { method: 'DELETE' });
              await openChannelAdmins(chat);
            } catch (e) { el('channelAdminsError').textContent = e.message; }
          });
          row.appendChild(remove);
        }
        list.appendChild(row);
      });
      select.onchange = () => {
        const admin = admins.find(x => String(x.userId) === String(select.value));
        document.querySelectorAll('[data-admin-permission]').forEach(input => {
          input.checked = admin ? Boolean(admin.permissions && admin.permissions[input.dataset.adminPermission]) : input.dataset.adminPermission === 'publishMessages';
        });
      };
      select.dispatchEvent(new Event('change'));
      document.querySelectorAll('[data-admin-permission]').forEach(input => { input.disabled = !adminsData.canManage; });
      el('channelAdminsModal').classList.remove('hidden');
    } catch (e) { alert(e.message); }
  }
  el('channelAdminSaveBtn').addEventListener('click', async () => {
    const chat = state.activeChat;
    if (!chat || chat.type !== 'channel') return;
    const userId = el('channelAdminUser').value;
    if (!userId) { el('channelAdminsError').textContent = 'В канале пока нет подходящих участников.'; return; }
    const permissions = {};
    document.querySelectorAll('[data-admin-permission]').forEach(input => permissions[input.dataset.adminPermission] = input.checked);
    try {
      await api('/channels/' + encodeURIComponent(chat.id) + '/admins', { method: 'POST', body: { userId, permissions } });
      await openChannelAdmins(chat);
    } catch (e) { el('channelAdminsError').textContent = e.message; }
  });

  el('chatBackBtn').addEventListener('click', () => {
    document.getElementById('app').classList.remove('chat-open');
    el('chatView').classList.add('hidden');
    el('emptyState').classList.remove('hidden');
    state.activeChat = null;
    renderChatList();
  });

  // ---------- Открытие чата ----------
  async function openChat(chatId) {
    el('messageInput').placeholder = 'Сообщение';
    const data = await api('/chats/' + chatId + '/messages');
    state.activeChat = data.chat;
    document.getElementById('app').classList.add('chat-open');
    el('emptyState').classList.add('hidden');
    el('chatView').classList.remove('hidden');
    renderChatHeader(data.chat);
    el('chatSubtitle').textContent = data.chat.type === 'channel' ? ((data.chat.username ? '@'+data.chat.username+' · ' : '') + (data.chat.subscriberCount || 1) + ' подписчиков') : (data.chat.type === 'direct' ? directUserStatus(data.chat.directUser) : '');
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
    div.dataset.messageId = msg.id;
    const isChannel = state.activeChat && state.activeChat.type === 'channel';
    const canEdit = isChannel ? (state.activeChat.isOwner || state.activeChat.adminPermissions?.editMessages) : mine;
    const canDelete = isChannel ? (state.activeChat.isOwner || state.activeChat.adminPermissions?.deleteMessages) : mine;
    div.innerHTML = `
      ${!mine && state.activeChat && state.activeChat.type === 'group' ? `<div class="sender">${escapeHtml(msg.senderName)}</div>` : ''}
      <div class="text">${escapeHtml(msg.text || '')}</div>
      <div class="attachment-content"></div>
      <div class="meta">${formatTime(msg.createdAt)}${msg.editedAt ? ' · изменено' : ''}${mine ? ' ✓' : ''}</div>
      ${(canEdit || canDelete) ? '<div class="message-actions"></div>' : ''}`;
    if (msg.attachment && /^data:(image|video|audio)\//.test(msg.attachment.data || '')) {
      const wrap = div.querySelector('.attachment-content');
      const mime = String(msg.attachment.mime || '');
      let media;
      if (mime.startsWith('image/')) { media = document.createElement('img'); media.className = 'chat-attachment-image'; media.alt = msg.attachment.name || 'Фото'; media.loading = 'lazy'; media.src = msg.attachment.data; }
      else if (mime.startsWith('video/')) { media = document.createElement('video'); media.className = 'chat-attachment-media'; media.controls = true; media.preload = 'metadata'; media.src = msg.attachment.data; }
      else { media = document.createElement('audio'); media.className = 'chat-attachment-audio'; media.controls = true; media.preload = 'metadata'; media.src = msg.attachment.data; }
      wrap.appendChild(media);
      if (msg.attachment.name) { const label = document.createElement('div'); label.className = 'attachment-name'; label.textContent = msg.attachment.name; wrap.appendChild(label); }
    } else if (msg.attachment && msg.attachment.data) {
      const link = document.createElement('a'); link.className = 'chat-attachment-file'; link.href = msg.attachment.data; link.download = msg.attachment.name || 'file'; link.textContent = '📎 ' + (msg.attachment.name || 'Скачать файл'); div.querySelector('.attachment-content').appendChild(link);
    }
    const actions = div.querySelector('.message-actions');
    if (actions) {
      if (canEdit) {
        const edit = document.createElement('button'); edit.type='button'; edit.textContent='Изменить';
        edit.addEventListener('click', () => {
          const next = prompt('Изменить сообщение', msg.text);
          if (next !== null && next.trim()) state.socket.emit('message:edit', { chatId: state.activeChat.id, messageId: msg.id, text: next.trim() });
        }); actions.appendChild(edit);
      }
      if (canDelete) {
        const del = document.createElement('button'); del.type='button'; del.textContent='Удалить';
        del.addEventListener('click', () => { if (confirm('Удалить это сообщение?')) state.socket.emit('message:delete', { chatId: state.activeChat.id, messageId: msg.id }); });
        actions.appendChild(del);
      }
    }
    el('messages').appendChild(div);
  }

  function scrollMessagesToBottom() {
    const box = el('messages');
    box.scrollTop = box.scrollHeight;
  }

  async function sendChatPayload(payload) {
    if (!state.activeChat || !state.socket) return;
    if (state.activeChat.type === 'channel' && !state.activeChat.canPost) { alert('У вас нет права отправлять сообщения в этом канале.'); return; }
    state.socket.emit('message:send', { chatId: state.activeChat.id, ...payload });
  }
  el('sendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = el('messageInput');
    const text = input.value.trim();
    if (!text || !state.activeChat) return;
    await sendChatPayload({ text });
    input.value = '';
  });

  const attachmentInput = document.getElementById('attachmentInput');
  const attachmentButton = document.getElementById('attachmentButton');
  const voiceButton = document.getElementById('voiceMessageButton');
  let recording = null, recordingChunks = [];
  attachmentButton?.addEventListener('click', () => {
    if (!state.activeChat) { alert('Сначала откройте чат.'); return; }
    if (state.activeChat.type === 'channel' && !state.activeChat.canPost) { alert('У вас нет права отправлять сообщения в этом канале.'); return; }
    attachmentInput.click();
  });
  attachmentInput?.addEventListener('change', async () => {
    const file = attachmentInput.files && attachmentInput.files[0];
    attachmentInput.value = '';
    if (!file || !state.activeChat) return;
    if (file.size > 30 * 1024 * 1024) { alert('Фото или видео должно быть не больше 30 МБ.'); return; }
    const allowed = /^image\/(jpeg|png|gif|webp|avif|heic|heif|bmp)$/.test(file.type) || /^video\/(mp4|webm|quicktime|x-matroska|3gpp|x-msvideo|mpeg|ogg)$/.test(file.type);
    if (!allowed) { alert('Можно отправлять только фото и видео.'); return; }
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Не удалось прочитать файл.')); reader.readAsDataURL(file); });
      await sendChatPayload({ text: '', attachment: { name: file.name, mime: file.type || 'application/octet-stream', data } });
    } catch (err) { alert(err.message || 'Не удалось отправить файл.'); }
  });
  voiceButton?.addEventListener('click', async () => {
    if (recording) { recording.stop(); voiceButton.textContent = '🎙️ Голосовое'; return; }
    if (!state.activeChat) { alert('Сначала откройте чат.'); return; }
    if (state.activeChat.type === 'channel' && !state.activeChat.canPost) { alert('У вас нет права отправлять сообщения в этом канале.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { alert('Запись голосовых не поддерживается этим браузером.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || '';
      recording = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingChunks = [];
      recording.ondataavailable = event => { if (event.data.size) recordingChunks.push(event.data); };
      recording.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(recordingChunks, { type: recording.mimeType || 'audio/webm' });
        recording = null; voiceButton.textContent = '🎙️ Голосовое';
        if (!blob.size) return;
        if (blob.size > 50 * 1024 * 1024) { alert('Голосовое слишком большое для отправки через текущий сервер (максимум 50 МБ).'); return; }
        try {
          const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Не удалось прочитать запись.')); reader.readAsDataURL(blob); });
          const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
          await sendChatPayload({ text: '', attachment: { name: 'Голосовое.' + ext, mime: blob.type || 'audio/webm', data } });
        } catch (err) { alert(err.message || 'Не удалось отправить голосовое.'); }
      };
      recording.start(); voiceButton.textContent = '⏹️ Остановить запись';
    } catch (err) { alert('Разрешите доступ к микрофону, чтобы записать голосовое.'); recording = null; voiceButton.textContent = '🎙️ Голосовое'; }
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
      history.replaceState({}, '', '/chats');
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
  const newDirectBtn = el('newDirectBtn');
  if (newDirectBtn) newDirectBtn.addEventListener('click', () => el('directModal').classList.remove('hidden'));
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
  const newGroupBtn = el('newGroupBtn');
  if (newGroupBtn) newGroupBtn.addEventListener('click', () => el('groupModal').classList.remove('hidden'));
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
  // Меню по кнопке ⋮ закрывается и при клике вне его карточки.
  document.addEventListener('click', event => {
    const menu = el('moreModal');
    if (!menu || menu.classList.contains('hidden')) return;
    if (!menu.querySelector('.modal-card').contains(event.target) &&
        event.target !== el('moreOpenBtn') &&
        !el('moreOpenBtn').contains(event.target)) {
      menu.classList.add('hidden');
    }
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
  const privacyOpenBtn = el('privacyOpenBtn');
  if (privacyOpenBtn) {
    privacyOpenBtn.addEventListener('click', () => {
      loadPrivacySettings();
      el('twoFactorEnabledInput').checked = Boolean(state.me && state.me.twoFactorEnabled);
      el('privacyModal').classList.remove('hidden');
    });
  }
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

  // ---------- Плавающее объявление официального Telegram-канала ----------
  const telegramPromo = el('officialTelegramPromo');
  const closeTelegramPromo = el('closeTelegramPromo');
  if (telegramPromo && closeTelegramPromo) {
    if (localStorage.getItem('nevogramTelegramPromoDismissed') === '1') telegramPromo.classList.add('hidden');
    closeTelegramPromo.addEventListener('click', () => {
      telegramPromo.classList.add('hidden');
      localStorage.setItem('nevogramTelegramPromoDismissed', '1');
    });
  }

  tryResumeSession();
})();
