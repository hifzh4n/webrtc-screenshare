const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');

const app = express();
const path = require('path');

const parseIntEnv = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCsv = (value, fallback = []) => {
    if (typeof value !== 'string' || !value.trim()) {
        return fallback;
    }
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
};

const DEFAULT_ROOM_ID = process.env.DEFAULT_ROOM_ID || 'main';
const MAX_TITLE_LENGTH = parseIntEnv(process.env.MAX_TITLE_LENGTH, 140);
const SOCKET_TRANSPORTS = parseCsv(process.env.SOCKET_TRANSPORTS, ['websocket']);
const CLIENT_DIST_DIR = path.resolve(process.env.CLIENT_DIST_DIR || path.join(__dirname, '../client/dist'));
const CLIENT_INDEX_FILE = path.join(CLIENT_DIST_DIR, 'index.html');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(origin);

const corsOptions = {
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('CORS origin not allowed'));
    },
    methods: ['GET', 'POST']
};

app.use(cors(corsOptions));

// Serve static files from the React app
app.use(express.static(CLIENT_DIST_DIR, { index: false }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: corsOptions,
    transports: SOCKET_TRANSPORTS
});

const roomState = new Map();
const metrics = {
    signal_offer_total: 0,
    signal_offer_invalid_total: 0,
    signal_answer_total: 0,
    signal_answer_invalid_total: 0,
    signal_candidate_total: 0,
    signal_candidate_invalid_total: 0,
    signal_resolution_total: 0,
    signal_resolution_invalid_total: 0,
    stream_ended_total: 0,
    disconnect_total: 0
};

const incrementMetric = (name) => {
    metrics[name] = (metrics[name] || 0) + 1;
    return metrics[name];
};

const logEvent = (event, payload = {}, level = 'info') => {
    const entry = {
        ts: new Date().toISOString(),
        level,
        event,
        payload
    };
    const serialized = JSON.stringify(entry);
    if (level === 'error') {
        console.error(serialized);
        return;
    }
    if (level === 'warn') {
        console.warn(serialized);
        return;
    }
    console.log(serialized);
};

const getRoomId = (value) => (typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_ROOM_ID);
const isObject = (value) => typeof value === 'object' && value !== null;
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isValidResolution = (value) => ['1080p', '720p', '480p', '360p'].includes(value);

const getOrCreateRoomState = (roomId) => {
    if (!roomState.has(roomId)) {
        roomState.set(roomId, { broadcasterId: null, title: '' });
    }
    return roomState.get(roomId);
};

const isSocketInRoom = (socketId, roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    return room ? room.has(socketId) : false;
};

const isValidSignalTarget = (sourceSocket, targetId) => {
    if (!isNonEmptyString(targetId)) {
        return false;
    }
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!targetSocket) {
        return false;
    }
    const roomId = sourceSocket.data.roomId;
    if (!roomId) {
        return false;
    }
    return targetSocket.data.roomId === roomId && isSocketInRoom(targetId, roomId);
};

const endBroadcastForRoom = (roomId, broadcasterId) => {
    const state = roomState.get(roomId);
    if (!state) {
        return;
    }
    if (state.broadcasterId === broadcasterId) {
        state.broadcasterId = null;
        state.title = '';
        incrementMetric('stream_ended_total');
        logEvent('broadcast.ended', { roomId, broadcasterId, metrics });
        io.to(roomId).emit('stream_ended');
    }
};

io.on('connection', (socket) => {
    logEvent('socket.connected', { socketId: socket.id });

    socket.on('join_broadcast', (payload = {}) => {
        const requestedRoom = isObject(payload) ? payload.roomId : undefined;
        const roomId = getRoomId(requestedRoom);
        const state = getOrCreateRoomState(roomId);

        if (state.broadcasterId && state.broadcasterId !== socket.id) {
            socket.emit('error_message', { message: 'A broadcaster is already active in this room.' });
            logEvent('broadcast.join_rejected', { socketId: socket.id, roomId }, 'warn');
            return;
        }

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.role = 'broadcaster';
        state.broadcasterId = socket.id;

        if (isObject(payload) && typeof payload.title === 'string') {
            state.title = payload.title.trim().slice(0, MAX_TITLE_LENGTH);
        }

        if (state.title) {
            socket.to(roomId).emit('stream_title', state.title);
        }

        const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
        if (!socketsInRoom) {
            return;
        }

        for (const memberId of socketsInRoom) {
            if (memberId === socket.id) {
                continue;
            }
            const memberSocket = io.sockets.sockets.get(memberId);
            if (memberSocket && memberSocket.data.role === 'watcher') {
                socket.emit('viewer_joined', memberId);
            }
        }

        logEvent('broadcast.joined', { socketId: socket.id, roomId });
    });

    socket.on('join_watch', (payload = {}) => {
        const requestedRoom = isObject(payload) ? payload.roomId : undefined;
        const roomId = getRoomId(requestedRoom);
        const state = getOrCreateRoomState(roomId);

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.role = 'watcher';

        if (state.title) {
            socket.emit('stream_title', state.title);
        }

        socket.to(roomId).emit('viewer_joined', socket.id);
        logEvent('watch.joined', { socketId: socket.id, roomId });
    });

    socket.on('offer', (data) => {
        if (socket.data.role !== 'broadcaster' || !isObject(data)) {
            incrementMetric('signal_offer_invalid_total');
            logEvent('signal.offer.invalid', { socketId: socket.id, reason: 'role_or_payload' }, 'warn');
            return;
        }
        if (!isValidSignalTarget(socket, data.target) || !isObject(data.offer)) {
            incrementMetric('signal_offer_invalid_total');
            logEvent('signal.offer.invalid', { socketId: socket.id, reason: 'target_or_offer' }, 'warn');
            return;
        }
        const title = typeof data.title === 'string' ? data.title.slice(0, MAX_TITLE_LENGTH) : '';
        incrementMetric('signal_offer_total');
        socket.to(data.target).emit('offer', { sender: socket.id, offer: data.offer, title });
    });

    socket.on('answer', (data) => {
        if (socket.data.role !== 'watcher' || !isObject(data)) {
            incrementMetric('signal_answer_invalid_total');
            logEvent('signal.answer.invalid', { socketId: socket.id, reason: 'role_or_payload' }, 'warn');
            return;
        }
        if (!isValidSignalTarget(socket, data.target) || !isObject(data.answer)) {
            incrementMetric('signal_answer_invalid_total');
            logEvent('signal.answer.invalid', { socketId: socket.id, reason: 'target_or_answer' }, 'warn');
            return;
        }
        incrementMetric('signal_answer_total');
        socket.to(data.target).emit('answer', { sender: socket.id, answer: data.answer });
    });

    socket.on('candidate', (data) => {
        if (!isObject(data)) {
            incrementMetric('signal_candidate_invalid_total');
            logEvent('signal.candidate.invalid', { socketId: socket.id, reason: 'payload' }, 'warn');
            return;
        }
        if (!isValidSignalTarget(socket, data.target) || !isObject(data.candidate)) {
            incrementMetric('signal_candidate_invalid_total');
            logEvent('signal.candidate.invalid', { socketId: socket.id, reason: 'target_or_candidate' }, 'warn');
            return;
        }
        incrementMetric('signal_candidate_total');
        socket.to(data.target).emit('candidate', { sender: socket.id, candidate: data.candidate });
    });

    socket.on('request_resolution', (data) => {
        if (socket.data.role !== 'watcher' || !isObject(data)) {
            incrementMetric('signal_resolution_invalid_total');
            logEvent('signal.request_resolution.invalid', { socketId: socket.id, reason: 'role_or_payload' }, 'warn');
            return;
        }
        if (!isValidSignalTarget(socket, data.target) || !isValidResolution(data.resolution)) {
            incrementMetric('signal_resolution_invalid_total');
            logEvent('signal.request_resolution.invalid', { socketId: socket.id, reason: 'target_or_resolution' }, 'warn');
            return;
        }
        incrementMetric('signal_resolution_total');
        socket.to(data.target).emit('request_resolution', { viewerId: socket.id, resolution: data.resolution });
    });

    socket.on('update_title', (payload) => {
        if (socket.data.role !== 'broadcaster' || !isObject(payload) || typeof payload.title !== 'string') {
            return;
        }
        const roomId = getRoomId(socket.data.roomId);
        const state = getOrCreateRoomState(roomId);
        if (state.broadcasterId !== socket.id) {
            return;
        }
        const title = payload.title.trim().slice(0, MAX_TITLE_LENGTH);
        state.title = title;
        socket.to(roomId).emit('stream_title', title);
    });

    socket.on('broadcast_ended', () => {
        if (socket.data.role !== 'broadcaster' || !socket.data.roomId) {
            return;
        }
        endBroadcastForRoom(socket.data.roomId, socket.id);
    });

    socket.on('disconnect', () => {
        incrementMetric('disconnect_total');
        logEvent('socket.disconnected', { socketId: socket.id, role: socket.data.role, roomId: socket.data.roomId });
        const roomId = socket.data.roomId;
        if (!roomId) {
            return;
        }

        if (socket.data.role === 'broadcaster') {
            endBroadcastForRoom(roomId, socket.id);
            return;
        }

        socket.to(roomId).emit('viewer_left', socket.id);
    });
});

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        uptimeSec: Math.floor(process.uptime()),
        rooms: roomState.size,
        metrics
    });
});

// Serve index.html only for client-side routes (non-file paths).
// Missing assets (e.g. /assets/*.css) should return 404, not HTML.
app.use((req, res) => {
    if (path.extname(req.path)) {
        res.status(404).json({ error: 'Asset not found', path: req.path });
        return;
    }

    if (!fs.existsSync(CLIENT_INDEX_FILE)) {
        res.status(503).json({
            error: 'Client build not found',
            detail: `Missing ${CLIENT_INDEX_FILE}. Run client build before starting server.`
        });
        return;
    }

    res.sendFile(CLIENT_INDEX_FILE);
});

const PORT = process.env.PORT || 3000;

const startServer = (port = PORT) => {
    return new Promise((resolve, reject) => {
        if (server.listening) {
            resolve(server);
            return;
        }

        server.listen(port, () => {
            logEvent('server.started', { port });
            resolve(server);
        });

        server.once('error', reject);
    });
};

const stopServer = () => {
    return new Promise((resolve, reject) => {
        if (!server.listening) {
            resolve();
            return;
        }

        server.close((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
};

if (require.main === module) {
    startServer().catch((err) => {
        logEvent('server.start_failed', { message: err?.message || 'unknown' }, 'error');
        process.exit(1);
    });
}

module.exports = {
    app,
    io,
    metrics,
    roomState,
    server,
    startServer,
    stopServer
};
