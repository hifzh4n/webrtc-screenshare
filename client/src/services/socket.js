import { io } from 'socket.io-client';
import { incrementMetric, logTelemetry } from '../lib/telemetry';

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

const URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3000');
const transports = parseCsv(import.meta.env.VITE_SOCKET_TRANSPORTS, ['websocket']);

export const socket = io(URL, {
    transports,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: parseIntEnv(import.meta.env.VITE_SOCKET_RECONNECTION_ATTEMPTS, 10),
    reconnectionDelay: parseIntEnv(import.meta.env.VITE_SOCKET_RECONNECTION_DELAY, 800),
    reconnectionDelayMax: parseIntEnv(import.meta.env.VITE_SOCKET_RECONNECTION_DELAY_MAX, 4000),
    timeout: parseIntEnv(import.meta.env.VITE_SOCKET_TIMEOUT, 20000)
});

socket.on('connect', () => {
    incrementMetric('socket_connect_total');
    logTelemetry('socket.connect', { socketId: socket.id, url: URL });
});

socket.on('disconnect', (reason) => {
    incrementMetric('socket_disconnect_total');
    logTelemetry('socket.disconnect', { reason }, 'warn');
});

socket.on('reconnect_attempt', (attempt) => {
    incrementMetric('socket_reconnect_attempt_total');
    logTelemetry('socket.reconnect_attempt', { attempt }, 'warn');
});

socket.on('connect_error', (err) => {
    incrementMetric('socket_connect_error_total');
    logTelemetry('socket.connect_error', { message: err?.message || 'unknown' }, 'error');
});
