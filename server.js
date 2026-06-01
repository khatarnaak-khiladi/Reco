const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 8080;

// Room storage
const rooms = new Map();
const userSockets = new Map();

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

// Root route
app.get('/', (req, res) => {
  res.send('Socket.IO backend running');
});

// Health route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Stats route
app.get('/stats', (req, res) => {
  const activeRooms = rooms.size;
  const totalUsers = Array.from(rooms.values()).reduce(
    (sum, room) => sum + room.users.length,
    0
  );

  res.json({
    activeRooms,
    totalUsers,
    uptime: process.uptime()
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', ({ roomCode, userName }, callback) => {
    try {
      if (!roomCode || !userName) {
        return callback?.({
          success: false,
          error: 'Missing roomCode or userName'
        });
      }

      const room = getOrCreateRoom(roomCode);

      socket.join(roomCode);

      const existing = room.users.find(
        (u) => u.name === userName
      );

      if (!existing) {
        room.users.push({
          id: Date.now().toString(),
          name: userName,
          socketId: socket.id
        });
      }

      userSockets.set(socket.id, {
        roomCode,
        userName
      });

      callback?.({
        success: true,
        users: room.users,
        messages: room.messages
      });

      io.to(roomCode).emit('user_joined', {
        userName,
        users: room.users
      });

    } catch (err) {
      console.error(err);

      callback?.({
        success: false,
        error: err.message
      });
    }
  });

  socket.on('send_message', ({ roomCode, message }, callback) => {
    try {
      const userInfo = userSockets.get(socket.id);

      if (!userInfo) {
        return callback?.({
          success: false,
          error: 'Not joined to room'
        });
      }

      const room = getOrCreateRoom(roomCode);

      const msg = {
        id: Date.now().toString(),
        from: userInfo.userName,
        text: message,
        timestamp: Date.now()
      };

      room.messages.push(msg);

      io.to(roomCode).emit('receive_message', msg);

      callback?.({
        success: true
      });

    } catch (err) {
      console.error(err);

      callback?.({
        success: false,
        error: err.message
      });
    }
  });

  socket.on('disconnect', () => {
    const userInfo = userSockets.get(socket.id);

    if (userInfo) {
      const room = rooms.get(userInfo.roomCode);

      if (room) {
        room.users = room.users.filter(
          (u) => u.socketId !== socket.id
        );

        io.to(userInfo.roomCode).emit('user_left', {
          userName: userInfo.userName,
          users: room.users
        });
      }

      userSockets.delete(socket.id);
    }

    console.log('User disconnected:', socket.id);
  });
});

// Error logging
app.use((err, req, res, next) => {
  console.error('Express Error:', err);

  res.status(500).json({
    error: err.message
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.IO Chat Server Running`);
  console.log(`PORT: ${PORT}`);
});
