const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, '../dist')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Handle SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const users = new Map(); // socket.id -> {id, username, roomID}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', ({ username, roomID }) => {
        socket.join(roomID);
        users.set(socket.id, { id: socket.id, username, roomID });

        const roomUsers = Array.from(users.values()).filter(u => u.roomID === roomID);
        io.to(roomID).emit('user_list', roomUsers);

        // Notify others that user joined
        socket.to(roomID).emit('user_joined', { username, userId: socket.id });
    });

    socket.on('send_message', (data) => {
        const user = users.get(socket.id);
        if (user) {
            const messageData = {
                ...data,
                id: Date.now(),
                sender: user.username,
                senderId: socket.id
            };
            // Send to receiver with notification flag
            io.to(data.receiverId).emit('receive_message', messageData);
            io.to(data.receiverId).emit('new_message_notification', {
                from: user.username,
                fromId: socket.id,
                text: data.text,
                time: messageData.time
            });
            socket.emit('receive_message', messageData);
        }
    });

    // Typing indicator
    socket.on('typing', ({ receiverId, isTyping }) => {
        const user = users.get(socket.id);
        if (user) {
            io.to(receiverId).emit('user_typing', {
                userId: socket.id,
                username: user.username,
                isTyping
            });
        }
    });

    // Call with type (voice or video)
    socket.on('call_user', ({ userToCall, signalData, from, name, callType }) => {
        io.to(userToCall).emit('incoming_call', {
            signal: signalData,
            from,
            name,
            callType: callType || 'video' // 'video' or 'voice'
        });

        // Send notification
        io.to(userToCall).emit('call_notification', {
            from: name,
            fromId: from,
            callType: callType || 'video'
        });
    });

    socket.on('answer_call', (data) => {
        io.to(data.to).emit('call_accepted', data.signal);
    });

    socket.on('reject_call', ({ to }) => {
        io.to(to).emit('call_rejected');
    });

    socket.on('end_call', ({ to }) => {
        io.to(to).emit('call_ended');
    });

    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            const roomID = user.roomID;
            users.delete(socket.id);
            const roomUsers = Array.from(users.values()).filter(u => u.roomID === roomID);
            io.to(roomID).emit('user_list', roomUsers);

            // Notify others that user left
            socket.to(roomID).emit('user_left', { username: user.username, userId: socket.id });
        }
        console.log('User disconnected');
    });
});

const PORT = 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
