import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import Peer from 'simple-peer'
import {
    MessageSquare, Phone, Video, MoreVertical, Search,
    Send, Mic, X, LogOut, Users, Bell, Command, User, Lock
} from 'lucide-react'

// Initialize socket outside component to avoid multiple connections
const socket = io('http://localhost:5000');

function App() {
    const [me, setMe] = useState('')
    const [username, setUsername] = useState('')
    const [roomID, setRoomID] = useState('')
    const [isJoined, setIsJoined] = useState(false)

    const [users, setUsers] = useState([])
    const [selectedUser, setSelectedUser] = useState(null)
    const [messages, setMessages] = useState({}) // { userId: [msg1, msg2] }
    const [currentMessage, setCurrentMessage] = useState('')
    const [typing, setTyping] = useState(false)
    const [typingStatus, setTypingStatus] = useState({}) // { userId: boolean }

    const [stream, setStream] = useState(null)
    const [receivingCall, setReceivingCall] = useState(false)
    const [caller, setCaller] = useState('')
    const [callerSignal, setCallerSignal] = useState(null)
    const [callAccepted, setCallAccepted] = useState(false)
    const [idToCall, setIdToCall] = useState('')
    const [callEnded, setCallEnded] = useState(false)
    const [name, setName] = useState('')
    const [callType, setCallType] = useState('video') // video or voice

    const [notifications, setNotifications] = useState([])

    const myVideo = useRef()
    const userVideo = useRef()
    const connectionRef = useRef()
    const chatBottomRef = useRef()

    useEffect(() => {
        socket.on('connect', () => {
            setMe(socket.id)
        })

        socket.on('user_list', (userList) => {
            setUsers(userList.filter(u => u.id !== socket.id))
        })

        socket.on('user_joined', (data) => {
            addNotification(`User joined: ${data.username}`, 'info')
        })

        socket.on('user_left', (data) => {
            addNotification(`User left: ${data.username}`, 'info')
            setUsers(prev => prev.filter(u => u.id !== data.userId))
        })

        socket.on('receive_message', (data) => {
            const partnerId = data.senderId === socket.id ? data.receiverId : data.senderId;
            // If it's my own message (echo), verify logic. 
            // Server sends to receiver: io.to(receiver).emit('receive_message') AND socket.emit('receive_message')

            // We need to determine who the thread is with.
            // If I sent it, thread is with receiver. If I received it, thread is with sender.
            const threadId = data.senderId === socket.id ? data.receiverId : data.senderId;

            setMessages(prev => ({
                ...prev,
                [threadId]: [...(prev[threadId] || []), data]
            }))
        })

        socket.on('new_message_notification', (data) => {
            if (selectedUser?.id !== data.fromId) {
                addNotification(`New message from ${data.from}`, 'message')
            }
        })

        socket.on('user_typing', (data) => {
            setTypingStatus(prev => ({
                ...prev,
                [data.userId]: data.isTyping
            }))
        })

        socket.on('call_notification', (data) => {
            addNotification(`Incoming ${data.callType} call from ${data.from}`, 'call')
        })

        socket.on('incoming_call', (data) => {
            setReceivingCall(true)
            setCaller(data.from)
            setName(data.name)
            setCallerSignal(data.signal)
            setCallType(data.callType)
        })

        socket.on('call_ended', () => {
            leaveCall()
        })

        socket.on('call_rejected', () => {
            leaveCall()
            addNotification('Call rejected', 'error')
        })

        return () => {
            socket.off('connect')
            socket.off('user_list')
            socket.off('user_joined')
            socket.off('receive_message')
            socket.off('new_message_notification')
            socket.off('user_typing')
            socket.off('call_notification')
            socket.off('incoming_call')
            socket.off('call_ended')
            socket.off('call_rejected')
        }
    }, [selectedUser])

    useEffect(() => {
        if (chatBottomRef.current) {
            chatBottomRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, selectedUser])

    const addNotification = (text, type = 'info') => {
        const id = Date.now()
        setNotifications(prev => [...prev, { id, text, type }])
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id))
        }, 5000)
    }

    const joinRoom = (e) => {
        e.preventDefault()
        if (username && roomID) {
            socket.emit('join', { username, roomID })
            setIsJoined(true)

            // Get media permissions early
            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then((currentStream) => {
                    setStream(currentStream)
                    if (myVideo.current) {
                        myVideo.current.srcObject = currentStream
                    }
                })
                .catch(err => console.error("Media Error:", err))
        }
    }

    const sendMessage = (e) => {
        e && e.preventDefault()
        if (currentMessage.trim() && selectedUser) {
            const msgData = {
                receiverId: selectedUser.id,
                text: currentMessage,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
            socket.emit('send_message', msgData)
            setCurrentMessage('')
            setTyping(false)
            socket.emit('typing', { receiverId: selectedUser.id, isTyping: false })
        }
    }

    const handleTyping = (e) => {
        setCurrentMessage(e.target.value)
        if (!typing && selectedUser) {
            setTyping(true)
            socket.emit('typing', { receiverId: selectedUser.id, isTyping: true })
        }

        // Debounce typing off
        clearTimeout(window.typingTimeout)
        window.typingTimeout = setTimeout(() => {
            setTyping(false)
            if (selectedUser) socket.emit('typing', { receiverId: selectedUser.id, isTyping: false })
        }, 2000)
    }

    const callUser = (type) => {
        if (!selectedUser) return
        setCallType(type)

        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream: stream,
            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } // Add STUN
        })

        peer.on('signal', (data) => {
            socket.emit('call_user', {
                userToCall: selectedUser.id,
                signalData: data,
                from: me,
                name: username,
                callType: type
            })
        })

        peer.on('stream', (currentStream) => {
            if (userVideo.current) userVideo.current.srcObject = currentStream
        })

        socket.on('call_accepted', (signal) => {
            setCallAccepted(true)
            peer.signal(signal)
        })

        connectionRef.current = peer

        // UI state for outgoing call
        setCallAccepted(true) // Show the video UI immediately (waiting state)
    }

    const answerCall = () => {
        setCallAccepted(true)
        setReceivingCall(false) // No longer "receiving", now "active"

        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream: stream
        })

        peer.on('signal', (data) => {
            socket.emit('answer_call', { signal: data, to: caller })
        })

        peer.on('stream', (currentStream) => {
            if (userVideo.current) userVideo.current.srcObject = currentStream
        })

        peer.signal(callerSignal)
        connectionRef.current = peer
    }

    const leaveCall = () => {
        setCallEnded(true)
        if (connectionRef.current) connectionRef.current.destroy()
        socket.emit('end_call', { to: selectedUser ? selectedUser.id : caller })
        // Reset call states
        setCallAccepted(false)
        setReceivingCall(false)
        setCaller('')
        setCallerSignal(null)
        // Reload stream just in case
        // window.location.reload() // Bad UX, just reset state
    }

    const rejectCall = () => {
        socket.emit('reject_call', { to: caller })
        setReceivingCall(false)
        setCaller('')
        setCallerSignal(null)
    }

    if (!isJoined) {
        return (
            <div className="join-screen">
                <div className="join-card">
                    <div style={{ fontSize: '48px', marginBottom: '20px' }}>💬</div>
                    <h2>Join Chat Room</h2>
                    <form onSubmit={joinRoom}>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                        <input
                            type="text"
                            placeholder="Room ID"
                            value={roomID}
                            onChange={(e) => setRoomID(e.target.value)}
                            required
                        />
                        <button type="submit">Join Room</button>
                    </form>
                </div>

                <div className="notification-container">
                    {notifications.map(n => (
                        <div key={n.id} className={`notification ${n.type}`}>
                            <div className="notification-icon"><Bell size={20} /></div>
                            <div className="notification-content">
                                <div className="notification-message">{n.text}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="app-container">
            {/* Notifications */}
            <div className="notification-container">
                {notifications.map(n => (
                    <div key={n.id} className={`notification ${n.type}`} onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}>
                        <div className="notification-icon"><Bell size={20} /></div>
                        <div className="notification-content">
                            <div className="notification-message">{n.text}</div>
                        </div>
                        <button className="notification-close"><X size={14} /></button>
                    </div>
                ))}
            </div>

            {/* Call Overlay */}
            {callAccepted && (
                <div className="call-overlay">
                    <div className="video-container">
                        <div className="video-box">
                            <video playsInline muted ref={myVideo} autoPlay />
                            <div className="name-tag">You</div>
                        </div>
                        <div className="video-box">
                            <video playsInline ref={userVideo} autoPlay />
                            <div className="name-tag">{selectedUser?.username || name}</div>
                        </div>
                    </div>
                    <div className="call-actions">
                        <button className="call-btn btn-reject" onClick={leaveCall}>
                            <Phone size={24} style={{ transform: 'rotate(135deg)' }} />
                        </button>
                    </div>
                </div>
            )}

            {/* Incoming Call Modal */}
            {receivingCall && !callAccepted && (
                <div className="incoming-call-card">
                    <div className="user-avatar">{caller[0]?.toUpperCase()}</div>
                    <h3>{name}</h3>
                    <p>Incoming {callType} call...</p>
                    <div className="call-actions">
                        <button className="call-btn btn-reject" onClick={rejectCall}>
                            <X size={24} />
                        </button>
                        <button className="call-btn btn-accept" onClick={answerCall}>
                            <Phone size={24} />
                        </button>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <div className="sidebar">
                <div className="sidebar-header">
                    <div className="user-profile">
                        <div className="user-avatar">
                            {username[0]?.toUpperCase()}
                        </div>
                        <div className="user-info">
                            <h3>{username}</h3>
                            <p>Online</p>
                        </div>
                    </div>
                    <div className="header-icons">
                        <button className="icon-btn"><Command size={20} /></button>
                        <button className="icon-btn"><MoreVertical size={20} /></button>
                    </div>
                </div>

                <div className="search-container">
                    <div className="search-box">
                        <Search size={18} className="text-gray-400" />
                        <input type="text" placeholder="Search or start new chat" />
                    </div>
                </div>

                <div className="chat-list">
                    {users.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No other users in this room.
                        </div>
                    )}
                    {users.map(user => (
                        <div
                            key={user.id}
                            className={`chat-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                            onClick={() => setSelectedUser(user)}
                        >
                            <div className="user-avatar">
                                {user.username[0]?.toUpperCase()}
                            </div>
                            <div className="chat-info">
                                <div className="chat-name">
                                    <h4>{user.username}</h4>
                                    <span className="chat-time">
                                        {messages[user.id]?.slice(-1)[0]?.time || ''}
                                    </span>
                                </div>
                                <div className="last-msg">
                                    {typingStatus[user.id] ? (
                                        <span className="typing-indicator">Typing...</span>
                                    ) : (
                                        messages[user.id]?.slice(-1)[0]?.text || 'Start a conversation'
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Chat */}
            <div className="main-chat">
                {selectedUser ? (
                    <>
                        <div className="chat-header">
                            <div className="chat-user-info">
                                <div className="user-avatar">
                                    {selectedUser.username[0]?.toUpperCase()}
                                </div>
                                <div className="chat-user-details">
                                    <h4>{selectedUser.username}</h4>
                                    <div className="online-status">Online</div>
                                </div>
                            </div>
                            <div className="header-icons">
                                <button className="icon-btn" onClick={() => callUser('video')}><Video size={20} /></button>
                                <button className="icon-btn" onClick={() => callUser('voice')}><Phone size={20} /></button>
                                <button className="icon-btn"><Search size={20} /></button>
                            </div>
                        </div>

                        <div className="messages-area">
                            {messages[selectedUser.id]?.map((msg, index) => (
                                <div key={index} className={`msg-wrapper ${msg.senderId === me ? 'sent' : 'received'}`}>
                                    <div className={`msg-bubble ${msg.senderId === me ? 'sent' : 'received'}`}>
                                        {msg.text}
                                        <div className="msg-time">
                                            {msg.time}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={chatBottomRef} />
                        </div>

                        <form className="input-area" onSubmit={sendMessage}>
                            <button type="button" className="icon-btn"><MoreVertical size={20} /></button>
                            <input
                                type="text"
                                className="input-box"
                                placeholder="Type a message"
                                value={currentMessage}
                                onChange={handleTyping}
                            />
                            {currentMessage ? (
                                <button type="submit" className="send-btn"><Send size={20} /></button>
                            ) : (
                                <button type="button" className="icon-btn"><Mic size={20} /></button>
                            )}
                        </form>
                    </>
                ) : (
                    <div className="empty-state">
                        <div style={{ fontSize: '64px', opacity: 0.2 }}>👋</div>
                        <h2>Welcome to WhatsApp Clone</h2>
                        <p>Select a user from the sidebar to start messaging, calling, or sharing files with them securely.</p>
                        <div className="room-badge">Room ID: {roomID}</div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default App
