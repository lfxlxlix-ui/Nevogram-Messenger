(() => {
  const state = {
    token: localStorage.getItem('token') || null,
    me: null,
    chats: [],
    activeChat: null,
    socket: null
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

  // ---------- Вход по почте и одноразовому коду ----------
  let pendingLoginEmail = '';
  el('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    el('authError').textContent = '';
    const email = el('emailInput').value.trim().toLowerCase();
    try {
      await api('/auth/request-code', { method: 'POST', body: { email } });
      pendingLoginEmail = email;
      el('codeEmailLabel').textContent = email;
      el('emailStep').classList.add('hidden');
      el('codeStep').classList.remove('hidden');
      el('loginCodeInput').focus();
    } catch (err) {
      el('authError').textContent = err.message;
    }
  });

  el('verifyCodeBtn').addEventListener('click', async () => {
    el('authError').textContent = '';
    try {
      const data = await api('/auth/verify-code', { method: 'POST', body: { email: pendingLoginEmail, code: el('loginCodeInput').value.trim() } });
      state.token = data.token;
      localStorage.setItem('token', data.token);
      state.me = data.user;
      startApp();
    } catch (err) {
      el('authError').textContent = err.message;
    }
  });
  el('loginCodeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el('verifyCodeBtn').click(); } });
  el('changeEmailBtn').addEventListener('click', () => {
    el('codeStep').classList.add('hidden');
    el('emailStep').classList.remove('hidden');
    el('loginCodeInput').value = '';
    el('authError').textContent = '';
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
    el('authScreen').classList.add('hidden');
    el('app').classList.remove('hidden');
    el('meName').textContent = state.me.name + ' · ' + state.me.email;
    connectSocket();
    loadChats();
  }

  // ---------- Сокет ----------
  function connectSocket() {
    state.socket = io({ auth: { token: state.token } });

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
    el('privacyModal').classList.remove('hidden');
  });
  el('privacySaveBtn').addEventListener('click', savePrivacySettings);
\n  // ---------- Утилиты ----------
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
