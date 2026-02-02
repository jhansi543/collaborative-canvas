/**
 * rooms.js
 * Room handling - isolating different drawing sessions
 * Manages multiple collaborative rooms
 */

export class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomId -> { users: [], metadata: {} }
    }

    /**
     * Create a new room
     */
    createRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                users: [],
                createdAt: Date.now(),
            });
            console.log(`Room created: ${roomId}`);
        }
        return this.rooms.get(roomId);
    }

    /**
     * Add user to room
     */
    addUser(roomId, user) {
        if (!this.rooms.has(roomId)) {
            this.createRoom(roomId);
        }

        const room = this.rooms.get(roomId);

        // Prevent duplicates
        if (!room.users.find(u => u.userId === user.userId)) {
            room.users.push(user);
            console.log(`[${roomId}] User added: ${user.userName} (Total: ${room.users.length})`);
        }
    }

    /**
     * Remove user from room
     */
    removeUser(roomId, userId) {
        if (!this.rooms.has(roomId)) return;

        const room = this.rooms.get(roomId);
        const beforeCount = room.users.length;

        room.users = room.users.filter(u => u.userId !== userId);

        if (beforeCount !== room.users.length) {
            console.log(`[${roomId}] User removed (Total: ${room.users.length})`);
        }

        // Delete empty rooms
        if (room.users.length === 0) {
            this.rooms.delete(roomId);
            console.log(`Room deleted: ${roomId}`);
        }
    }

    /**
     * Get all users in a room
     */
    getRoomUsers(roomId) {
        if (!this.rooms.has(roomId)) {
            this.createRoom(roomId);
        }
        return this.rooms.get(roomId).users;
    }

    /**
     * Get user count in room
     */
    getRoomUserCount(roomId) {
        return this.getRoomUsers(roomId).length;
    }

    /**
     * Check if room exists and has users
     */
    roomExists(roomId) {
        return this.rooms.has(roomId) && this.rooms.get(roomId).users.length > 0;
    }

    /**
     * Get all active rooms
     */
    getAllRooms() {
        return Array.from(this.rooms.entries()).map(([roomId, data]) => ({
            roomId,
            userCount: data.users.length,
            createdAt: data.createdAt,
        }));
    }

    /**
     * Get server statistics
     */
    getStats() {
        let totalUsers = 0;
        let totalRooms = 0;

        for (const room of this.rooms.values()) {
            totalUsers += room.users.length;
            totalRooms++;
        }

        return {
            totalRooms,
            totalUsers,
            activeRooms: this.getAllRooms(),
        };
    }
}
