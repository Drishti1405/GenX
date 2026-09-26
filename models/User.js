const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '🚀' },
  status: { type: String, default: 'online', enum: ['online', 'away', 'dnd', 'offline'] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
