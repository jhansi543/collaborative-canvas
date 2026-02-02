/**
 * drawing-state.js
 * Canvas state logic - manages drawing history across clients
 * Handles undo/redo globally across all users
 */

export class DrawingStateManager {
    constructor() {
        this.rooms = new Map(); // roomId -> { history: [], historyIndex: -1 }
    }

    /**
     * Initialize room drawing state
     */
    initializeRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                history: [],
                historyIndex: -1,
                historyStack: [], // For per-user undo tracking
            });
        }
        return this.rooms.get(roomId);
    }

    /**
     * Add a stroke to the drawing history
     */
    addStroke(roomId, strokeData) {
        const state = this.initializeRoom(roomId);

        // Remove any redo history if new stroke after undo
        state.history = state.history.slice(0, state.historyIndex + 1);

        // Add new stroke
        state.history.push(strokeData);
        state.historyIndex++;

        // Limit history size (keep last 5000 strokes)
        if (state.history.length > 5000) {
            state.history.shift();
            state.historyIndex--;
        }

        console.log(`[${roomId}] Stroke added. History size: ${state.history.length}`);
    }

    /**
     * Undo the LAST stroke globally (any user)
     * This allows any user to undo any stroke, making it truly collaborative
     * This is the key feature of global undo/redo
     */
    undo(roomId, userId) {
        const state = this.initializeRoom(roomId);

        // Find the last non-undone stroke (regardless of user)
        for (let i = state.historyIndex; i >= 0; i--) {
            if (state.history[i] && !state.history[i].undone) {
                // Mark this stroke as undone
                const stroke = state.history[i];
                const strokeUserId = stroke.userId;
                stroke.undone = true;
                stroke.undoneBy = userId;
                stroke.undoneAt = Date.now();

                state.historyIndex = i - 1;
                console.log(`[${roomId}] User ${userId} undid stroke by ${strokeUserId}`);
                return true;
            }
        }

        console.log(`[${roomId}] Nothing to undo (called by ${userId})`);
        return false;
    }

    /**
     * Redo the last undone stroke globally
     * Can redo any stroke that was undone, by any user
     */
    redo(roomId, userId) {
        const state = this.initializeRoom(roomId);

        // Find next undone stroke (regardless of original user)
        for (let i = state.historyIndex + 1; i < state.history.length; i++) {
            if (state.history[i] && state.history[i].undone) {
                // Restore this stroke
                state.history[i].undone = false;
                state.historyIndex = i;
                console.log(`[${roomId}] User ${userId} redid stroke by ${state.history[i].userId}`);
                return true;
            }
        }

        console.log(`[${roomId}] Nothing to redo (called by ${userId})`);
        return false;
    }

    /**
     * Clear all drawing from canvas
     */
    clearCanvas(roomId) {
        const state = this.initializeRoom(roomId);
        state.history = [];
        state.historyIndex = -1;
        console.log(`[${roomId}] Canvas cleared`);
    }

    /**
     * Get current canvas state (all non-undone strokes)
     */
    getState(roomId) {
        const state = this.initializeRoom(roomId);

        // Filter out undone strokes
        const activeStrokes = state.history
            .slice(0, state.historyIndex + 1)
            .filter(stroke => !stroke.undone);

        return {
            history: activeStrokes,
            historyStep: activeStrokes.length - 1,
        };
    }

    /**
     * Rebuild canvas from history
     * Called when client needs to redraw everything
     */
    rebuildCanvas(roomId) {
        const state = this.initializeRoom(roomId);
        return this.getState(roomId);
    }

    /**
     * Get full history for analysis
     */
    getFullHistory(roomId) {
        const state = this.initializeRoom(roomId);
        return state.history;
    }

    /**
     * Get statistics about room drawing
     */
    getStats(roomId) {
        const state = this.initializeRoom(roomId);
        const strokes = state.history;
        const users = new Set(strokes.map(s => s.userId));

        return {
            totalStrokes: strokes.length,
            undoneStrokes: strokes.filter(s => s.undone).length,
            activeStrokes: strokes.filter(s => !s.undone).length,
            uniqueUsers: users.size,
            currentHistoryIndex: state.historyIndex,
        };
    }
}
