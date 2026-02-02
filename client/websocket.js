/**
 * websocket.js
 * WebSocket client code - Socket.io event listeners and emitters
 * Handles real-time communication with server
 */

export class WebSocketClient {
    constructor(socket) {
        this.socket = socket;
        this.userId = null;
        this.userName = `User-${Math.floor(Math.random() * 10000)}`;
        this.userColor = this.generateUserColor();
        this.remoteUsers = new Map(); // Track remote users
        this.callbacks = {};
    }

    /**
     * Generate a unique color for this user
     */
    generateUserColor() {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1',
            '#FFA07A', '#98D8C8', '#F7DC6F',
            '#BB8FCE', '#85C1E2', '#F8B88B'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Register a callback for a specific event
     */
    on(event, callback) {
        this.callbacks[event] = callback;
    }

    /**
     * Initialize connection and set up listeners
     */
    connect() {
        return new Promise((resolve) => {
            this.socket.on('connect', () => {
                console.log('Connected to server:', this.socket.id);
                this.userId = this.socket.id;

                // Emit that user is connected
                this.socket.emit('user_join', {
                    userId: this.userId,
                    userName: this.userName,
                    userColor: this.userColor,
                });

                // Notify app of connection
                if (this.callbacks['connected']) {
                    this.callbacks['connected']();
                }

                resolve();
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                if (this.callbacks['disconnected']) {
                    this.callbacks['disconnected']();
                }
            });

            this.setupEventListeners();
        });
    }

    /**
     * Set up all WebSocket event listeners
     */
    setupEventListeners() {
        // Receive drawing events from other users
        this.socket.on('draw', (data) => {
            if (this.callbacks['draw']) {
                this.callbacks['draw'](data);
            }
        });

        // Receive undo/redo events
        this.socket.on('undo', (data) => {
            if (this.callbacks['undo']) {
                this.callbacks['undo'](data);
            }
        });

        this.socket.on('redo', (data) => {
            if (this.callbacks['redo']) {
                this.callbacks['redo'](data);
            }
        });

        // Receive clear canvas event
        this.socket.on('clear_canvas', () => {
            if (this.callbacks['clear_canvas']) {
                this.callbacks['clear_canvas']();
            }
        });

        // Receive user joined notification
        this.socket.on('user_joined', (user) => {
            console.log('User joined:', user);
            this.remoteUsers.set(user.userId, user);
            if (this.callbacks['user_joined']) {
                this.callbacks['user_joined'](user);
            }
        });

        // Receive user left notification
        this.socket.on('user_left', (userId) => {
            console.log('User left:', userId);
            this.remoteUsers.delete(userId);
            if (this.callbacks['user_left']) {
                this.callbacks['user_left'](userId);
            }
        });

        // Receive list of connected users
        this.socket.on('user_list', (users) => {
            console.log('User list:', users);
            this.remoteUsers.clear();
            users.forEach(user => {
                if (user.userId !== this.userId) {
                    this.remoteUsers.set(user.userId, user);
                }
            });
            if (this.callbacks['user_list']) {
                this.callbacks['user_list'](users.filter(u => u.userId !== this.userId));
            }
        });

        // Receive cursor position from other users
        this.socket.on('cursor_move', (data) => {
            if (this.callbacks['cursor_move']) {
                this.callbacks['cursor_move'](data);
            }
        });

        // Receive canvas state (when joining)
        this.socket.on('canvas_state', (state) => {
            console.log('Received canvas state');
            if (this.callbacks['canvas_state']) {
                this.callbacks['canvas_state'](state);
            }
        });
    }

    /**
     * Emit a drawing event
     */
    emitDraw(drawData) {
        this.socket.emit('draw', drawData);
    }

    /**
     * Emit undo event
     */
    emitUndo() {
        this.socket.emit('undo');
    }

    /**
     * Emit redo event
     */
    emitRedo() {
        this.socket.emit('redo');
    }

    /**
     * Emit clear canvas event
     */
    emitClearCanvas() {
        this.socket.emit('clear_canvas');
    }

    /**
     * Emit cursor position
     */
    emitCursorMove(x, y) {
        this.socket.emit('cursor_move', {
            userId: this.userId,
            x,
            y,
        });
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.socket.disconnect();
    }

    /**
     * Get all remote users
     */
    getRemoteUsers() {
        return Array.from(this.remoteUsers.values());
    }
}
