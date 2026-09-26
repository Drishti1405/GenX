const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true, index: true },
  room: { type: String, required: true, index: true },
  sender: { id: String, username: String, avatar: String, email: String },
  text: String,
  image: String,
  file: { name: String, url: String, size: Number, type: String },
  replyTo: { id: String, username: String, text: String },
  poll: { id: String, question: String, options: [{ text: String, votes: [String] }] },
  mentions: [String],
  time: String,
  timestamp: { type: Number, default: Date.now, index: true },
  reactions: { type: Map, of: [String], default: {} },
  edited: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false }
});

module.exports = mongoose.model('Message', messageSchema);
