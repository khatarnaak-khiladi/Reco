const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:5000',
      'http://localhost:8100',
      'http://192.168.1.*:*',
      /^https?:\/\/.*\.railway\.app$/,
      'capacitor://localhost',
      '*'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Room and user tracking
const rooms = new Map(); // { roomCode: { users: [{ id, name, socketId }], messages: [] } }
const userSockets = new Map(); // { socketId: { userId, name, roomCode } }

// Initialize room if not exists
function getOrCreateRoom(roomCode) {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      users: [],
      messages: [],
      createdAt: Date.now()
    });
  }
  return rooms.get(roomCode);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Stats endpoint for monitoring
app.get('/stats', (req, res) => {
  const activeRooms = rooms.size;
  const totalUsers = Array.from(rooms.values()).reduce((sum, room) => sum + room.users.length, 0);
  const totalMessages = Array.from(rooms.values()).reduce((sum, room) => sum + room.messages.length, 0);
  
  res.json({
    activeRooms,
    totalUsers,
    totalMessages,
    uptime: process.uptime()
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] User connected: ${socket.id}`);

  // Join room event
  socket.on('join_room', ({ roomCode, userName }, callback) => {
    try {
      if (!roomCode || !userName) {
        return callback({ success: false, error: 'Missing roomCode or userName' });
      }

      // Leave any previous room
      if (userSockets.has(socket.id)) {
        const previousRoom = userSockets.get(socket.id).roomCode;
        if (previousRoom) {
          socket.leave(previousRoom);
          broadcastUserLeft(previousRoom, userName);
        }
      }

      // Join new room
      socket.join(roomCode);
      const room = getOrCreateRoom(roomCode);

      // Check if user already in room
      const existingUserIndex = room.users.findIndex(u => u.name === userName);
      if (existingUserIndex >= 0) {
        room.users[existingUserIndex].socketId = socket.id;
      } else {
        room.users.push({
          id: `${roomCode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: userName,
          socketId: socket.id,
          joinedAt: Date.now()
        });
      }

      userSockets.set(socket.id, { userName, roomCode });

      // Send current room state to joining user
      callback({
        success: true,
        roomCode,
        users: room.users.map(u => ({ id: u.id, name: u.name })),
        messages: room.messages.slice(-50) // Last 50 messages
      });

      // Broadcast user joined
      io.to(roomCode).emit('user_joined', {
        userName,
        timestamp: Date.now(),
        users: room.users.map(u => ({ id: u.id, name: u.name }))
      });

      console.log(`[${new Date().toISOString()}] ${userName} joined room ${roomCode}. Users in room: ${room.users.length}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in join_room:`, error);
      callback({ success: false, error: error.message });
    }
  });

  // Send message event
  socket.on('send_message', ({ roomCode, message, timestamp }, callback) => {
    try {
      const userInfo = userSockets.get(socket.id);
      if (!userInfo) {
        return callback({ success: false, error: 'User not in a room' });
      }

      const room = getOrCreateRoom(roomCode);
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const msgData = {
        id: messageId,
        from: userInfo.userName,
        text: message,
        timestamp: timestamp || Date.now(),
        delivered: false
      };

      // Store message
      room.messages.push(msgData);
      if (room.messages.length > 200) {
        room.messages.shift(); // Keep only last 200
      }

      // Broadcast to all users in room
      io.to(roomCode).emit('receive_message', msgData);

      // Acknowledge delivery
      callback({ success: true, messageId, delivered: true });

      console.log(`[${new Date().toISOString()}] Message from ${userInfo.userName} in ${roomCode}: ${message.substring(0, 50)}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in send_message:`, error);
      callback({ success: false, error: error.message });
    }
  });

  // Get room users
  socket.on('get_room_users', ({ roomCode }, callback) => {
    try {
      const room = getOrCreateRoom(roomCode);
      callback({
        success: true,
        users: room.users.map(u => ({ id: u.id, name: u.name })),
        count: room.users.length
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in get_room_users:`, error);
      callback({ success: false, error: error.message });
    }
  });

  // Ping for connection check
  socket.on('ping', (callback) => {
    callback({ pong: true, timestamp: Date.now() });
  });

  // Disconnect
  socket.on('disconnect', () => {
    try {
      const userInfo = userSockets.get(socket.id);
      if (userInfo) {
        const { userName, roomCode } = userInfo;
        broadcastUserLeft(roomCode, userName);
        console.log(`[${new Date().toISOString()}] ${userName} disconnected from ${roomCode}`);
      }
      userSockets.delete(socket.id);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in disconnect:`, error);
    }
  });
});

// Helper function to broadcast user left
function broadcastUserLeft(roomCode, userName) {
  const room = getOrCreateRoom(roomCode);
  room.users = room.users.filter(u => u.name !== userName);
  
  io.to(roomCode).emit('user_left', {
    userName,
    timestamp: Date.now(),
    users: room.users.map(u => ({ id: u.id, name: u.name })),
    count: room.users.length
  });
  
  // Clean up empty room after 1 hour
  if (room.users.length === 0) {
    setTimeout(() => {
      const r = rooms.get(roomCode);
      if (r && r.users.length === 0) {
        rooms.delete(roomCode);
        console.log(`[${new Date().toISOString()}] Cleaned up empty room: ${roomCode}`);
      }
    }, 60 * 60 * 1000);
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught Exception:', error);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║  Socket.IO Chat Server Running                         ║
║  PORT: ${PORT}                                              ║
║  Environment: ${process.env.NODE_ENV || 'development'}                          ║
║  URL: ${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`}  ║
╚════════════════════════════════════════════════════════╝
  `);
});

module.exports = server;
