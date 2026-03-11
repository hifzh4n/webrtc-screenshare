import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Volume2, VolumeX, Maximize, MessageSquare, Heart, Share2, AlertCircle, Settings } from 'lucide-react';
import { socket } from '../services/socket';
import { createPeerConnection, createAnswer } from '../services/webrtc';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

function Watch() {
    const videoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const broadcasterSocketIdRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState(false);
    const [isMuted, setIsMuted] = useState(true); // Must start True for mobile Autoplay to work organically!
    const [streamTitle, setStreamTitle] = useState('Waiting for Broadcast...');
    const [viewerResolution, setViewerResolution] = useState('1080p');

    useEffect(() => {
        // Actively let the system know this socket wants to watch a stream
        socket.emit('join_watch');

        socket.on('offer', async ({ sender, offer, title }) => {
            if (title) setStreamTitle(title);
            broadcasterSocketIdRef.current = sender;
            try {
                const peerConnection = createPeerConnection();
                peerConnectionRef.current = peerConnection;

                peerConnection.ontrack = (event) => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = event.streams[0];
                        videoRef.current.onloadedmetadata = () => {
                            videoRef.current.play().catch(console.error);
                        };
                        setIsPlaying(true);
                        setError(false);
                    }
                };

                peerConnection.oniceconnectionstatechange = () => {
                    if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
                        setIsPlaying(false);
                        setError(true);
                    }
                };

                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        socket.emit('candidate', { target: sender, candidate: event.candidate });
                    }
                };

                const answer = await createAnswer(peerConnection, offer);
                socket.emit('answer', { target: sender, answer });
            } catch (err) {
                console.error("Watch error:", err);
                setError(true);
            }
        });

        socket.on('candidate', async ({ candidate }) => {
            if (peerConnectionRef.current && candidate) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        socket.on('stream_title', (title) => {
            setStreamTitle(title);
        });

        socket.on('stream_ended', () => {
            setIsPlaying(false);
            if (videoRef.current) videoRef.current.srcObject = null;
            setStreamTitle('Broadcast Ended');
        });

        return () => {
            socket.off('offer');
            socket.off('candidate');
            socket.off('stream_title');
            socket.off('stream_ended');
        };
    }, []);

    const toggleFullscreen = () => {
        const elem = videoRef.current;
        if (!elem) return;

        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(err => console.error(err));
            } else if (elem.webkitRequestFullscreen) { /* Safari */
                elem.webkitRequestFullscreen();
            } else if (elem.webkitEnterFullscreen) { /* iOS Safari video specifically */
                elem.webkitEnterFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            }
        }
    };

    const handleResolutionChange = (e) => {
        const resolution = e.target.value;
        setViewerResolution(resolution);

        if (broadcasterSocketIdRef.current) {
            socket.emit('request_resolution', {
                target: broadcasterSocketIdRef.current,
                resolution
            });
        }
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="w-full h-screen flex flex-col lg:flex-row bg-black overflow-hidden font-sans"
        >
            {/* Main Streaming Area */}
            <div className="flex-1 relative flex items-center justify-center bg-black h-[60vh] lg:h-full">
                {/* Live Badge Component */}
                <div className="absolute top-6 left-6 z-20">
                    <Badge className="bg-primary/90 hover:bg-primary font-bold tracking-widest text-white shadow-xl px-4 py-1.5 uppercase drop-shadow-lg backdrop-blur-md gap-2 rounded-full border border-primary/50">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                        LIVE
                    </Badge>
                </div>

                {/* Video Fallback / Loader */}
                {!isPlaying && !error && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#050505]">
                        <div className="w-16 h-16 rounded-full border-4 border-[#222] border-t-primary animate-spin mb-6"></div>
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm animate-pulse">Awaiting Stream Match</p>
                        <p className="text-gray-600 font-medium text-xs mt-2 text-center max-w-xs">The broadcast will automatically resume when the host goes live.</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0f0f0f]">
                        <AlertCircle className="w-16 h-16 text-yellow-500 mb-6 opacity-80" />
                        <p className="text-gray-300 font-bold uppercase tracking-widest text-sm">Connection Lost</p>
                        <Button variant="outline" className="mt-4 border-[#333] hover:bg-[#222] rounded-full" onClick={() => window.location.reload()}>Reconnect</Button>
                    </div>
                )}

                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isMuted}
                    className={`w-full h-full object-contain bg-black transition-opacity duration-1000 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
                />

                {/* Player Overlay Controls */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-end">
                    <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent p-6 pt-24 opacity-0 hover:opacity-100 transition-all duration-300 pointer-events-auto flex items-end justify-between z-20">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">{streamTitle}</h1>
                            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-gray-300">
                                <span className="hidden sm:inline">SportsCast Premium</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-4">
                            <Button size="icon" variant="ghost" className="hover:bg-white/20 text-white rounded-full" onClick={toggleMute}>
                                {isMuted ? <VolumeX className="w-5 h-5 text-red-500" /> : <Volume2 className="w-5 h-5" />}
                            </Button>
                            <select
                                value={viewerResolution}
                                onChange={handleResolutionChange}
                                className="bg-transparent text-white border border-white/20 hover:border-white/50 rounded-full px-3 py-1.5 focus:outline-none appearance-none cursor-pointer text-sm font-semibold transition-colors mr-2"
                                style={{
                                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                                    backgroundRepeat: "no-repeat",
                                    backgroundPosition: "right 8px center",
                                    backgroundSize: "16px",
                                    paddingRight: "32px"
                                }}
                            >
                                <option value="1080p" className="text-black">1080p (Source)</option>
                                <option value="720p" className="text-black">720p (Data Saver)</option>
                                <option value="480p" className="text-black">480p</option>
                                <option value="360p" className="text-black">360p (Mobile)</option>
                            </select>

                            <Button size="icon" variant="ghost" className="hover:bg-white/20 text-white rounded-full">
                                <Settings className="w-5 h-5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="hover:bg-white/20 text-white rounded-full" onClick={toggleFullscreen}>
                                <Maximize className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Live Chat Sidebar */}
            <div className="w-full lg:w-96 h-[40vh] lg:h-full bg-[#0a0a0a] border-t lg:border-t-0 lg:border-l border-[#1f1f1f] flex flex-col shrink-0">
                <div className="p-4 border-b border-[#1f1f1f] flex justify-between items-center bg-[#0a0a0a]">
                    <h3 className="font-semibold text-white uppercase tracking-wider text-sm flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" /> Live Chat
                    </h3>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-gray-400 hover:text-white rounded-full">
                            <Heart className="w-3.5 h-3.5 mr-1.5" /> 12.4k
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-gray-400 hover:text-white rounded-full">
                            <Share2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>

                <div className="flex-1 p-4 overflow-y-auto space-y-4 text-sm bg-gradient-to-b from-[#0a0a0a] to-[#0f0f0f]">
                    {/* Simulated Chat Messages */}
                    {[
                        { user: "AlexD23", text: "What an incredible start!", color: "text-[#34d399]" },
                        { user: "ProGamer99", text: "Is the stream buttery smooth for anyone else?", color: "text-[#60a5fa]" },
                        { user: "SportsFan", text: "Yes! WebRTC is insane latency is 0 🚀", color: "text-[#c084fc]" },
                        { user: "SarahJ", text: "LETS GOOOOOOO", color: "text-[#fb923c]" },
                        { user: "TechEnthusiast", text: "This UI is looking so crisp ⚡", color: "text-[#f472b6]" },
                        { user: "MaxPower", text: "That play was unbelievable!", color: "text-yellow-400" },
                        { user: "JohnDoe", text: "I can't believe it...", color: "text-blue-400" },
                    ].map((msg, i) => (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} key={i} className="leading-tight flex flex-col gap-0.5">
                            <span className={`font-semibold text-xs ${msg.color}`}>{msg.user}</span>
                            <span className="text-gray-200">{msg.text}</span>
                        </motion.div>
                    ))}
                    <p className="text-gray-500 italic text-center text-xs mt-6 mb-2">Welcome to the Live Match chat!</p>
                </div>

                <div className="p-4 border-t border-[#1f1f1f] bg-[#0a0a0a]">
                    <input type="text" placeholder="Send a message..." className="w-full bg-[#1a1a1a] border border-[#333] rounded-full px-5 py-3 text-sm text-white focus:outline-none focus:border-primary placeholder-gray-500 transition-colors shadow-inner" />
                </div>
            </div>
        </motion.div>
    );
}

export default Watch;
