# Architecture Documentation

## System Overview

This document describes the technical architecture of the Collaborative Drawing Canvas application, a real-time multi-user drawing system.

## 1. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER A                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ HTML Canvas                                              │   │
│  │ ┌─────────────────────────────────────────────────────┐  │   │
│  │ │ User draws stroke                                   │  │   │
│  │ │ Mouse events captured                               │  │   │
│  │ │ Coordinates normalized                              │  │   │
│  │ └────────────┬──────────────────────────────────────┘  │   │
│  │              │                                          │   │
│  │              ↓                                          │   │
│  │ ┌──────────────────────────────────────────────────┐   │   │
│  │ │ canvas.js: DrawingCanvas                         │   │   │
│  │ │ • drawStroke()                                   │   │   │
│  │ │ • addToHistory()                                 │   │   │
│  │ │ • undo/redo logic                                │   │   │
│  │ └────────────┬──────────────────────────────────┘   │   │
│  │              │                                       │   │
│  │              ↓                                       │   │
│  │ ┌──────────────────────────────────────────────────┐   │   │
│  │ │ websocket.js: WebSocketClient                    │   │   │
│  │ │ • emitDraw()                                     │   │   │
│  │ │ • emitUndo()                                     │   │   │
│  │ │ • emitCursorMove()                               │   │   │
│  │ └────────────┬──────────────────────────────────┘   │   │
│  └─────────────┼────────────────────────────────────────┘   │
│                │                                            │
│         Socket.io over WebSocket                             │
│                │                                            │
│                ↓                                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│          ┌─────────────────────────────────────────┐        │
│          │         NODE.JS SERVER                  │        │
│          │   ┌──────────────────────────────────┐  │        │
│          │   │ server.js: Main Socket.io Server │  │        │
│          │   │ • Connection management           │  │        │
│          │   │ • Event handlers                  │  │        │
│          │   │ • Broadcasting                    │  │        │
│          │   └──────┬────────────────────────────┘  │        │
│          │          │                               │        │
│          │   ┌──────↓────────────────────────────┐  │        │
│          │   │ rooms.js: RoomManager            │  │        │
│          │   │ • Room creation/deletion          │  │        │
│          │   │ • User tracking per room          │  │        │
│          │   │ • Room isolation                  │  │        │
│          │   └──────┬────────────────────────────┘  │        │
│          │          │                               │        │
│          │   ┌──────↓────────────────────────────┐  │        │
│          │   │ drawing-state.js: StateManager    │  │        │
│          │   │ • Drawing history storage         │  │        │
│          │   │ • Undo/Redo logic                 │  │        │
│          │   │ • Global state reconstruction     │  │        │
│          │   └──────────────────────────────────┘  │        │
│          └─────────────────────────────────────────┘        │
│                │                                            │
│                ↓                                            │
├──────────────────────────────────────────────────────────────┤
│                Socket.io Broadcast                           │
│                │                                            │
│                ├─→ CLIENT BROWSER B (draw event)            │
│                ├─→ CLIENT BROWSER C (draw event)            │
│                └─→ All other clients...                    │
└──────────────────────────────────────────────────────────────┘
```

## 2. WebSocket Protocol Specification

### Connection Lifecycle

```
Client                          Server
  │                               │
  ├─── Socket.io handshake ──────→│
  │                               │
  ├─── user_join event ──────────→│
  │    {userName, userColor}      │
  │                               │
  │←─── canvas_state event ───────┤
  │     {history, historyStep}    │
  │                               │
  │←─── user_list event ──────────┤
  │     [users...]                │
  │                               │
  │←─── user_joined broadcast ────┤
  │     {userId, userName, ...}   │
  │                               │
  ├─── draw/undo/redo events ────→│ ← Broadcast to other clients
  │                               │
  │←─── Events from other users ──┤
  │                               │
  └─── disconnect ──────────────→│
       (automatic on page close)
```

### Message Schemas

#### Draw Event
```json
{
  "type": "draw",
  "tool": "brush" | "eraser",
  "start": {"x": 100, "y": 200},
  "end": {"x": 105, "y": 205},
  "color": "#FF0000",
  "width": 3,
  "userId": "socket-id-xyz",
  "timestamp": 1704067200000
}
```

#### Undo/Redo Event
```json
{
  "userId": "socket-id-xyz",
  "state": {
    "history": [/* strokes array */],
    "historyStep": 42
  }
}
```

#### User Management
```json
{
  "userId": "socket-id-xyz",
  "userName": "User-5234",
  "userColor": "#FF6B6B",
  "lastActive": 1704067200000
}
```

## 3. Undo/Redo Strategy

### Global Undo Design

The undo/redo system maintains global consistency - **ANY user can undo ANY stroke**:

```
Drawing History (Server maintains):
┌────────────────────────────────────────────────────┐
│ [0] stroke by User A - color: blue                 │
│ [1] stroke by User B - color: red                  │
│ [2] stroke by User A - color: green                │
│ [3] stroke by User B - color: yellow               │
│ [4] stroke by User A - color: purple               │ ← historyIndex = 4
└────────────────────────────────────────────────────┘

User B clicks Undo:
- Server finds last stroke (index 4, by User A)
- Marks stroke[4].undone = true, undoneBy = User B
- Redraws: shows strokes 0,1,2,3 (index 4 skipped)
- Broadcasts new state to ALL clients
- User A sees their purple stroke disappear!
- User B can see they were the one who undid it

User B clicks Undo again:
- Server finds last non-undone stroke (index 3, by User B)
- Marks stroke[3].undone = true
- Redraws: shows strokes 0,1,2
- All users see same result

User A clicks Redo:
- Server finds next undone stroke (index 3)
- Marks stroke[3].undone = false
- Redraws: shows strokes 0,1,2,3
- User B's yellow stroke comes back
```

### Key Properties
- **Truly Global**: Any user can undo any other user's strokes (core requirement!)
- **Last-First ordering**: Always undo the most recent stroke
- **Broadcast Sync**: All clients receive updated state immediately
- **Metadata Tracking**: Records who undid what and when
- **No Conflicts**: Linear history, no branching or merging needed
- **Transparency**: Full audit trail of undo/redo actions

## 4. Coordinate System

### Canvas Coordinate Normalization

**Problem**: Canvas internal coordinates differ from CSS coordinates
- CSS pixels: Based on display resolution
- Canvas pixels: Based on canvas element dimensions
- DPI scaling on high-res displays

**Solution**:
```javascript
function getCanvasCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    
    // Calculate scale factors
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Transform event coordinates to canvas coordinates
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}
```

**Why this matters**: Without scaling, drawing would be offset on different screen sizes or high-DPI displays.

## 5. Performance Decisions

### Event Batching
- **Current**: Each mouse move emits a draw event
- **Why**: Immediate visual feedback for local user
- **Optimization**: Could batch multiple strokes per frame for network efficiency

### History Limits
- **Max strokes**: 5000 per room
- **Why**: Prevent memory exhaustion on long-running servers
- **Impact**: If exceeded, oldest strokes are removed

### Room Isolation
- **Separate canvases**: Each room has independent history
- **Why**: Multiple simultaneous collaborative sessions
- **Scalability**: Server can handle N rooms without cross-contamination

### Canvas Resizing
- **Trigger**: window resize event
- **Action**: Recalculate dimensions, redraw from history
- **Why**: Responsive design support

## 6. Conflict Resolution

### Simultaneous Drawing

**Scenario**: User A and User B draw at exact same timestamp

```
Server Receives:
- Draw from User A: timestamp 1704067200000
- Draw from User B: timestamp 1704067200000

Solution:
- Both strokes added to history in order received
- No merge needed - strokes are independent paths
- Final image shows both strokes layered
- Undo works independently for each user
```

**Algorithm**: First-come, first-serve with timestamp ordering

### Overlapping Strokes
- Canvas rendering naturally handles overlaps
- Later strokes drawn on top of earlier strokes
- No special conflict logic needed
- Each stroke is independent drawing operation

## 7. State Synchronization

### New User Joining

```javascript
1. Client connects via Socket.io
2. Client emits 'user_join' event
3. Server receives join:
   - Retrieves full drawing history
   - Calculates current state (non-undone strokes only)
   - Sends 'canvas_state' event back
4. Client receives state:
   - Clears local canvas
   - Replays all strokes from history
   - Canvas now matches all other users
5. Server broadcasts 'user_joined' to room
6. All clients receive updated user list
```

### Consistency Guarantee
- New users always join with identical canvas state
- History-based synchronization ensures correctness
- No need for operational transformation
- Simple "replay" approach is sufficient

## 8. Error Handling

### Connection Failures
- Socket.io auto-reconnects with exponential backoff
- Client shows "Disconnected" status
- User can continue drawing locally
- Drawings sync when connection restored

### Server Restart
- All in-memory history is lost
- Clients reconnect, receive empty canvas
- No data persistence (by design)
- Could add MongoDB/Firebase for persistence

### Concurrent Operations
- All events are processed sequentially on server
- No race conditions due to single-threaded Node.js
- Events ordered by server receive time

## 9. Scalability Considerations

### Current Limitations
- **Single server**: One Node.js process
- **Memory-bound**: History stored in RAM
- **Users per room**: Tested with ~5 concurrent users
- **Total bandwidth**: Grows with number of strokes

### Scaling Strategies
1. **Horizontal Scaling**: 
   - Multiple Node.js servers behind load balancer
   - Socket.io adapter for session sharing (Redis)

2. **Database Integration**:
   - Move history to MongoDB/PostgreSQL
   - Reduce server memory usage

3. **History Compression**:
   - Delta encoding for similar strokes
   - Brotli compression for network transmission

4. **Canvas Snapshots**:
   - Save periodic PNG snapshots
   - Send only deltas since last snapshot

## 10. Security Notes

### Current Implementation (No Auth)
- All users have equal permissions
- No user authentication
- No drawing ownership/deletion
- Open to public (if deployed)

### Production Security
- Add JWT authentication
- Validate stroke data server-side
- Rate limit draw events per user
- Sanitize user names
- HTTPS/WSS for encryption
- CORS restrictions

## 11. Browser Compatibility

### Supported Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Requirements
- HTML5 Canvas API
- WebSocket support
- ES6 Module support

### Fallbacks Needed
- Older browsers: Polyfills for Promise, Map
- No WebSocket: Socket.io fallbacks to polling

## 12. Testing Strategy

### Unit Tests
- Canvas coordinate transformation
- Drawing stroke logic
- Undo/redo state management

### Integration Tests
- Multiple client connections
- Simultaneous drawing
- Undo/redo across users

### Load Tests
- 10+ concurrent users
- 1000+ strokes per session
- Network latency simulation

### E2E Tests
- User journey from join to drawing to undo
- Multi-browser synchronization

---

**Architecture Design Complete**

This system prioritizes:
1. **Simplicity**: Easy to understand and maintain
2. **Correctness**: Global consistency guaranteed
3. **Performance**: Fast local drawing + network efficiency
4. **Scalability**: Can be extended for 1000s of users

