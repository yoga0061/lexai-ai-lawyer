const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Models
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const CourtroomSession = require('../models/CourtroomSession');
const Document = require('../models/Document');

// File-based fallback DB path
const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'db_fallback.json');

// Ensure data directory and fallback file exist
function initFallbackDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: [],
      conversations: [],
      courtroomSessions: [],
      documents: []
    }, null, 2));
  }
}

initFallbackDb();

// Helper to read fallback DB
function readFallback() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to read fallback DB, resetting...', err);
    return { users: [], conversations: [], courtroomSessions: [], documents: [] };
  }
}

// Helper to write fallback DB
function writeFallback(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to write to fallback DB:', err);
  }
}

// Check if mongoose is connected
function isConnected() {
  return mongoose.connection.readyState === 1;
}

// --- DATABASE SERVICE METHODS ---

// 1. Find User by Email or Username
async function findUserByEmailOrUsername(email, username) {
  if (isConnected()) {
    const query = [];
    if (email) query.push({ email });
    if (username) query.push({ username });
    if (query.length === 0) return null;
    return User.findOne({ $or: query });
  } else {
    const db = readFallback();
    return db.users.find(u => 
      (email && u.email.toLowerCase() === email.toLowerCase()) || 
      (username && u.username.toLowerCase() === username.toLowerCase())
    ) || null;
  }
}

// 2. Find User by ID
async function findUserById(id) {
  if (isConnected()) {
    return User.findById(id).select('-password');
  } else {
    const db = readFallback();
    const user = db.users.find(u => u._id === id.toString());
    if (!user) return null;
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

// 3. Create New User
async function createUser({ username, email, password }) {
  if (isConnected()) {
    const newUser = new User({ username, email, password });
    return newUser.save();
  } else {
    const db = readFallback();
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
      _id: new mongoose.Types.ObjectId().toString(),
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      preferredLanguage: 'English',
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    writeFallback(db);

    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }
}

// 4. Compare Password
async function comparePassword(user, candidatePassword) {
  if (isConnected() && user.comparePassword) {
    return user.comparePassword(candidatePassword);
  } else {
    // Falls back to manually checking hashed password (supports both Mongoose instance and plain JSON)
    const hash = user.password;
    return bcrypt.compare(candidatePassword, hash);
  }
}

// 5. Save Conversation (Normal Advice)
async function saveConversation(userId, { messages, title, conversationId }) {
  if (isConnected()) {
    if (conversationId) {
      const conv = await Conversation.findOne({ _id: conversationId, userId });
      if (conv) {
        messages.forEach(msg => conv.messages.push(msg));
        return conv.save();
      }
    } else {
      const conv = new Conversation({
        userId,
        title,
        mode: 'normal',
        messages
      });
      return conv.save();
    }
  } else {
    const db = readFallback();
    let conv;

    if (conversationId) {
      conv = db.conversations.find(c => c._id === conversationId.toString() && c.userId === userId.toString());
      if (conv) {
        messages.forEach(msg => {
          conv.messages.push({
            _id: new mongoose.Types.ObjectId().toString(),
            sender: msg.sender,
            content: msg.content,
            timestamp: new Date().toISOString()
          });
        });
        writeFallback(db);
        return conv;
      }
    }

    // Create new
    conv = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: userId.toString(),
      title,
      mode: 'normal',
      messages: messages.map(msg => ({
        _id: new mongoose.Types.ObjectId().toString(),
        sender: msg.sender,
        content: msg.content,
        timestamp: new Date().toISOString()
      })),
      createdAt: new Date().toISOString()
    };
    db.conversations.push(conv);
    writeFallback(db);
    return conv;
  }
}

// 6. Get User Conversations List
async function getUserConversations(userId) {
  if (isConnected()) {
    return Conversation.find({ userId }).select('title mode createdAt').sort({ createdAt: -1 });
  } else {
    const db = readFallback();
    return db.conversations
      .filter(c => c.userId === userId.toString())
      .map(({ _id, title, mode, createdAt }) => ({ _id, title, mode, createdAt }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

// 7. Get Conversation Details
async function getConversationById(id, userId) {
  if (isConnected()) {
    return Conversation.findOne({ _id: id, userId });
  } else {
    const db = readFallback();
    return db.conversations.find(c => c._id === id.toString() && c.userId === userId.toString()) || null;
  }
}

// 8. Delete Conversation
async function deleteConversationById(id, userId) {
  if (isConnected()) {
    return Conversation.deleteOne({ _id: id, userId });
  } else {
    const db = readFallback();
    const index = db.conversations.findIndex(c => c._id === id.toString() && c.userId === userId.toString());
    if (index === -1) return { deletedCount: 0 };
    db.conversations.splice(index, 1);
    writeFallback(db);
    return { deletedCount: 1 };
  }
}

// 9. Save Courtroom Session
async function saveCourtroomSession(userId, { caseFacts, arguments, verdict }) {
  if (isConnected()) {
    const session = new CourtroomSession({
      userId,
      caseFacts,
      arguments,
      verdict
    });
    return session.save();
  } else {
    const db = readFallback();
    const session = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: userId.toString(),
      caseFacts,
      arguments: arguments.map(arg => ({
        _id: new mongoose.Types.ObjectId().toString(),
        role: arg.role,
        title: arg.title,
        content: arg.content,
        timestamp: new Date().toISOString()
      })),
      verdict,
      createdAt: new Date().toISOString()
    };
    db.courtroomSessions.push(session);
    writeFallback(db);
    return session;
  }
}

// 10. Get User Courtroom Sessions
async function getUserCourtroomSessions(userId) {
  if (isConnected()) {
    return CourtroomSession.find({ userId }).select('caseFacts verdict createdAt').sort({ createdAt: -1 });
  } else {
    const db = readFallback();
    return db.courtroomSessions
      .filter(s => s.userId === userId.toString())
      .map(({ _id, caseFacts, verdict, createdAt }) => ({ _id, caseFacts, verdict, createdAt }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

// 11. Get Courtroom Session Details
async function getCourtroomSessionById(id, userId) {
  if (isConnected()) {
    return CourtroomSession.findOne({ _id: id, userId });
  } else {
    const db = readFallback();
    return db.courtroomSessions.find(s => s._id === id.toString() && s.userId === userId.toString()) || null;
  }
}

// 12. Save Document Audit
async function saveDocument(userId, { filename, summary, risks, clauses }) {
  if (isConnected()) {
    const doc = new Document({
      userId,
      filename,
      summary,
      risks,
      clauses
    });
    return doc.save();
  } else {
    const db = readFallback();
    const doc = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId: userId.toString(),
      filename,
      summary,
      risks,
      clauses,
      createdAt: new Date().toISOString()
    };
    db.documents.push(doc);
    writeFallback(db);
    return doc;
  }
}

// 13. Get User Documents
async function getUserDocuments(userId) {
  if (isConnected()) {
    return Document.find({ userId }).select('filename summary createdAt').sort({ createdAt: -1 });
  } else {
    const db = readFallback();
    return db.documents
      .filter(d => d.userId === userId.toString())
      .map(({ _id, filename, summary, createdAt }) => ({ _id, filename, summary, createdAt }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

// 14. Get Document Details
async function getDocumentById(id, userId) {
  if (isConnected()) {
    return Document.findOne({ _id: id, userId });
  } else {
    const db = readFallback();
    return db.documents.find(d => d._id === id.toString() && d.userId === userId.toString()) || null;
  }
}

module.exports = {
  findUserByEmailOrUsername,
  findUserById,
  createUser,
  comparePassword,
  saveConversation,
  getUserConversations,
  getConversationById,
  deleteConversationById,
  saveCourtroomSession,
  getUserCourtroomSessions,
  getCourtroomSessionById,
  saveDocument,
  getUserDocuments,
  getDocumentById
};
