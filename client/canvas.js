/**
 * canvas.js
 * Core drawing logic and coordinate handling
 * Handles all canvas operations: drawing, erasing, rendering
 */

export class DrawingCanvas {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.currentTool = 'brush';
        this.currentColor = '#000000';
        this.currentWidth = 3;
        this.lastPos = { x: 0, y: 0 };

        // Drawing history for undo/redo
        this.history = [];
        this.historyStep = -1;

        // Initialize canvas
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.redrawFromHistory();
    }

    /**
     * Get accurate canvas coordinates from mouse/touch event
     * Handles CSS scaling and DPI differences
     */
    getCanvasCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        // Handle both mouse and touch events
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }

    /**
     * Start drawing - called on mouse/touch down
     */
    startDrawing(event) {
        this.isDrawing = true;
        this.lastPos = this.getCanvasCoordinates(event);
    }

    /**
     * Continue drawing - called on mouse/touch move
     */
    draw(event, onDraw) {
        if (!this.isDrawing) return;

        const currentPos = this.getCanvasCoordinates(event);
        const drawData = {
            type: 'draw',
            tool: this.currentTool,
            start: this.lastPos,
            end: currentPos,
            color: this.currentColor,
            width: this.currentWidth,
        };

        // Draw locally
        this.drawStroke(drawData);

        // Emit to others
        if (onDraw) onDraw(drawData);

        this.lastPos = currentPos;
    }

    /**
     * Stop drawing - called on mouse/touch up
     */
    stopDrawing() {
        this.isDrawing = false;
    }

    /**
     * Apply a stroke to the canvas
     */
    drawStroke(drawData) {
        const { tool, start, end, color, width } = drawData;

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        if (tool === 'eraser') {
            this.ctx.clearRect(
                Math.min(start.x, end.x) - width / 2,
                Math.min(start.y, end.y) - width / 2,
                Math.abs(end.x - start.x) + width,
                Math.abs(end.y - start.y) + width
            );
        } else {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = width;
            this.ctx.beginPath();
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(end.x, end.y);
            this.ctx.stroke();
        }
    }

    /**
     * Add a drawing to history and save state
     */
    addToHistory(drawData) {
        // Remove redo history if we draw after undo
        this.history = this.history.slice(0, this.historyStep + 1);

        // Add new draw with metadata
        const strokeWithMeta = {
            ...drawData,
            createdAt: Date.now(),
        };

        this.history.push(strokeWithMeta);
        this.historyStep++;

        // Limit history size
        if (this.history.length > 1000) {
            this.history.shift();
            this.historyStep--;
        }
    }

    /**
     * Undo the last action globally
     * Note: Server determines what to undo (last stroke by anyone)
     */
    undo() {
        if (this.historyStep > -1) {
            this.historyStep--;
            this.redrawFromHistory();
            return true;
        }
        return false;
    }

    /**
     * Redo the last undone action
     * Note: Server determines what to redo (last undone stroke)
     */
    redo() {
        if (this.historyStep < this.history.length - 1) {
            this.historyStep++;
            this.redrawFromHistory();
            return true;
        }
        return false;
    }

    /**
     * Redraw entire canvas from history
     */
    redrawFromHistory() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Redraw all strokes up to current history step
        for (let i = 0; i <= this.historyStep; i++) {
            if (this.history[i]) {
                this.drawStroke(this.history[i]);
            }
        }
    }

    /**
     * Clear entire canvas
     */
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.history = [];
        this.historyStep = -1;
    }

    /**
     * Set the current drawing tool
     */
    setTool(tool) {
        this.currentTool = tool;
    }

    /**
     * Set the current drawing color
     */
    setColor(color) {
        this.currentColor = color;
    }

    /**
     * Set the current stroke width
     */
    setWidth(width) {
        this.currentWidth = width;
    }

    /**
     * Get canvas state for history sync
     */
    getState() {
        return {
            history: this.history,
            historyStep: this.historyStep,
        };
    }

    /**
     * Restore canvas state from server
     */
    setState(state) {
        this.history = state.history || [];
        this.historyStep = state.historyStep || -1;
        this.redrawFromHistory();
    }
}
