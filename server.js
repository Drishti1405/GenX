const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  maxHttpBufferSize: 1e8
});
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const Message = require('./models/Message');

const path = require('path');
const fs = require('fs');

try {
  require('dotenv').config();
} catch (e) {}

const JWT_SECRET = process.env.JWT_SECRET || 'chitchat_super_secret_jwt_key_2026';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chitchat';

// CORS Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '20mb' }));

// Serve frontend static directory
const possibleFrontendPaths = [
  path.join(__dirname, '../frontend'),
  path.join(__dirname, 'frontend'),
  path.join(__dirname, 'public'),
  path.join(__dirname, '../public')
];
for (const p of possibleFrontendPaths) {
  if (fs.existsSync(p)) {
    app.use(express.static(p));
  }
}

// MongoDB Connection with Serverless Support
let isMongoConnected = false;

mongoose.set('bufferCommands', false);

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    isMongoConnected = true;
    return true;
  }
  if (!MONGO_URI || MONGO_URI.includes('127.0.0.1')) {
    console.warn('[MongoDB] No Atlas URI found, using memory fallback.');
    isMongoConnected = false;
    return false;
  }
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
      retryWrites: true
    });
    isMongoConnected = (mongoose.connection.readyState === 1);
    if (isMongoConnected) console.log(`[MongoDB] ✅ Connected to Atlas!`);
    return isMongoConnected;
  } catch (err) {
    console.error(`[MongoDB] ❌ Connection failed: ${err.message}`);
    isMongoConnected = false;
    return false;
  }
}

// Initial connection on startup
connectDB().catch(err => console.error('[MongoDB] Startup connect error:', err.message));

// Middleware to ensure DB connection is checked for API calls
app.use(async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    try { await connectDB(); } catch {}
  }
  next();
});

// In-memory stores
const inMemoryUsers = new Map(); // username or email => user object
const inMemoryHistory = {};
const activeUsers = new Map();   // socket.id => user object
const pinnedMessages = {};       // room => [messageId, ...]
const polls = {};                // pollId => poll object
const customChannels = {};       // room => { description, topic, createdBy }
const DEFAULT_ROOM = 'general';
const BUILT_IN_ROOMS = ['general', 'lounge', 'tech-talk', 'random', 'music-lounge'];

// Seed built-in rooms
BUILT_IN_ROOMS.forEach(r => { inMemoryHistory[r] = []; pinnedMessages[r] = []; });

// ─────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, avatar } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Username, email and password are required.' });

    if (isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        if (await User.findOne({ email: email.toLowerCase() }))
          return res.status(400).json({ error: 'Email already registered.' });
        if (await User.findOne({ username }))
          return res.status(400).json({ error: 'Username already taken.' });

        const hashed = await bcrypt.hash(password, 10);
        const newUser = await User.create({ username, email: email.toLowerCase(), password: hashed, avatar: avatar || '🚀' });
        const token = jwt.sign({ id: newUser._id, username: newUser.username, email: newUser.email, avatar: newUser.avatar }, JWT_SECRET, { expiresIn: '7d' });
        return res.status(201).json({ token, user: { id: newUser._id, username: newUser.username, email: newUser.email, avatar: newUser.avatar, status: newUser.status || 'online' } });
      } catch (e) {
        console.warn('Mongo register fallback:', e.message);
      }
    }

    // In-memory registration fallback
    const lowerEmail = email.toLowerCase();
    if (inMemoryUsers.has(lowerEmail) || inMemoryUsers.has(username)) {
      return res.status(400).json({ error: 'Username or email already taken.' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const inMemUser = { id: `mem_${Date.now()}`, username, email: lowerEmail, password: hashed, avatar: avatar || '🚀', status: 'online' };
    inMemoryUsers.set(lowerEmail, inMemUser);
    inMemoryUsers.set(username, inMemUser);
    const token = jwt.sign({ id: inMemUser.id, username: inMemUser.username, email: inMemUser.email, avatar: inMemUser.avatar }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, user: { id: inMemUser.id, username: inMemUser.username, email: inMemUser.email, avatar: inMemUser.avatar, status: 'online' } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) return res.status(400).json({ error: 'Credentials required.' });

    if (isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const user = await User.findOne({ $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }] });
        if (user) {
          if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ error: 'Wrong password.' });

          const token = jwt.sign({ id: user._id, username: user.username, email: user.email, avatar: user.avatar }, JWT_SECRET, { expiresIn: '7d' });
          return res.json({ token, user: { id: user._id, username: user.username, email: user.email, avatar: user.avatar, status: user.status || 'online' } });
        }
      } catch (e) {
        console.warn('Mongo login fallback:', e.message);
      }
    }

    // In-memory login fallback
    const key = emailOrUsername.toLowerCase();
    const memUser = inMemoryUsers.get(key) || inMemoryUsers.get(emailOrUsername);
    if (!memUser) return res.status(400).json({ error: 'User not found. Please create an account.' });
    if (!await bcrypt.compare(password, memUser.password)) return res.status(400).json({ error: 'Wrong password.' });

    const token = jwt.sign({ id: memUser.id, username: memUser.username, email: memUser.email, avatar: memUser.avatar }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: memUser.id, username: memUser.username, email: memUser.email, avatar: memUser.avatar, status: memUser.status || 'online' } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token.' });
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    if (isMongoConnected && decoded.id && !String(decoded.id).startsWith('mem_')) {
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return res.status(401).json({ error: 'User not found.' });
      return res.json({ user });
    }
    res.json({ user: decoded });
  } catch { res.status(401).json({ error: 'Invalid token.' }); }
});

// Update Profile (avatar, status, change password)
app.put('/api/auth/profile', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token.' });
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    const { avatar, status, currentPassword, newPassword } = req.body;

    if (!isMongoConnected) {
      return res.json({ user: { ...decoded, avatar: avatar || decoded.avatar, status: status || 'online' } });
    }

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (avatar) user.avatar = avatar;
    if (status) user.status = status;

    if (newPassword && currentPassword) {
      if (!await bcrypt.compare(currentPassword, user.password))
        return res.status(400).json({ error: 'Current password is incorrect.' });
      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    const token = jwt.sign({ id: user._id, username: user.username, email: user.email, avatar: user.avatar }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, avatar: user.avatar, status: user.status } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get all rooms (built-in + custom)
app.get('/api/rooms', (req, res) => {
  const rooms = BUILT_IN_ROOMS.map(r => ({ name: r, description: customChannels[r]?.description || '', topic: customChannels[r]?.topic || '', isCustom: false }));
  Object.entries(customChannels).forEach(([name, meta]) => {
    if (!BUILT_IN_ROOMS.includes(name)) rooms.push({ name, description: meta.description, topic: meta.topic, isCustom: true, createdBy: meta.createdBy });
  });
  res.json({ rooms });
});

// Create custom channel
app.post('/api/rooms', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token.' });
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Channel name required.' });
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 30);
    if (BUILT_IN_ROOMS.includes(cleanName) || customChannels[cleanName])
      return res.status(400).json({ error: 'Channel already exists.' });
    customChannels[cleanName] = { description: description || '', topic: '', createdBy: decoded.username };
    inMemoryHistory[cleanName] = [];
    pinnedMessages[cleanName] = [];
    res.status(201).json({ room: { name: cleanName, description: description || '', createdBy: decoded.username } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pinned messages for a room
app.get('/api/rooms/:room/pinned', async (req, res) => {
  const { room } = req.params;
  if (isMongoConnected) {
    const pinIds = pinnedMessages[room] || [];
    const msgs = await Message.find({ messageId: { $in: pinIds } }).lean();
    return res.json({ pinned: msgs.map(m => ({ id: m.messageId, text: m.text, sender: m.sender, time: m.time })) });
  }
  res.json({ pinned: [] });
});

// GIF Search proxy (uses Tenor public API — no key needed for basic use)
app.get('/api/gifs', async (req, res) => {
  try {
    const q = encodeURIComponent(req.query.q || 'funny');
    const url = `https://tenor.googleapis.com/v2/search?q=${q}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&limit=12&media_filter=gif`;
    const r = await fetch(url);
    const data = await r.json();
    const gifs = (data.results || []).map(g => ({ id: g.id, url: g.media_formats?.gif?.url || '', preview: g.media_formats?.tinygif?.url || '' }));
    res.json({ gifs });
  } catch { res.json({ gifs: [] }); }
});

// ─────────────────────────────────────────
//  SOCKET.IO ENGINE
// ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── Login ──────────────────────────────────────────────────────────────
  socket.on('login', async (userData) => {
    const user = {
      id: socket.id,
      userId: userData.id || null,
      username: userData.username || 'Anonymous',
      email: userData.email || '',
      avatar: userData.avatar || '🚀',
      status: userData.status || 'online',
      room: DEFAULT_ROOM,
      lastSeen: null
    };
    activeUsers.set(socket.id, user);
    socket.join(DEFAULT_ROOM);

    const history = await getRoomHistory(DEFAULT_ROOM);
    socket.emit('login success', { user, room: DEFAULT_ROOM, history, roomUsers: getRoomUsers(DEFAULT_ROOM), pinnedMessages: pinnedMessages[DEFAULT_ROOM] || [] });

    socket.to(DEFAULT_ROOM).emit('system message', { type: 'user-joined', text: `${user.username} joined the workspace 👋`, time: timeNow() });
    io.to(DEFAULT_ROOM).emit('room users update', getRoomUsers(DEFAULT_ROOM));
  });

  // ── Switch Room ─────────────────────────────────────────────────────────
  socket.on('switch room', async (newRoom) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const oldRoom = user.room;

    socket.leave(oldRoom);
    socket.to(oldRoom).emit('system message', { type: 'user-left', text: `${user.username} left the room`, time: timeNow() });
    io.to(oldRoom).emit('room users update', getRoomUsers(oldRoom));

    user.room = newRoom;
    socket.join(newRoom);
    if (!inMemoryHistory[newRoom]) inMemoryHistory[newRoom] = [];
    if (!pinnedMessages[newRoom]) pinnedMessages[newRoom] = [];

    const history = await getRoomHistory(newRoom);
    socket.emit('room switched', { room: newRoom, history, roomUsers: getRoomUsers(newRoom), pinnedMessages: pinnedMessages[newRoom] || [] });
    socket.to(newRoom).emit('system message', { type: 'user-joined', text: `${user.username} joined #${newRoom} 👋`, time: timeNow() });
    io.to(newRoom).emit('room users update', getRoomUsers(newRoom));
  });

  // ── Chat Message ────────────────────────────────────────────────────────
  socket.on('chat message', async (msgData) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    // Parse @mentions
    const mentionedUsers = [...(msgData.text || '').matchAll(/@(\w+)/g)].map(m => m[1]);

    const messageObj = {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      room: user.room,
      sender: { id: user.id, username: user.username, avatar: user.avatar, email: user.email },
      text: msgData.text || '',
      image: msgData.image || null,
      file: msgData.file || null,
      replyTo: msgData.replyTo || null,
      poll: msgData.poll || null,
      mentions: mentionedUsers,
      time: timeNow(),
      timestamp: Date.now(),
      reactions: {},
      edited: false,
      pinned: false
    };

    if (isMongoConnected) {
      try { await Message.create(messageObj); } catch (e) { console.error('Save msg error:', e.message); }
    }
    if (!inMemoryHistory[user.room]) inMemoryHistory[user.room] = [];
    inMemoryHistory[user.room].push(messageObj);
    if (inMemoryHistory[user.room].length > 200) inMemoryHistory[user.room].shift();

    const broadcast = { ...messageObj, id: messageObj.messageId };
    io.to(user.room).emit('chat message', broadcast);

    // Notify mentioned users with system DM
    mentionedUsers.forEach(mentionedUsername => {
      for (const [sid, u] of activeUsers.entries()) {
        if (u.username === mentionedUsername && sid !== socket.id) {
          io.to(sid).emit('mention notification', { from: user.username, room: user.room, text: messageObj.text, time: messageObj.time });
        }
      }
    });
  });

  // ── Edit Message ────────────────────────────────────────────────────────
  socket.on('edit message', async ({ messageId, newText }) => {
    const user = activeUsers.get(socket.id);
    if (!user || !newText?.trim()) return;

    if (isMongoConnected) {
      await Message.updateOne({ messageId, 'sender.id': user.id }, { $set: { text: newText, edited: true } }).catch(console.error);
    }
    const memMsg = (inMemoryHistory[user.room] || []).find(m => m.messageId === messageId);
    if (memMsg) { memMsg.text = newText; memMsg.edited = true; }

    io.to(user.room).emit('message edited', { messageId, newText, edited: true });
  });

  // ── Pin Message ─────────────────────────────────────────────────────────
  socket.on('pin message', async (messageId) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const room = user.room;
    if (!pinnedMessages[room]) pinnedMessages[room] = [];

    const idx = pinnedMessages[room].indexOf(messageId);
    let isPinned;
    if (idx > -1) {
      pinnedMessages[room].splice(idx, 1);
      isPinned = false;
    } else {
      pinnedMessages[room].push(messageId);
      isPinned = true;
    }
    io.to(room).emit('pin updated', { messageId, isPinned, pinnedMessages: pinnedMessages[room] });
  });

  // ── Reactions ───────────────────────────────────────────────────────────
  socket.on('add reaction', async ({ messageId, emoji }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    let updatedReactions = {};

    if (isMongoConnected) {
      try {
        const doc = await Message.findOne({ messageId });
        if (doc) {
          const map = doc.reactions instanceof Map ? doc.reactions : new Map(Object.entries(doc.reactions || {}));
          const list = map.get(emoji) || [];
          const i = list.indexOf(user.username);
          if (i > -1) list.splice(i, 1); else list.push(user.username);
          if (list.length === 0) map.delete(emoji); else map.set(emoji, list);
          doc.reactions = map;
          await doc.save();
          updatedReactions = Object.fromEntries(map);
        }
      } catch (e) { console.error('Reaction error:', e.message); }
    } else {
      const msg = (inMemoryHistory[user.room] || []).find(m => m.messageId === messageId);
      if (msg) {
        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
        const i = msg.reactions[emoji].indexOf(user.username);
        if (i > -1) msg.reactions[emoji].splice(i, 1); else msg.reactions[emoji].push(user.username);
        if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
        updatedReactions = msg.reactions;
      }
    }
    io.to(user.room).emit('reaction updated', { messageId, reactions: updatedReactions });
  });

  // ── Delete Message ──────────────────────────────────────────────────────
  socket.on('delete message', async (messageId) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (isMongoConnected) await Message.deleteOne({ messageId, 'sender.id': user.id }).catch(console.error);
    const arr = inMemoryHistory[user.room] || [];
    const i = arr.findIndex(m => m.messageId === messageId);
    if (i > -1) arr.splice(i, 1);
    io.to(user.room).emit('message deleted', { messageId });
  });

  // ── Typing ──────────────────────────────────────────────────────────────
  socket.on('typing', () => {
    const user = activeUsers.get(socket.id);
    if (user) socket.to(user.room).emit('user typing', { username: user.username, id: user.id });
  });
  socket.on('stop typing', () => {
    const user = activeUsers.get(socket.id);
    if (user) socket.to(user.room).emit('user stop typing', { id: user.id });
  });

  // ── User Status Update ─────────────────────────────────────────────────
  socket.on('update status', (status) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    user.status = status;
    io.to(user.room).emit('room users update', getRoomUsers(user.room));
  });

  // ── Poll Create ─────────────────────────────────────────────────────────
  socket.on('create poll', (pollData) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const pollId = `poll_${Date.now()}`;
    const poll = {
      id: pollId, question: pollData.question,
      options: (pollData.options || []).map(o => ({ text: o, votes: [] })),
      createdBy: user.username, room: user.room, time: timeNow()
    };
    polls[pollId] = poll;
    io.to(user.room).emit('poll created', poll);
  });

  socket.on('vote poll', ({ pollId, optionIndex }) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    const poll = polls[pollId];
    if (!poll) return;
    // Remove existing vote
    poll.options.forEach(o => { const i = o.votes.indexOf(user.username); if (i > -1) o.votes.splice(i, 1); });
    // Add new vote
    if (poll.options[optionIndex]) poll.options[optionIndex].votes.push(user.username);
    io.to(user.room).emit('poll updated', poll);
  });

  // ── Disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      const room = user.room;
      activeUsers.delete(socket.id);
      socket.to(room).emit('system message', { type: 'user-left', text: `${user.username} left the workspace`, time: timeNow() });
      io.to(room).emit('room users update', getRoomUsers(room));
    }
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────
async function getRoomHistory(room) {
  if (isMongoConnected) {
    try {
      const docs = await Message.find({ room }).sort({ timestamp: 1 }).limit(150).lean();
      return docs.map(d => ({
        id: d.messageId, room: d.room, sender: d.sender, text: d.text,
        image: d.image, file: d.file, replyTo: d.replyTo, poll: d.poll,
        mentions: d.mentions || [], time: d.time, timestamp: d.timestamp,
        reactions: d.reactions instanceof Map ? Object.fromEntries(d.reactions) : (d.reactions || {}),
        edited: d.edited || false, pinned: d.pinned || false
      }));
    } catch (e) { console.error('getRoomHistory error:', e); }
  }
  return (inMemoryHistory[room] || []).map(m => ({ ...m, id: m.messageId }));
}

function getRoomUsers(room) {
  const list = [];
  for (const [, u] of activeUsers.entries()) {
    if (u.room === room) list.push({ id: u.id, username: u.username, avatar: u.avatar, status: u.status });
  }
  return list;
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
