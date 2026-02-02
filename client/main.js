/**
 * main.js
 * Application entry point and UI controller
 */

import { DrawingCanvas } from './canvas.js';
import { WebSocketClient } from './websocket.js';

class App {
    constructor() {
        // Initialize canvas
        this.canvas = new DrawingCanvas(document.getElementById('drawingCanvas'));

        // Initialize WebSocket
        const socket = io();
        this.ws = new WebSocketClient(socket);

        // Setup UI elements
        this.setupUIElements();

        // Setup event listeners
        this.setupEventListeners();

        // Connect to server
        this.connect();
    }

    /**
     * Setup UI element references
     */
    setupUIElements() {
        // Tools
        this.brushBtn = document.getElementById('brushTool');
        this.eraserBtn = document.getElementById('eraserTool');

        // Drawing settings
        this.colorPicker = document.getElementById('colorPicker');
        this.strokeWidth = document.getElementById('strokeWidth');
        this.strokeWidthValue = document.getElementById('strokeWidthValue');

        // Actions
        this.undoBtn = document.getElementById('undoBtn');
        this.redoBtn = document.getElementById('redoBtn');
        this.clearCanvasBtn = document.getElementById('clearCanvasBtn');

        // Info
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.userList = document.getElementById('userList');

        // Canvas
        this.cursorsLayer = document.getElementById('cursors');
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Tool selection
        this.brushBtn.addEventListener('click', () => this.selectTool('brush'));
        this.eraserBtn.addEventListener('click', () => this.selectTool('eraser'));

        // Color and width changes
        this.colorPicker.addEventListener('change', (e) => {
            this.canvas.setColor(e.target.value);
        });

        this.strokeWidth.addEventListener('input', (e) => {
            const width = e.target.value;
            this.canvas.setWidth(width);
            this.strokeWidthValue.textContent = width;
        });

        // Canvas events
        this.canvas.canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
        this.canvas.canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        this.canvas.canvas.addEventListener('mouseup', () => this.onCanvasMouseUp());
        this.canvas.canvas.addEventListener('mouseleave', () => this.onCanvasMouseUp());

        // Touch events
        this.canvas.canvas.addEventListener('touchstart', (e) => this.onCanvasMouseDown(e));
        this.canvas.canvas.addEventListener('touchmove', (e) => this.onCanvasMouseMove(e));
        this.canvas.canvas.addEventListener('touchend', () => this.onCanvasMouseUp());

        // Action buttons
        this.undoBtn.addEventListener('click', () => this.undo());
        this.redoBtn.addEventListener('click', () => this.redo());
        this.clearCanvasBtn.addEventListener('click', () => this.clearCanvas());

        // WebSocket events
        this.ws.on('connected', () => this.onConnected());
        this.ws.on('disconnected', () => this.onDisconnected());
        this.ws.on('draw', (data) => this.onRemoteDraw(data));
        this.ws.on('undo', (data) => this.onRemoteUndo(data));
        this.ws.on('redo', (data) => this.onRemoteRedo(data));
        this.ws.on('clear_canvas', () => this.onRemoteClearCanvas());
        this.ws.on('user_list', (users) => this.updateUserList(users));
        this.ws.on('cursor_move', (data) => this.updateRemoteCursor(data));
        this.ws.on('canvas_state', (state) => this.restoreCanvasState(state));
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        try {
            await this.ws.connect();
        } catch (err) {
            console.error('Connection error:', err);
        }
    }

    /**
     * Handle connection established
     */
    onConnected() {
        this.statusIndicator.classList.add('connected');
        this.statusText.textContent = 'Connected';
        console.log('App connected');
    }

    /**
     * Handle disconnection
     */
    onDisconnected() {
        this.statusIndicator.classList.remove('connected');
        this.statusText.textContent = 'Disconnected';
        console.log('App disconnected');
    }

    /**
     * Select drawing tool
     */
    selectTool(tool) {
        this.canvas.setTool(tool);

        // Update button states
        this.brushBtn.classList.toggle('active', tool === 'brush');
        this.eraserBtn.classList.toggle('active', tool === 'eraser');
    }

    /**
     * Canvas mouse down event
     */
    onCanvasMouseDown(e) {
        e.preventDefault();
        this.canvas.startDrawing(e);
    }

    /**
     * Canvas mouse move event
     */
    onCanvasMouseMove(e) {
        e.preventDefault();

        // Track cursor position for remote display
        const pos = this.canvas.getCanvasCoordinates(e);
        this.ws.emitCursorMove(pos.x, pos.y);

        // Draw locally
        if (this.canvas.isDrawing) {
            this.canvas.draw(e, (drawData) => {
                // Add to history
                this.canvas.addToHistory(drawData);

                // Send to server
                this.ws.emitDraw(drawData);
            });
        }
    }

    /**
     * Canvas mouse up event
     */
    onCanvasMouseUp() {
        this.canvas.stopDrawing();
    }

    /**
     * Handle remote draw event
     */
    onRemoteDraw(drawData) {
        this.canvas.drawStroke(drawData);
        this.canvas.addToHistory(drawData);
    }

    /**
     * Handle undo
     */
    undo() {
        if (this.canvas.undo()) {
            this.ws.emitUndo();
        }
    }

    /**
     * Handle remote undo
     */
    onRemoteUndo(data) {
        this.canvas.undo();
    }

    /**
     * Handle redo
     */
    redo() {
        if (this.canvas.redo()) {
            this.ws.emitRedo();
        }
    }

    /**
     * Handle remote redo
     */
    onRemoteRedo(data) {
        this.canvas.redo();
    }

    /**
     * Clear canvas
     */
    clearCanvas() {
        if (confirm('Are you sure you want to clear the canvas?')) {
            this.canvas.clearCanvas();
            this.ws.emitClearCanvas();
        }
    }

    /**
     * Handle remote clear canvas
     */
    onRemoteClearCanvas() {
        this.canvas.clearCanvas();
    }

    /**
     * Update user list display
     */
    updateUserList(users) {
        if (users.length === 0) {
            this.userList.innerHTML = '<p class="loading">No other users</p>';
            return;
        }

        this.userList.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="user-color" style="background-color: ${user.userColor}"></div>
                <span class="user-name">${user.userName}</span>
                <span class="user-status">●</span>
            </div>
        `).join('');
    }

    /**
     * Update remote user cursor position
     */
    updateRemoteCursor(data) {
        const { userId, x, y } = data;

        // Don't show our own cursor
        if (userId === this.ws.userId) return;

        const user = this.ws.remoteUsers.get(userId);
        if (!user) return;

        let cursorEl = document.getElementById(`cursor-${userId}`);

        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.id = `cursor-${userId}`;
            cursorEl.className = 'remote-cursor';
            cursorEl.innerHTML = `
                <div class="remote-cursor-pointer" style="border-color: ${user.userColor}"></div>
                <div class="remote-cursor-label" style="background-color: ${user.userColor}">${user.userName}</div>
            `;
            this.cursorsLayer.appendChild(cursorEl);
        }

        cursorEl.style.transform = `translate(${x}px, ${y}px)`;
    }

    /**
     * Restore canvas state from server
     */
    restoreCanvasState(state) {
        this.canvas.setState(state);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
