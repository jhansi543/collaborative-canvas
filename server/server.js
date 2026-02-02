/**
 * server.js
 * Express + Socket.io server initialization
 * Main server entry point
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DrawingStateManager } from './drawing-state.js';
import { RoomManager } from './rooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// Serve static files
app.use(express.static(join(__dirname, '../client')));

// Initialize managers
const drawingState = new DrawingStateManager();
const rooms = new RoomManager();

const PORT = process.env.PORT || 3000;

/**
 * Handle new socket connections
 */
io.on('connection', (socket) => {
    console.log(`[${new Date().toLocaleTimeString()}] User connected: ${socket.id}`);

    let currentUser = null;
    let currentRoom = 'main'; // Default room

    /**
     * User joins - initialize connection
     */
    socket.on('user_join', (userData) => {
        currentUser = {
            userId: socket.id,
            userName: userData.userName,
            userColor: userData.userColor,
            lastActive: Date.now(),
        };

        // Join room
        socket.join(currentRoom);
        rooms.addUser(currentRoom, currentUser);

        console.log(`User ${currentUser.userName} joined room ${currentRoom}`);

        // Send current canvas state to new user
        const state = drawingState.getState(currentRoom);
        socket.emit('canvas_state', state);

        // Send user list to all in room
        const users = rooms.getRoomUsers(currentRoom);
        io.to(currentRoom).emit('user_list', users);

        // Notify room that user joined
        socket.broadcast.to(currentRoom).emit('user_joined', currentUser);
    });

    /**
     * Handle drawing events
     */
    socket.on('draw', (drawData) => {
        if (!currentUser) return;

        // Add draw data with user info
        const enrichedData = {
            ...drawData,
            userId: currentUser.userId,
            timestamp: Date.now(),
        };

        // Add to drawing state
        drawingState.addStroke(currentRoom, enrichedData);

        // Broadcast to others in room
        socket.broadcast.to(currentRoom).emit('draw', enrichedData);

        currentUser.lastActive = Date.now();
    });

    /**
     * Handle undo events
     */
    socket.on('undo', () => {
        if (!currentUser) return;

        const undone = drawingState.undo(currentRoom, currentUser.userId);

        if (undone) {
            // Broadcast undo to room
            io.to(currentRoom).emit('undo', {
                userId: currentUser.userId,
                state: drawingState.getState(currentRoom),
            });

            console.log(`${currentUser.userName} undid action`);
        }

        currentUser.lastActive = Date.now();
    });

    /**
     * Handle redo events
     */
    socket.on('redo', () => {
        if (!currentUser) return;

        const redone = drawingState.redo(currentRoom, currentUser.userId);

        if (redone) {
            // Broadcast redo to room
            io.to(currentRoom).emit('redo', {
                userId: currentUser.userId,
                state: drawingState.getState(currentRoom),
            });

            console.log(`${currentUser.userName} redid action`);
        }

        currentUser.lastActive = Date.now();
    });

    /**
     * Handle clear canvas
     */
    socket.on('clear_canvas', () => {
        if (!currentUser) return;

        drawingState.clearCanvas(currentRoom);

        // Broadcast clear to room
        io.to(currentRoom).emit('clear_canvas', {
            userId: currentUser.userId,
        });

        console.log(`${currentUser.userName} cleared canvas`);
        currentUser.lastActive = Date.now();
    });

    /**
     * Handle cursor movement
     */
    socket.on('cursor_move', (data) => {
        if (!currentUser) return;

        // Broadcast cursor position to others
        socket.broadcast.to(currentRoom).emit('cursor_move', {
            userId: currentUser.userId,
            userName: currentUser.userName,
            userColor: currentUser.userColor,
            x: data.x,
            y: data.y,
        });
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
        if (currentUser) {
            console.log(`User ${currentUser.userName} disconnected`);

            // Remove from room
            rooms.removeUser(currentRoom, currentUser.userId);

            // Notify others
            io.to(currentRoom).emit('user_left', currentUser.userId);
            io.to(currentRoom).emit('user_list', rooms.getRoomUsers(currentRoom));
        }
    });

    /**
     * Handle errors
     */
    socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
    });
});

/**
 * Start server
 */
httpServer.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║  Collaborative Drawing Canvas Server               ║
║  Server running on http://localhost:${PORT}       ║
║  Open multiple browser tabs to test collaboration  ║
╚════════════════════════════════════════════════════╝
    `);
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
