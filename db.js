// Простое файловое хранилище (JSON). Для 100 пользователей этого достаточно.
// Все записи кешируются в памяти и сохраняются на диск после каждого изменения.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function defaultState() {
  return {
    users: [],        // { id, email, codeHash, name, createdAt }
    invites: [],       // { id, codeHash, codePreview, used, usedByUserId, createdAt }
    chats: [],          // { id, type: 'direct'|'group', name, memberIds: [], createdAt }
    messages: []         // { id, chatId, senderId, text, createdAt, readBy: [userId] }
  };
}

let state;
try {
  state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  state = defaultState();
}

let saveTimer = null;
function save() {
  // Небольшая задержка, чтобы не писать на диск при каждом чихе, если идёт много операций подряд
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  }, 50);
}

module.exports = { state, save };
