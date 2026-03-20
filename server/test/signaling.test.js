const test = require('node:test');
const assert = require('node:assert/strict');
const { io: Client } = require('socket.io-client');
const { startServer, stopServer, server } = require('../server');

const waitForEvent = (socket, event, timeoutMs = 3000) => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            socket.off(event, onEvent);
            reject(new Error(`Timed out waiting for ${event}`));
        }, timeoutMs);

        const onEvent = (payload) => {
            clearTimeout(timeout);
            resolve(payload);
        };

        socket.once(event, onEvent);
    });
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let baseUrl;

test.before(async () => {
    await startServer(0);
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
    await stopServer();
});

test('isolates signaling by room', async () => {
    const broadcasterA = Client(baseUrl, { transports: ['websocket'] });
    const broadcasterB = Client(baseUrl, { transports: ['websocket'] });
    const watcherA = Client(baseUrl, { transports: ['websocket'] });

    try {
        await Promise.all([
            waitForEvent(broadcasterA, 'connect'),
            waitForEvent(broadcasterB, 'connect'),
            waitForEvent(watcherA, 'connect')
        ]);

        broadcasterA.emit('join_broadcast', { roomId: 'room-a', title: 'Room A' });
        broadcasterB.emit('join_broadcast', { roomId: 'room-b', title: 'Room B' });

        const joinedOnA = waitForEvent(broadcasterA, 'viewer_joined');
        let joinedOnB = false;
        broadcasterB.once('viewer_joined', () => {
            joinedOnB = true;
        });

        watcherA.emit('join_watch', { roomId: 'room-a' });

        const viewerId = await joinedOnA;
        assert.equal(typeof viewerId, 'string');

        await wait(300);
        assert.equal(joinedOnB, false);
    } finally {
        broadcasterA.close();
        broadcasterB.close();
        watcherA.close();
    }
});

test('rejects invalid signaling payloads', async () => {
    const broadcaster = Client(baseUrl, { transports: ['websocket'] });
    const watcher = Client(baseUrl, { transports: ['websocket'] });

    try {
        await Promise.all([
            waitForEvent(broadcaster, 'connect'),
            waitForEvent(watcher, 'connect')
        ]);

        broadcaster.emit('join_broadcast', { roomId: 'validation-room' });
        watcher.emit('join_watch', { roomId: 'validation-room' });

        let answerReceived = false;
        broadcaster.once('answer', () => {
            answerReceived = true;
        });

        watcher.emit('answer', { target: broadcaster.id, answer: 'invalid-answer' });

        await wait(300);
        assert.equal(answerReceived, false);
    } finally {
        broadcaster.close();
        watcher.close();
    }
});

test('notifies watchers when broadcaster disconnects', async () => {
    const broadcaster = Client(baseUrl, { transports: ['websocket'] });
    const watcher = Client(baseUrl, { transports: ['websocket'] });

    try {
        await Promise.all([
            waitForEvent(broadcaster, 'connect'),
            waitForEvent(watcher, 'connect')
        ]);

        broadcaster.emit('join_broadcast', { roomId: 'disconnect-room', title: 'Disconnect Test' });
        const viewerJoinedPromise = waitForEvent(broadcaster, 'viewer_joined');
        watcher.emit('join_watch', { roomId: 'disconnect-room' });

        await viewerJoinedPromise;

        const streamEndedPromise = waitForEvent(watcher, 'stream_ended');

        broadcaster.close();

        await streamEndedPromise;
        assert.ok(true);
    } finally {
        watcher.close();
    }
});
