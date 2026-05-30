import io from 'socket.io-client';

const STORAGE_KEY = 'chatServerUrl';

const getBackendUrl = () => {
  return "https://reco-production-8190.up.railway.app";
};

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = {};
  }

  connect(backendUrl = null) {
    return new Promise((resolve, reject) => {
      try {
        const url = backendUrl || getBackendUrl();
        console.log(`[SocketService] Connecting to ${url}`);

        this.socket = io(url, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
          transports: ['websocket', 'polling'],
          autoConnect: true,
        });

        this.socket.on('connect', () => {
          this.isConnected = true;
          console.log('[SocketService] Connected:', this.socket.id);
          this.emit('connected');
          resolve(this.socket.id);
        });

        this.socket.on('connect_error', (error) => {
          console.error('[SocketService] Connection error:', error);
          this.emit('connection_error', error);
          reject(error);
        });

        this.socket.on('reconnect_attempt', () => {
          console.log('[SocketService] Attempting to reconnect...');
          this.emit('reconnecting');
        });

        this.socket.on('reconnect', () => {
          this.isConnected = true;
          console.log('[SocketService] Reconnected');
          this.emit('reconnected');
        });

        this.socket.on('disconnect', () => {
          this.isConnected = false;
          console.log('[SocketService] Disconnected');
          this.emit('disconnected');
        });
      } catch (error) {
        console.error('[SocketService] Connection failed:', error);
        reject(error);
      }
    });
  }

  joinRoom(roomCode, userName) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        return reject(new Error('Socket not connected'));
      }

      this.socket.emit('join_room', { roomCode, userName }, (response) => {
        if (response.success) {
          console.log('[SocketService] Joined room:', roomCode);
          resolve(response);
        } else {
          console.error('[SocketService] Failed to join room:', response.error);
          reject(new Error(response.error));
        }
      });
    });
  }

  sendMessage(roomCode, message, timestamp) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        return reject(new Error('Socket not connected'));
      }

      this.socket.emit('send_message', { roomCode, message, timestamp }, (response) => {
        if (response.success) {
          console.log('[SocketService] Message sent:', response.messageId);
          resolve(response);
        } else {
          console.error('[SocketService] Failed to send message:', response.error);
          reject(new Error(response.error));
        }
      });
    });
  }

  getRoomUsers(roomCode) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        return reject(new Error('Socket not connected'));
      }

      this.socket.emit('get_room_users', { roomCode }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  ping() {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        return reject(new Error('Socket not connected'));
      }

      this.socket.emit('ping', (response) => {
        resolve(response);
      });
    });
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    if (this.socket) {
      this.socket.off(event);
      this.socket.on(event, (data) => {
        this.listeners[event].forEach((cb) => cb(data));
      });
    }
  }

  off(event) {
    if (this.listeners[event]) {
      delete this.listeners[event];
    }
    if (this.socket) {
      this.socket.off(event);
    }
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach((cb) => cb(data));
  }

  onReceiveMessage(callback) {
    this.on('receive_message', callback);
  }

  onUserJoined(callback) {
    this.on('user_joined', callback);
  }

  onUserLeft(callback) {
    this.on('user_left', callback);
  }

  onConnectionChange(callback) {
    this.on('connected', () => callback(true));
    this.on('disconnected', () => callback(false));
    this.on('reconnected', () => callback(true));
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
      console.log('[SocketService] Disconnected');
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      socketId: this.socket?.id || null,
    };
  }
}

const socketService = new SocketService();
export default socketService;
