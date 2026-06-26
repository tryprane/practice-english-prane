const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- VAPID keys for Web Push (generated once, persisted to disk) ---
const vapidPath = path.join(__dirname, 'data', 'vapid.json');
let vapidKeys = null;
try {
  if (fs.existsSync(vapidPath)) {
    vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
  }
} catch (e) {
  vapidKeys = null;
}
if (!vapidKeys || !vapidKeys.publicKey || !vapidKeys.privateKey) {
  vapidKeys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys, null, 2));
  } catch (e) {}
}
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@prane.local';
webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

let ASSET_VERSION = '1';
try {
  ASSET_VERSION = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim() || '1';
} catch (e) {}
if (ASSET_VERSION === '1') {
  try {
    ASSET_VERSION = Math.floor(fs.statSync(path.join(__dirname, 'public', 'css', 'styles.css')).mtimeMs / 1000).toString();
  } catch (e2) {}
}

const htmlPageNames = new Set(['index.html', 'channel.html', 'admin.html']);

app.use((req, res, next) => {
  const reqBase = path.basename(req.path === '/' ? '/index.html' : req.path);
  if (!htmlPageNames.has(reqBase)) return next();
  const file = path.join(__dirname, 'public', reqBase);
  try {
    if (fs.existsSync(file)) {
      const html = fs.readFileSync(file, 'utf8')
        .replace(/((?:href|src)=")(css\/[^"?#]+|js\/[^"?#]+)(")/g, (m, pre, p, post) => `${pre}${p}?v=${ASSET_VERSION}${post}`);
      res.set('Cache-Control', 'no-cache');
      return res.type('text/html').send(html);
    }
  } catch (e) {}
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

let rooms = {};
const storePath = path.join(__dirname, 'data', 'store.json');

if (fs.existsSync(storePath)) {
  try {
    rooms = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch (err) {
    rooms = {};
  }
}

let saveTimeout = null;
const saveStore = () => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(storePath, JSON.stringify(rooms, null, 2));
    } catch (err) {}
  }, 1000);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext && mime) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed'));
  }
});

const activeSessions = new Set();

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === 'Ram@7518483234') {
    const token = uuidv4();
    activeSessions.add(token);
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, error: 'Invalid password' });
});

const checkAdmin = (req, res, next) => {
  const token = req.headers['authorization'] || req.query.token;
  if (activeSessions.has(token)) {
    return next();
  }
  res.status(403).json({ success: false, error: 'Unauthorized' });
};

app.get('/api/admin/rooms', checkAdmin, (req, res) => {
  const list = Object.values(rooms).map(r => ({
    code: r.code,
    name: r.name,
    createdAt: r.createdAt,
    memberCount: r.members ? r.members.length : 0
  }));
  res.json({ success: true, rooms: list });
});

app.post('/api/admin/rooms', checkAdmin, (req, res) => {
  const { name, code: customCode } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, error: 'Room name is required' });
  }
  let code;
  if (customCode && customCode.trim() !== '') {
    code = customCode.trim().toUpperCase();
    if (rooms[code]) {
      return res.status(400).json({ success: false, error: 'This code is already in use' });
    }
  } else {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  rooms[code] = {
    code,
    name: name.trim(),
    createdAt: new Date().toISOString(),
    members: [],
    messages: [],
    callLogs: []
  };
  saveStore();
  res.json({ success: true, room: rooms[code] });
});

app.delete('/api/admin/rooms/:code', checkAdmin, (req, res) => {
  const { code } = req.params;
  if (rooms[code]) {
    const socketsInRoom = io.sockets.adapter.rooms.get(code);
    if (socketsInRoom) {
      for (const socketId of socketsInRoom) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('room-deleted');
          socket.leave(code);
        }
      }
    }
    delete rooms[code];
    saveStore();
    return res.json({ success: true });
  }
  res.status(404).json({ success: false, error: 'Room not found' });
});

app.post('/api/rooms/join', (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, error: 'Code and name are required' });
  }
  const room = rooms[code.toUpperCase()];
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }

  const connectedSockets = io.sockets.adapter.rooms.get(code.toUpperCase());
  const activeCount = connectedSockets ? connectedSockets.size : 0;

  if (activeCount >= 2) {
    return res.status(400).json({ success: false, error: 'Room is full' });
  }
  res.json({ success: true, roomName: room.name });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No image uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

// --- Web Push subscription endpoints ---
app.get('/api/push/vapid-public', (req, res) => {
  res.json({ success: true, publicKey: vapidKeys.publicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  const { code, name, subscription } = req.body;
  if (!code || !name || !subscription || !subscription.endpoint) {
    return res.status(400).json({ success: false, error: 'Missing subscription data' });
  }
  const room = rooms[code.toUpperCase()];
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  if (!Array.isArray(room.subscriptions)) {
    room.subscriptions = [];
  }
  const record = { name, endpoint: subscription.endpoint, keys: subscription.keys };
  const existingIdx = room.subscriptions.findIndex(s => s.endpoint === subscription.endpoint);
  if (existingIdx !== -1) {
    room.subscriptions[existingIdx] = record;
  } else {
    room.subscriptions.push(record);
  }
  saveStore();
  res.json({ success: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const { code, endpoint } = req.body;
  const room = rooms[(code || '').toUpperCase()];
  if (room && Array.isArray(room.subscriptions)) {
    room.subscriptions = room.subscriptions.filter(s => s.endpoint !== endpoint);
    saveStore();
  }
  res.json({ success: true });
});

// Send a push notification to room members who are NOT currently connected.
async function notifyOfflineMembers(roomCode, senderName, message) {
  const room = rooms[roomCode];
  if (!room || !Array.isArray(room.subscriptions) || room.subscriptions.length === 0) return;

  const connectedSockets = io.sockets.adapter.rooms.get(roomCode);
  const connectedSocketIds = connectedSockets ? Array.from(connectedSockets) : [];
  const connectedNames = room.members
    .filter(m => connectedSocketIds.includes(m.socketId))
    .map(m => m.name);

  const bodyText = message.image && !message.text
    ? '📷 Photo'
    : (message.text || '📷 Photo');

  const payload = JSON.stringify({
    title: room.name || 'Prane',
    body: `${senderName}: ${bodyText}`,
    roomCode,
    url: `/channel.html?code=${roomCode}`,
    tag: `room-${roomCode}`
  });

  const targets = room.subscriptions.filter(s =>
    s.name !== senderName &&
    !connectedNames.includes(s.name) &&
    s.keys && s.keys.p256dh && s.keys.auth
  );

  const results = await Promise.allSettled(targets.map(s =>
    webpush.sendNotification(
      { endpoint: s.endpoint, keys: s.keys },
      payload,
      { TTL: 60 * 60 * 24 }
    )
  ));

  let changed = false;
  results.forEach((res, i) => {
    if (res.status === 'rejected' && res.reason) {
      const code = res.reason.statusCode;
      // 410 Gone / 404 Not Found: subscription is no longer valid, prune it.
      if (code === 410 || code === 404) {
        const ep = targets[i].endpoint;
        room.subscriptions = room.subscriptions.filter(sub => sub.endpoint !== ep);
        changed = true;
      }
    }
  });
  if (changed) saveStore();
}

cron.schedule('0 * * * *', () => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let changed = false;

  for (const code in rooms) {
    const room = rooms[code];
    const initialMsgCount = room.messages.length;
    room.messages = room.messages.filter(msg => msg.timestamp > cutoff);
    if (room.messages.length !== initialMsgCount) {
      changed = true;
    }

    const initialLogCount = room.callLogs.length;
    room.callLogs = room.callLogs.filter(log => {
      const logTime = new Date(log.startTime).getTime();
      return logTime > cutoff;
    });
    if (room.callLogs.length !== initialLogCount) {
      changed = true;
    }
  }

  if (changed) {
    saveStore();
  }

  const uploadsDir = path.join(__dirname, 'uploads');
  fs.readdir(uploadsDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      fs.stat(filePath, (statErr, stats) => {
        if (statErr) return;
        if (stats.mtimeMs < cutoff) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
});

io.on('connection', (socket) => {
  let userRoomCode = null;
  let userName = null;

  socket.on('join-room', ({ code, name }) => {
    const formattedCode = code.toUpperCase();
    const room = rooms[formattedCode];
    if (!room) {
      return socket.emit('join-error', 'Room not found');
    }

    const connectedSockets = io.sockets.adapter.rooms.get(formattedCode);
    const activeCount = connectedSockets ? connectedSockets.size : 0;

    if (activeCount >= 2) {
      return socket.emit('join-error', 'Room is full');
    }

    room.members = room.members.filter(m => {
      return io.sockets.sockets.has(m.socketId);
    });

    userRoomCode = formattedCode;
    userName = name;

    room.members.push({ socketId: socket.id, name });
    socket.join(formattedCode);

    socket.emit('joined', {
      roomName: room.name,
      messages: room.messages,
      callLogs: room.callLogs,
      members: room.members.map(m => m.name)
    });

    socket.to(formattedCode).emit('peer-joined', name);
    saveStore();
  });

  socket.on('send-message', (data, callback) => {
    if (!userRoomCode) return;
    const room = rooms[userRoomCode];
    if (!room) return;

    const message = {
      id: uuidv4(),
      sender: userName,
      text: data.text || '',
      image: data.image || null,
      timestamp: Date.now(),
      status: 'sent'
    };

    room.messages.push(message);
    saveStore();

    socket.to(userRoomCode).emit('message-received', message);
    notifyOfflineMembers(userRoomCode, userName, message).catch(() => {});
    if (callback) {
      callback({ success: true, message });
    }
  });

  socket.on('typing', (isTyping) => {
    if (userRoomCode) {
      socket.to(userRoomCode).emit('peer-typing', { name: userName, isTyping });
    }
  });

  socket.on('message-delivered', ({ messageId, senderName }) => {
    if (!userRoomCode) return;
    const room = rooms[userRoomCode];
    if (!room) return;

    const msg = room.messages.find(m => m.id === messageId);
    if (msg && msg.status === 'sent') {
      msg.status = 'delivered';
      saveStore();
      socket.to(userRoomCode).emit('message-status-update', { messageId, status: 'delivered' });
    }
  });

  socket.on('message-read', ({ messageId }) => {
    if (!userRoomCode) return;
    const room = rooms[userRoomCode];
    if (!room) return;

    const msg = room.messages.find(m => m.id === messageId);
    if (msg && (msg.status === 'sent' || msg.status === 'delivered')) {
      msg.status = 'read';
      saveStore();
      socket.to(userRoomCode).emit('message-status-update', { messageId, status: 'read' });
    }
  });

  socket.on('delete-message', ({ messageId }) => {
    if (!userRoomCode) return;
    const room = rooms[userRoomCode];
    if (!room) return;
    const msgIndex = room.messages.findIndex(m => m.id === messageId);
    if (msgIndex !== -1) {
      room.messages.splice(msgIndex, 1);
      saveStore();
      io.to(userRoomCode).emit('message-deleted', { messageId });
    }
  });

  socket.on('call-request', () => {
    if (userRoomCode) {
      socket.to(userRoomCode).emit('incoming-call', { from: userName });
    }
  });

  socket.on('call-accept', () => {
    if (userRoomCode) {
      socket.to(userRoomCode).emit('call-accepted');
    }
  });

  socket.on('call-reject', () => {
    if (userRoomCode) {
      socket.to(userRoomCode).emit('call-rejected');
    }
  });

  socket.on('webrtc-offer', (offer) => {
    if (userRoomCode) {
      socket.to(userRoomCode).emit('webrtc-offer', offer);
    }
  });

  socket.on('webrtc-answer', (answer) => {
    if (userRoomCode) {
      socket.to(userRoomCode).emit('webrtc-answer', answer);
    }
  });

  socket.on('webrtc-candidate', (candidate) => {
    if (userRoomCode) {
      socket.to(userRoomCode).emit('webrtc-candidate', candidate);
    }
  });

  socket.on('call-hangup', (logDetails) => {
    if (!userRoomCode) return;
    socket.to(userRoomCode).emit('call-hungup');
    
    if (logDetails && logDetails.duration !== undefined) {
      const room = rooms[userRoomCode];
      if (room) {
        const log = {
          id: uuidv4(),
          caller: logDetails.caller || userName,
          receiver: logDetails.receiver || '',
          startTime: logDetails.startTime || new Date().toISOString(),
          duration: logDetails.duration,
          timestamp: Date.now()
        };
        room.callLogs.push(log);
        saveStore();
        io.to(userRoomCode).emit('call-log-added', log);
      }
    }
  });

  socket.on('disconnect', () => {
    if (userRoomCode) {
      const room = rooms[userRoomCode];
      if (room) {
        room.members = room.members.filter(m => m.socketId !== socket.id);
        socket.to(userRoomCode).emit('peer-left', userName);
        saveStore();
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {});
