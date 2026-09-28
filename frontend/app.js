// ═══════════════════════════════════════════════════════
//  ChitChat — Full-Featured Client
// ═══════════════════════════════════════════════════════
// Backend server URL configuration (configurable for standalone Netlify deployments)
const BACKEND_URL = (typeof window.__CHITCHAT_BACKEND_URL__ !== 'undefined' && window.__CHITCHAT_BACKEND_URL__)
  ? window.__CHITCHAT_BACKEND_URL__
  : (localStorage.getItem('chitchat_backend_url') || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '3000' ? 'http://localhost:3000' : ''));

const socket = (typeof io !== 'undefined')
  ? io(BACKEND_URL || window.location.origin, { transports: ['websocket', 'polling'] })
  : { on: () => {}, emit: () => {}, disconnect: () => {}, connect: () => {} };

function api(endpoint) {
  const base = BACKEND_URL ? BACKEND_URL.replace(/\/$/, '') : '';
  return `${base}${endpoint}`;
}

// ── State ──────────────────────────────────────────────
let currentUser   = { id: null, username: '', email: '', avatar: '🚀', status: 'online' };
let currentRoom   = 'general';
let replyTo       = null;
let editingMsgId  = null;
let pendingImage  = null;
let isSoundOn     = true;
let typingTimer   = null;
let authToken     = localStorage.getItem('chitchat_token') || null;
let unreadCounts  = {};
let allRooms      = [];
let mediaGallery  = {};    // room => [imgUrl, ...]
let selectedProfileAvatar = '🚀';

const roomDescriptions = {
  general: 'Main community chat & announcements',
  lounge: 'Chill & hangout space',
  'tech-talk': 'Code & dev discussions',
  random: 'Memes, links & banter',
  'music-lounge': 'Music, playlists & vibes'
};

// ── DOM helpers ────────────────────────────────────────
const $ = id => document.getElementById(id);

// Auth
const loginModal       = $('login-modal');
const tabLoginBtn      = $('tab-login-btn');
const tabRegisterBtn   = $('tab-register-btn');
const authErrorBox     = $('auth-error-box');
const loginForm        = $('login-form');
const loginId          = $('login-identifier');
const loginPass        = $('login-password');
const registerForm     = $('register-form');
const regUsername      = $('reg-username');
const regEmail         = $('reg-email');
const regPassword      = $('reg-password');
const avatarGrid       = $('avatar-grid');

// App
const appContainer     = $('app-container');
const sidebar          = $('sidebar');
const channelList      = $('channel-list');
const usersList        = $('users-list');
const onlineCount      = $('online-count');
const currentRoomTitle = $('current-room-title');
const currentRoomDesc  = $('current-room-desc');
const bannerRoomName   = $('banner-room-name');
const bannerRoomSub    = $('banner-room-sub');
const currentUserAvatar= $('current-user-avatar');
const currentUserName  = $('current-user-name');
const currentUserEmail = $('current-user-email');
const logoutBtn        = $('logout-btn');
const editProfileBtn   = $('edit-profile-btn');
const messagesContainer= $('messages-container');
const messagesList     = $('messages-list');
const typingIndicator  = $('typing-indicator');
const typingText       = $('typing-text');
const chatForm         = $('chat-form');
const chatInput        = $('chat-input');
const imageInput       = $('image-input');
const imagePreviewBar  = $('image-preview-bar');
const imagePreviewThumb= $('image-preview-thumb');
const removeImageBtn   = $('remove-image-btn');
const emojiBtn         = $('emoji-btn');
const emojiPicker      = $('emoji-picker');
const gifBtn           = $('gif-btn');
const gifPicker        = $('gif-picker');
const gifSearchInput   = $('gif-search-input');
const gifSearchBtn     = $('gif-search-btn');
const gifGrid          = $('gif-grid');
const pollBtn          = $('poll-btn');
const replyBanner      = $('reply-banner');
const replyUsername    = $('reply-username');
const replySnippet     = $('reply-snippet');
const cancelReplyBtn   = $('cancel-reply-btn');
const editBanner       = $('edit-banner');
const editSnippet      = $('edit-snippet');
const cancelEditBtn    = $('cancel-edit-btn');
const searchInput      = $('search-input');
const themeToggleBtn   = $('theme-toggle-btn');
const themeIcon        = $('theme-icon');
const soundToggleBtn   = $('sound-toggle-btn');
const soundIcon        = $('sound-icon');
const notifBtn         = $('notif-btn');
const notifIcon        = $('notif-icon');
const pinnedBtn        = $('pinned-btn');
const pinnedPanel      = $('pinned-panel');
const pinnedList       = $('pinned-list');
const galleryBtn       = $('gallery-btn');
const galleryPanel     = $('gallery-panel');
const galleryGrid      = $('gallery-grid');
const mentionToast     = $('mention-toast');
const mentionToastText = $('mention-toast-text');
const mentionAutocomplete = $('mention-autocomplete');
const profileModal     = $('profile-modal');
const profileForm      = $('profile-form');
const profileStatus    = $('profile-status');
const profileCurrentPass = $('profile-current-pass');
const profileNewPass   = $('profile-new-pass');
const profileAvatarGrid= $('profile-avatar-grid');
const createChannelModal = $('create-channel-modal');
const createChannelForm  = $('create-channel-form');
const newChannelName     = $('new-channel-name');
const newChannelDesc     = $('new-channel-desc');
const createChannelError = $('create-channel-error');
const pollModal        = $('poll-modal');
const pollForm         = $('poll-form');
const pollQuestion     = $('poll-question');
const pollOptionsContainer = $('poll-options-container');
const addPollOptionBtn = $('add-poll-option-btn');

// ── Web Audio ─────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSound(type) {
  if (!isSoundOn) return;
  try {
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    if (type === 'send')    { osc.type='sine'; osc.frequency.setValueAtTime(600,t); osc.frequency.exponentialRampToValueAtTime(1200,t+.08); gain.gain.setValueAtTime(.15,t); gain.gain.exponentialRampToValueAtTime(.01,t+.08); osc.start(t); osc.stop(t+.08); }
    if (type === 'receive') { osc.type='sine'; osc.frequency.setValueAtTime(523,t); osc.frequency.setValueAtTime(659,t+.08); gain.gain.setValueAtTime(.12,t); gain.gain.exponentialRampToValueAtTime(.01,t+.2); osc.start(t); osc.stop(t+.2); }
    if (type === 'pop')     { osc.type='triangle'; osc.frequency.setValueAtTime(400,t); gain.gain.setValueAtTime(.08,t); gain.gain.exponentialRampToValueAtTime(.01,t+.04); osc.start(t); osc.stop(t+.04); }
    if (type === 'mention') { osc.type='sine'; osc.frequency.setValueAtTime(880,t); osc.frequency.exponentialRampToValueAtTime(1100,t+.1); gain.gain.setValueAtTime(.2,t); gain.gain.exponentialRampToValueAtTime(.01,t+.15); osc.start(t); osc.stop(t+.15); }
  } catch {}
}

// ── Auth UI ───────────────────────────────────────────
tabLoginBtn.addEventListener('click', () => {
  tabLoginBtn.classList.add('active'); tabRegisterBtn.classList.remove('active');
  loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
  hideError(authErrorBox);
});
tabRegisterBtn.addEventListener('click', () => {
  tabRegisterBtn.classList.add('active'); tabLoginBtn.classList.remove('active');
  registerForm.classList.remove('hidden'); loginForm.classList.add('hidden');
  hideError(authErrorBox);
});

avatarGrid.addEventListener('click', e => {
  const btn = e.target.closest('.avatar-opt'); if (!btn) return;
  avatarGrid.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentUser.avatar = btn.dataset.avatar;
  playSound('pop');
});

function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function hideError(el) { el.classList.add('hidden'); el.textContent = ''; }
function showSuccess(el, msg) { el.textContent = msg; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 3000); }

// Register
registerForm.addEventListener('submit', async e => {
  e.preventDefault(); hideError(authErrorBox);
  const btn = $('register-submit-btn');
  btn.textContent = 'Creating account...'; btn.disabled = true;
  try {
    const res = await fetch(api('/api/auth/register'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: regUsername.value.trim(), email: regEmail.value.trim(), password: regPassword.value, avatar: currentUser.avatar }) });
    const data = await res.json();
    if (!res.ok) return showError(authErrorBox, data.error);
    authToken = data.token;
    localStorage.setItem('chitchat_token', authToken);
    currentUser = { ...data.user };
    initSession();
  } catch { showError(authErrorBox, 'Network error.'); }
  finally { btn.textContent = 'Create Account'; btn.disabled = false; }
});

// Login
loginForm.addEventListener('submit', async e => {
  e.preventDefault(); hideError(authErrorBox);
  const btn = $('login-submit-btn');
  btn.textContent = 'Logging in...'; btn.disabled = true;
  try {
    const res = await fetch(api('/api/auth/login'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ emailOrUsername: loginId.value.trim(), password: loginPass.value }) });
    const data = await res.json();
    if (!res.ok) return showError(authErrorBox, data.error);
    authToken = data.token;
    localStorage.setItem('chitchat_token', authToken);
    currentUser = { ...data.user };
    initSession();
  } catch { showError(authErrorBox, 'Network error.'); }
  finally { btn.textContent = 'Log In to Workspace'; btn.disabled = false; }
});

// Auto-login
async function checkSession() {
  if (!authToken) return;
  try {
    const res = await fetch(api('/api/auth/me'), { headers: { Authorization: `Bearer ${authToken}` } });
    if (res.ok) { const d = await res.json(); currentUser = d.user; initSession(); }
    else { localStorage.removeItem('chitchat_token'); authToken = null; }
  } catch {}
}
checkSession();

function initSession() {
  loginModal.classList.add('hidden');
  appContainer.classList.remove('hidden');
  currentUserName.textContent = currentUser.username;
  currentUserAvatar.textContent = currentUser.avatar || '🚀';
  currentUserEmail.textContent = currentUser.email || '';
  selectedProfileAvatar = currentUser.avatar || '🚀';
  loadRooms();
  requestNotifPermission();
  socket.emit('login', currentUser);
}

// Logout
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('chitchat_token'); authToken = null;
  currentUser = { id: null, username: '', email: '', avatar: '🚀', status: 'online' };
  socket.disconnect(); socket.connect();
  appContainer.classList.add('hidden');
  loginModal.classList.remove('hidden');
  loginForm.reset(); registerForm.reset(); hideError(authErrorBox);
  messagesList.innerHTML = ''; unreadCounts = {};
});

// ── Profile Edit ──────────────────────────────────────
editProfileBtn.addEventListener('click', () => {
  profileStatus.value = currentUser.status || 'online';
  profileCurrentPass.value = ''; profileNewPass.value = '';
  hideError($('profile-error-box')); hideError($('profile-success-box'));
  // Mark current avatar active
  profileAvatarGrid.querySelectorAll('.avatar-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.avatar === currentUser.avatar);
  });
  selectedProfileAvatar = currentUser.avatar;
  profileModal.classList.remove('hidden');
});

profileAvatarGrid.addEventListener('click', e => {
  const btn = e.target.closest('.avatar-opt'); if (!btn) return;
  profileAvatarGrid.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedProfileAvatar = btn.dataset.avatar;
  playSound('pop');
});

$('profile-modal-close').addEventListener('click', () => profileModal.classList.add('hidden'));

profileForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideError($('profile-error-box'));
  try {
    const body = { avatar: selectedProfileAvatar, status: profileStatus.value };
    if (profileNewPass.value) { body.currentPassword = profileCurrentPass.value; body.newPassword = profileNewPass.value; }
    const res = await fetch(api('/api/auth/profile'), { method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${authToken}`}, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return showError($('profile-error-box'), data.error);
    if (data.token) { authToken = data.token; localStorage.setItem('chitchat_token', authToken); }
    currentUser = { ...currentUser, ...data.user };
    currentUserAvatar.textContent = currentUser.avatar;
    currentUserName.textContent = currentUser.username;
    socket.emit('update status', currentUser.status);
    showSuccess($('profile-success-box'), '✅ Profile updated!');
  } catch { showError($('profile-error-box'), 'Network error.'); }
});

// ── Load Rooms ────────────────────────────────────────
async function loadRooms() {
  try {
    const res = await fetch(api('/api/rooms'), { headers: { Authorization: `Bearer ${authToken}` } });
    const data = await res.json();
    allRooms = data.rooms || [];
    // Render custom channels not in built-in list
    allRooms.filter(r => r.isCustom).forEach(r => addChannelToSidebar(r.name));
  } catch {}
}

function addChannelToSidebar(roomName) {
  if (channelList.querySelector(`[data-room="${roomName}"]`)) return;
  const btn = document.createElement('button');
  btn.className = 'channel-btn';
  btn.dataset.room = roomName;
  btn.innerHTML = `<span class="channel-hash">#</span><span class="channel-name">${roomName}</span><span class="unread-badge hidden" data-room="${roomName}">0</span>`;
  btn.addEventListener('click', () => switchRoom(roomName, btn));
  channelList.appendChild(btn);
  unreadCounts[roomName] = 0;
  if (!mediaGallery[roomName]) mediaGallery[roomName] = [];
}

// ── Create Channel ────────────────────────────────────
$('open-create-channel-btn').addEventListener('click', () => { createChannelModal.classList.remove('hidden'); newChannelName.focus(); });
$('create-channel-close').addEventListener('click', () => createChannelModal.classList.add('hidden'));
createChannelForm.addEventListener('submit', async e => {
  e.preventDefault(); hideError(createChannelError);
  try {
    const res = await fetch(api('/api/rooms'), { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${authToken}`}, body: JSON.stringify({ name: newChannelName.value.trim(), description: newChannelDesc.value.trim() }) });
    const data = await res.json();
    if (!res.ok) return showError(createChannelError, data.error);
    addChannelToSidebar(data.room.name);
    createChannelForm.reset();
    createChannelModal.classList.add('hidden');
    switchRoom(data.room.name, channelList.querySelector(`[data-room="${data.room.name}"]`));
  } catch { showError(createChannelError, 'Network error.'); }
});

// ── Channel Switching ─────────────────────────────────
channelList.querySelectorAll('.channel-btn').forEach(btn => {
  btn.addEventListener('click', () => switchRoom(btn.dataset.room, btn));
});

function switchRoom(room, btn) {
  if (room === currentRoom) return;
  channelList.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  currentRoom = room;
  updateRoomHeader(room);
  resetUnread(room);
  socket.emit('switch room', room);
  playSound('pop');
  sidebar.classList.remove('open');
  if (!mediaGallery[room]) mediaGallery[room] = [];
}

socket.on('login success', d => {
  renderHistory(d.history);
  renderUsers(d.roomUsers);
  renderPinnedPanel(d.pinnedMessages || []);
});
socket.on('room switched', d => {
  renderHistory(d.history);
  renderUsers(d.roomUsers);
  renderPinnedPanel(d.pinnedMessages || []);
});

function updateRoomHeader(room) {
  currentRoomTitle.innerHTML = `<span class="hash">#</span>${room}`;
  currentRoomDesc.textContent = roomDescriptions[room] || 'Community channel';
  bannerRoomName.textContent = `#${room}`;
  bannerRoomSub.textContent = `#${room}`;
  chatInput.placeholder = `Message #${room}... (use @username to mention)`;
}

// ── Users ─────────────────────────────────────────────
function renderUsers(users) {
  usersList.innerHTML = '';
  onlineCount.textContent = users.length;
  users.forEach(u => {
    const statusLabel = { online:'online', away:'away', dnd:'dnd', offline:'offline' }[u.status] || 'online';
    const statusClass = { online:'status-online', away:'status-away', dnd:'status-dnd', offline:'status-offline' }[u.status] || 'status-online';
    const el = document.createElement('div');
    el.className = 'user-item';
    el.title = u.username;
    el.innerHTML = `<div class="user-avatar-badge">${u.avatar}</div><div class="user-name">${escapeHTML(u.username)}</div><div class="user-status-indicator"><span class="user-status-dot ${statusClass}"></span><span class="user-status-label">${statusLabel}</span></div>`;
    usersList.appendChild(el);
  });
}
socket.on('room users update', renderUsers);

// ── Messages ──────────────────────────────────────────
function renderHistory(history) {
  messagesList.innerHTML = '';
  if (!mediaGallery[currentRoom]) mediaGallery[currentRoom] = [];
  mediaGallery[currentRoom] = [];
  history.forEach(m => appendMessage(m, false));
  scrollToBottom();
}

socket.on('chat message', msg => {
  appendMessage(msg, true);
  const isSelf = msg.sender.username === currentUser.username;
  playSound(isSelf ? 'send' : 'receive');
  if (!isSelf && document.hidden) { incrementUnread(msg.room); }
  scrollToBottom();
  // Collect media
  if (msg.image) { if (!mediaGallery[msg.room]) mediaGallery[msg.room] = []; mediaGallery[msg.room].push(msg.image); }
});

socket.on('system message', m => { appendSystemMsg(m); scrollToBottom(); });

function appendSystemMsg(m) {
  const d = document.createElement('div');
  d.className = 'system-pill';
  d.innerHTML = `<span>${m.time}</span> ${escapeHTML(m.text)}`;
  messagesList.appendChild(d);
}

function appendMessage(msg, animate) {
  const isSelf = msg.sender.username === currentUser.username || msg.sender.id === socket.id;

  // Collect media
  if (msg.image && msg.room === currentRoom) {
    if (!mediaGallery[currentRoom]) mediaGallery[currentRoom] = [];
    if (!mediaGallery[currentRoom].includes(msg.image)) mediaGallery[currentRoom].push(msg.image);
  }

  const el = document.createElement('div');
  el.className = `message-item ${isSelf?'self':'other'} ${animate?'animate-in':''}`;
  el.dataset.id = msg.id;

  // Build reply context
  let replyHTML = '';
  if (msg.replyTo) {
    replyHTML = `<div class="msg-reply-context"><span class="reply-bar-line"></span><span class="reply-author">@${escapeHTML(msg.replyTo.username)}:</span><span class="reply-text">${escapeHTML(msg.replyTo.text||'Attachment')}</span></div>`;
  }

  // Parse markdown-like formatting and @mentions
  let bubbleContent = formatText(msg.text || '');

  // Image
  let imgHTML = '';
  if (msg.image) {
    imgHTML = `<div class="msg-image-wrap"><img src="${msg.image}" alt="Image" class="msg-image" loading="lazy"/></div>`;
  }

  // Poll
  let pollHTML = '';
  if (msg.poll) {
    pollHTML = renderPollHTML(msg.poll);
  }

  // Reactions
  const reactHTML = renderReactions(msg.id, msg.reactions);

  // Edit indicator
  const editedTag = msg.edited ? `<span class="edited-tag">(edited)</span>` : '';

  el.innerHTML = `
    <div class="msg-avatar">${msg.sender.avatar||'👤'}</div>
    <div class="msg-content-wrapper">
      <div class="msg-header">
        <span class="msg-author">${escapeHTML(msg.sender.username)}</span>
        <span class="msg-timestamp">${msg.time}</span>
        ${editedTag}
        ${msg.pinned ? '<span class="pin-tag">📌</span>' : ''}
      </div>
      ${replyHTML}
      <div class="msg-bubble">${bubbleContent}${imgHTML}${pollHTML}</div>
      <div class="reactions-bar" id="reactions-${msg.id}">${reactHTML}</div>
      <div class="msg-actions">
        <button class="action-btn react-quick" data-emoji="❤️" title="❤️">❤️</button>
        <button class="action-btn react-quick" data-emoji="👍" title="👍">👍</button>
        <button class="action-btn react-quick" data-emoji="😂" title="😂">😂</button>
        <button class="action-btn react-quick" data-emoji="🔥" title="🔥">🔥</button>
        <button class="action-btn reply-action-btn" title="Reply">↩️</button>
        <button class="action-btn pin-action-btn" title="Pin">📌</button>
        ${isSelf ? `<button class="action-btn edit-action-btn" title="Edit">✏️</button><button class="action-btn delete-action-btn" title="Delete">🗑️</button>` : ''}
      </div>
    </div>`;

  // Bind reactions
  el.querySelectorAll('.react-quick').forEach(btn => {
    btn.addEventListener('click', () => socket.emit('add reaction', { messageId: msg.id, emoji: btn.dataset.emoji }));
  });
  el.querySelector('.reply-action-btn').addEventListener('click', () => setReplyTo({ id: msg.id, username: msg.sender.username, text: msg.text || '[Image]' }));
  el.querySelector('.pin-action-btn').addEventListener('click', () => socket.emit('pin message', msg.id));
  if (isSelf) {
    el.querySelector('.edit-action-btn').addEventListener('click', () => startEdit(msg.id, msg.text));
    el.querySelector('.delete-action-btn').addEventListener('click', () => socket.emit('delete message', msg.id));
  }
  // Bind image click to fullscreen
  el.querySelectorAll('.msg-image').forEach(img => img.addEventListener('click', () => window.open(img.src, '_blank')));
  // Bind poll votes
  el.querySelectorAll('.poll-vote-btn').forEach(btn => {
    btn.addEventListener('click', () => socket.emit('vote poll', { pollId: btn.dataset.pollid, optionIndex: parseInt(btn.dataset.index) }));
  });

  messagesList.appendChild(el);
}

// ── Text formatting ───────────────────────────────────
function formatText(text) {
  let out = escapeHTML(text);
  // Bold **text**
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Strikethrough ~~text~~
  out = out.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Code `text`
  out = out.replace(/`(.+?)`/g, '<code class="inline-code">$1</code>');
  // Code block ```text```
  out = out.replace(/```([\s\S]+?)```/g, '<pre class="code-block"><code>$1</code></pre>');
  // @mentions
  out = out.replace(/@(\w+)/g, '<span class="mention-tag">@$1</span>');
  // URL detection
  out = out.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener" class="msg-link">$1</a>');
  return out;
}

// ── Reactions ─────────────────────────────────────────
function renderReactions(msgId, reactObj = {}) {
  let html = '';
  for (const [emoji, users] of Object.entries(reactObj)) {
    if (!users.length) continue;
    const mine = users.includes(currentUser.username);
    html += `<button class="reaction-pill${mine?' active':''}" data-msgid="${msgId}" data-emoji="${emoji}" title="${users.join(', ')}">${emoji} <span class="count">${users.length}</span></button>`;
  }
  return html;
}

socket.on('reaction updated', ({ messageId, reactions }) => {
  const bar = $(`reactions-${messageId}`);
  if (!bar) return;
  bar.innerHTML = renderReactions(messageId, reactions);
  bar.querySelectorAll('.reaction-pill').forEach(p => p.addEventListener('click', () => socket.emit('add reaction', { messageId, emoji: p.dataset.emoji })));
});

// ── Delete / Edit messages ────────────────────────────
socket.on('message deleted', ({ messageId }) => {
  const el = messagesList.querySelector(`[data-id="${messageId}"]`);
  if (el) { el.classList.add('animate-out'); setTimeout(() => el.remove(), 250); }
});

socket.on('message edited', ({ messageId, newText, edited }) => {
  const el = messagesList.querySelector(`[data-id="${messageId}"]`);
  if (!el) return;
  const bubble = el.querySelector('.msg-bubble');
  if (bubble) bubble.innerHTML = formatText(newText) + (el.querySelector('.msg-image-wrap')?.outerHTML || '');
  let tag = el.querySelector('.edited-tag');
  if (!tag) { tag = document.createElement('span'); tag.className = 'edited-tag'; el.querySelector('.msg-header').appendChild(tag); }
  tag.textContent = '(edited)';
});

function startEdit(msgId, currentText) {
  editingMsgId = msgId;
  editSnippet.textContent = currentText.substring(0, 60);
  chatInput.value = currentText;
  editBanner.classList.remove('hidden');
  chatInput.focus();
}

cancelEditBtn.addEventListener('click', () => { editingMsgId = null; editBanner.classList.add('hidden'); chatInput.value = ''; });

// ── Pinned Messages ───────────────────────────────────
socket.on('pin updated', ({ messageId, isPinned, pinnedMessages }) => {
  const el = messagesList.querySelector(`[data-id="${messageId}"]`);
  const header = el?.querySelector('.msg-header');
  // Update pin tag
  if (header) {
    let pt = header.querySelector('.pin-tag');
    if (isPinned && !pt) { pt = document.createElement('span'); pt.className = 'pin-tag'; pt.textContent = '📌'; header.appendChild(pt); }
    if (!isPinned && pt) pt.remove();
  }
  renderPinnedPanel(pinnedMessages);
});

function renderPinnedPanel(pinnedIds) {
  if (!pinnedIds?.length) { pinnedList.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:16px">No pinned messages yet.</p>'; return; }
  // Show pinned message text from DOM
  pinnedList.innerHTML = '';
  pinnedIds.forEach(msgId => {
    const el = messagesList.querySelector(`[data-id="${msgId}"]`);
    if (el) {
      const author = el.querySelector('.msg-author')?.textContent || '?';
      const bubble = el.querySelector('.msg-bubble')?.textContent?.substring(0, 80) || '[media]';
      const d = document.createElement('div');
      d.className = 'pinned-item';
      d.innerHTML = `<div class="pinned-author">📌 ${escapeHTML(author)}</div><div class="pinned-text">${escapeHTML(bubble)}</div>`;
      d.addEventListener('click', () => { el.scrollIntoView({ behavior:'smooth', block:'center' }); el.classList.add('highlight'); setTimeout(() => el.classList.remove('highlight'), 1500); pinnedPanel.classList.add('hidden'); });
      pinnedList.appendChild(d);
    }
  });
}

pinnedBtn.addEventListener('click', () => { pinnedPanel.classList.toggle('hidden'); galleryPanel.classList.add('hidden'); });
$('pinned-panel-close').addEventListener('click', () => pinnedPanel.classList.add('hidden'));

galleryBtn.addEventListener('click', () => {
  galleryGrid.innerHTML = '';
  const imgs = mediaGallery[currentRoom] || [];
  if (!imgs.length) { galleryGrid.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:16px">No media shared yet.</p>'; }
  else imgs.forEach(url => { const img = document.createElement('img'); img.src = url; img.className = 'gallery-img'; img.addEventListener('click', () => window.open(url, '_blank')); galleryGrid.appendChild(img); });
  galleryPanel.classList.toggle('hidden'); pinnedPanel.classList.add('hidden');
});
$('gallery-panel-close').addEventListener('click', () => galleryPanel.classList.add('hidden'));

// ── Polls ─────────────────────────────────────────────
pollBtn.addEventListener('click', () => pollModal.classList.remove('hidden'));
$('poll-modal-close').addEventListener('click', () => pollModal.classList.add('hidden'));

addPollOptionBtn.addEventListener('click', () => {
  const opts = pollOptionsContainer.querySelectorAll('.poll-option-input');
  if (opts.length >= 6) return;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'poll-option-input';
  inp.placeholder = `Option ${opts.length + 1}`;
  inp.style.marginTop = '8px';
  pollOptionsContainer.querySelector('.input-group').appendChild(inp);
});

pollForm.addEventListener('submit', e => {
  e.preventDefault();
  const question = pollQuestion.value.trim();
  const options = [...pollOptionsContainer.querySelectorAll('.poll-option-input')].map(i => i.value.trim()).filter(Boolean);
  if (options.length < 2) return;
  socket.emit('create poll', { question, options });
  pollForm.reset();
  pollOptionsContainer.querySelectorAll('.poll-option-input').forEach((inp, i) => { if (i > 1) inp.remove(); });
  pollModal.classList.add('hidden');
});

socket.on('poll created', poll => {
  // Insert poll as a pseudo-message
  const el = document.createElement('div');
  el.className = 'message-item other animate-in poll-message';
  el.dataset.pollid = poll.id;
  el.innerHTML = `<div class="msg-avatar">🗳️</div><div class="msg-content-wrapper"><div class="msg-header"><span class="msg-author">${escapeHTML(poll.createdBy)}</span><span class="msg-timestamp">${poll.time}</span></div><div class="msg-bubble">${renderPollHTML(poll)}</div></div>`;
  el.querySelectorAll('.poll-vote-btn').forEach(btn => btn.addEventListener('click', () => socket.emit('vote poll', { pollId: btn.dataset.pollid, optionIndex: parseInt(btn.dataset.index) })));
  messagesList.appendChild(el);
  scrollToBottom();
});

socket.on('poll updated', poll => {
  const el = messagesList.querySelector(`[data-pollid="${poll.id}"]`);
  if (!el) return;
  el.querySelector('.msg-bubble').innerHTML = renderPollHTML(poll);
  el.querySelectorAll('.poll-vote-btn').forEach(btn => btn.addEventListener('click', () => socket.emit('vote poll', { pollId: btn.dataset.pollid, optionIndex: parseInt(btn.dataset.index) })));
});

function renderPollHTML(poll) {
  const totalVotes = poll.options.reduce((s, o) => s + o.votes.length, 0);
  const optionsHTML = poll.options.map((o, i) => {
    const pct = totalVotes ? Math.round((o.votes.length / totalVotes) * 100) : 0;
    const voted = o.votes.includes(currentUser.username);
    return `<div class="poll-option ${voted?'voted':''}">
      <button class="poll-vote-btn ${voted?'active':''}" data-pollid="${poll.id}" data-index="${i}">${voted?'✓ ':''} ${escapeHTML(o.text)}</button>
      <div class="poll-bar"><div class="poll-fill" style="width:${pct}%"></div></div>
      <span class="poll-pct">${pct}% (${o.votes.length})</span>
    </div>`;
  }).join('');
  return `<div class="poll-card"><div class="poll-question">🗳️ ${escapeHTML(poll.question)}</div>${optionsHTML}<div class="poll-total">${totalVotes} total vote${totalVotes!==1?'s':''}</div></div>`;
}

// ── Reply ─────────────────────────────────────────────
function setReplyTo(info) {
  replyTo = info;
  replyUsername.textContent = info.username;
  replySnippet.textContent = info.text.substring(0, 50);
  replyBanner.classList.remove('hidden');
  chatInput.focus();
}
cancelReplyBtn.addEventListener('click', () => { replyTo = null; replyBanner.classList.add('hidden'); });

// ── Send message ──────────────────────────────────────
chatForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text && !pendingImage) return;

  if (editingMsgId) {
    socket.emit('edit message', { messageId: editingMsgId, newText: text });
    editingMsgId = null; editBanner.classList.add('hidden');
  } else {
    socket.emit('chat message', { text, image: pendingImage, replyTo });
  }
  chatInput.value = ''; pendingImage = null; imageInput.value = '';
  imagePreviewBar.classList.add('hidden');
  replyTo = null; replyBanner.classList.add('hidden');
  socket.emit('stop typing'); clearTimeout(typingTimer);
  mentionAutocomplete.classList.add('hidden');
});

// ── Typing ────────────────────────────────────────────
chatInput.addEventListener('input', () => {
  socket.emit('typing');
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit('stop typing'), 2000);
  handleMentionAutocomplete();
});
socket.on('user typing', ({ username, id }) => {
  if (id === socket.id) return;
  typingText.textContent = `${username} is typing...`;
  typingIndicator.classList.remove('hidden');
});
socket.on('user stop typing', () => typingIndicator.classList.add('hidden'));

// ── @mention autocomplete ─────────────────────────────
function handleMentionAutocomplete() {
  const val = chatInput.value;
  const lastAt = val.lastIndexOf('@');
  if (lastAt === -1) { mentionAutocomplete.classList.add('hidden'); return; }
  const query = val.slice(lastAt + 1).toLowerCase();
  const matches = [...usersList.querySelectorAll('.user-name')].map(n => n.textContent).filter(u => u.toLowerCase().startsWith(query) && u !== currentUser.username);
  if (!matches.length) { mentionAutocomplete.classList.add('hidden'); return; }
  mentionAutocomplete.innerHTML = matches.slice(0, 5).map(u => `<div class="mention-option" data-username="${u}">${u}</div>`).join('');
  mentionAutocomplete.classList.remove('hidden');
  mentionAutocomplete.querySelectorAll('.mention-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const before = val.slice(0, lastAt);
      chatInput.value = before + '@' + opt.dataset.username + ' ';
      mentionAutocomplete.classList.add('hidden'); chatInput.focus();
    });
  });
}

// ── Mention notifications ─────────────────────────────
socket.on('mention notification', ({ from, room, text, time }) => {
  playSound('mention');
  mentionToastText.textContent = `@${from} in #${room}: "${text.substring(0, 40)}"`;
  mentionToast.classList.remove('hidden');
  setTimeout(() => mentionToast.classList.add('hidden'), 5000);
  // Browser notification
  if (Notification.permission === 'granted') {
    new Notification(`ChitChat — @mention from ${from}`, { body: text.substring(0, 100), icon: 'logo.jpg' });
  }
});

// ── Browser notifications ─────────────────────────────
function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  notifIcon.textContent = Notification.permission === 'granted' ? '🔔' : '🔕';
}
notifBtn.addEventListener('click', () => {
  if ('Notification' in window) {
    Notification.requestPermission().then(p => { notifIcon.textContent = p === 'granted' ? '🔔' : '🔕'; });
  }
});

// ── Unread badges ─────────────────────────────────────
function incrementUnread(room) {
  if (room === currentRoom) return;
  unreadCounts[room] = (unreadCounts[room] || 0) + 1;
  const badge = channelList.querySelector(`.unread-badge[data-room="${room}"]`);
  if (badge) { badge.textContent = unreadCounts[room]; badge.classList.remove('hidden'); }
}
function resetUnread(room) {
  unreadCounts[room] = 0;
  const badge = channelList.querySelector(`.unread-badge[data-room="${room}"]`);
  if (badge) badge.classList.add('hidden');
}

// ── Image attachment ──────────────────────────────────
imageInput.addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 8e6) { alert('Max 8MB'); return; }
  const reader = new FileReader();
  reader.onload = ev => { pendingImage = ev.target.result; imagePreviewThumb.src = pendingImage; imagePreviewBar.classList.remove('hidden'); };
  reader.readAsDataURL(file);
});
removeImageBtn.addEventListener('click', () => { pendingImage = null; imageInput.value = ''; imagePreviewBar.classList.add('hidden'); });

// ── Emoji picker ──────────────────────────────────────
emojiBtn.addEventListener('click', e => { e.stopPropagation(); emojiPicker.classList.toggle('hidden'); gifPicker.classList.add('hidden'); });
emojiPicker.addEventListener('click', e => {
  if (e.target.tagName === 'SPAN') { chatInput.value += e.target.textContent; chatInput.focus(); }
});
document.querySelectorAll('.epick-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.epick-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

// ── GIF picker ────────────────────────────────────────
gifBtn.addEventListener('click', e => { e.stopPropagation(); gifPicker.classList.toggle('hidden'); emojiPicker.classList.add('hidden'); });
gifSearchBtn.addEventListener('click', searchGifs);
gifSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchGifs(); } });

async function searchGifs() {
  const q = gifSearchInput.value.trim();
  if (!q) return;
  gifGrid.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;text-align:center;padding:20px">Searching...</p>';
  try {
    const res = await fetch(api(`/api/gifs?q=${encodeURIComponent(q)}`));
    const data = await res.json();
    if (!data.gifs?.length) { gifGrid.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;text-align:center;padding:20px">No GIFs found.</p>'; return; }
    gifGrid.innerHTML = '';
    data.gifs.forEach(gif => {
      const img = document.createElement('img');
      img.src = gif.preview || gif.url;
      img.className = 'gif-thumb';
      img.alt = 'GIF';
      img.addEventListener('click', () => { socket.emit('chat message', { text: '', image: gif.url, replyTo }); gifPicker.classList.add('hidden'); replyTo = null; replyBanner.classList.add('hidden'); });
      gifGrid.appendChild(img);
    });
  } catch { gifGrid.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;text-align:center;padding:20px">Error loading GIFs.</p>'; }
}

// ── Search ────────────────────────────────────────────
searchInput.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  messagesList.querySelectorAll('.message-item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
  });
});

// ── Theme & Sound ─────────────────────────────────────
themeToggleBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  themeIcon.textContent = next === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('chitchat_theme', next);
});
// Restore saved theme
const savedTheme = localStorage.getItem('chitchat_theme');
if (savedTheme) { document.documentElement.dataset.theme = savedTheme; themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️'; }

soundToggleBtn.addEventListener('click', () => {
  isSoundOn = !isSoundOn;
  soundIcon.textContent = isSoundOn ? '🔊' : '🔇';
});

// ── Mobile sidebar ────────────────────────────────────
$('mobile-menu-btn').addEventListener('click', () => sidebar.classList.add('open'));
$('sidebar-close-btn').addEventListener('click', () => sidebar.classList.remove('open'));

// ── Close popovers on outside click ──────────────────
document.addEventListener('click', e => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.classList.add('hidden');
  if (!gifPicker.contains(e.target) && e.target !== gifBtn) gifPicker.classList.add('hidden');
  if (!mentionAutocomplete.contains(e.target) && e.target !== chatInput) mentionAutocomplete.classList.add('hidden');
  if (!pinnedPanel.contains(e.target) && e.target !== pinnedBtn) pinnedPanel.classList.add('hidden');
  if (!galleryPanel.contains(e.target) && e.target !== galleryBtn) galleryPanel.classList.add('hidden');
});

// ── Utils ─────────────────────────────────────────────
function scrollToBottom() { setTimeout(() => { messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 50); }
function escapeHTML(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
