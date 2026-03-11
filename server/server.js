const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const path = require('path');
app.use(cors());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket']
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('offer', (data) => {
        // Broadcaster sends an offer targeted to a specific viewer
        socket.to(data.target).emit('offer', { sender: socket.id, offer: data.offer });
    });

    socket.on('answer', (data) => {
        // Viewer sends an answer targeted back to the broadcaster
        socket.to(data.target).emit('answer', { sender: socket.id, answer: data.answer });
    });

    socket.on('candidate', (data) => {
        // Route ICE candidates specifically to their target endpoint
        socket.to(data.target).emit('candidate', { sender: socket.id, candidate: data.candidate });
    });

    socket.on('join_watch', () => {
        // When a new watcher opens the page, announce them to room completely mapped 
        socket.broadcast.emit('viewer_joined', socket.id);
    });

    socket.on('broadcast_ended', () => {
        socket.broadcast.emit('stream_ended');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        socket.broadcast.emit('viewer_left', socket.id);
    });
});

// Catch-all to serve index.html for React Router
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
