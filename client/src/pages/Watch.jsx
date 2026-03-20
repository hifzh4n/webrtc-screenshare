import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, Maximize, MessageSquare, Share2, AlertCircle, Settings, Send } from 'lucide-react';
import { socket } from '../services/socket';
import { createPeerConnection, createAnswer } from '../services/webrtc';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { incrementMetric, logTelemetry } from '../lib/telemetry';

function Watch() {
    const MotionDiv = motion.div;
    const videoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const broadcasterSocketIdRef = useRef(null);
    const containerRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState(false);
    const [isMuted, setIsMuted] = useState(true); // Must start True for mobile Autoplay to work organically!
    const [volume, setVolume] = useState(1);
    const [showSettings, setShowSettings] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [streamTitle, setStreamTitle] = useState('Waiting for Broadcast...');
    const [viewerResolution, setViewerResolution] = useState('1080p');
    const roomIdRef = useRef(new URLSearchParams(window.location.search).get('room') || 'main');

    const copyShareLink = () => {
        const url = window.location.origin; 
        navigator.clipboard.writeText(url).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 3000);
        }).catch(err => {
            console.error("Failed to copy link", err);
        });
    };

    useEffect(() => {
        // Actively let the system know this socket wants to watch a stream
        socket.emit('join_watch', { roomId: roomIdRef.current });
        incrementMetric('watch_join_total');

        socket.on('offer', async ({ sender, offer, title }) => {
            if (title) setStreamTitle(title);
            broadcasterSocketIdRef.current = sender;
            try {
                if (peerConnectionRef.current) {
                    peerConnectionRef.current.close();
                }

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
                    const state = peerConnection.iceConnectionState;
                    incrementMetric(`watch_ice_state_${state}_total`);
                    logTelemetry('watch.ice_state_change', { state, sender });
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
                incrementMetric('watch_answer_sent_total');
            } catch (err) {
                console.error("Watch error:", err);
                setError(true);
                incrementMetric('watch_offer_failed_total');
                logTelemetry('watch.offer_failed', { message: err?.message || 'unknown', sender }, 'error');
            }
        });

        socket.on('candidate', async ({ candidate }) => {
            if (peerConnectionRef.current && candidate) {
                try {
                    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                    incrementMetric('watch_candidate_received_total');
                } catch (err) {
                    incrementMetric('watch_candidate_failed_total');
                    logTelemetry('watch.candidate_failed', { message: err?.message || 'unknown' }, 'error');
                }
            }
        });

        socket.on('stream_title', (title) => {
            setStreamTitle(title);
        });

        socket.on('stream_ended', () => {
            setIsPlaying(false);
            if (videoRef.current) videoRef.current.srcObject = null;
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
            setStreamTitle('Broadcast Ended');
        });

        return () => {
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
            socket.off('offer');
            socket.off('candidate');
            socket.off('stream_title');
            socket.off('stream_ended');
        };
    }, []);

    const toggleFullscreen = () => {
        const elem = containerRef.current || videoRef.current;
        if (!elem) return;

        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(err => console.error(err));
            } else if (elem.webkitRequestFullscreen) { /* Safari */
                elem.webkitRequestFullscreen();
            } else if (videoRef.current.webkitEnterFullscreen) { /* iOS Safari video specifically */
                videoRef.current.webkitEnterFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            }
        }
    };

    const handleResolutionChange = (resolution) => {
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
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            if (isMuted && volume === 0) {
                setVolume(1);
                videoRef.current.volume = 1;
            }
        }
    };

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
            if (newVolume === 0) {
                setIsMuted(true);
                videoRef.current.muted = true;
            } else {
                setIsMuted(false);
                videoRef.current.muted = false;
            }
        }
    };

    return (
        <MotionDiv
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="w-full h-screen flex flex-col lg:flex-row bg-black overflow-hidden font-sans"
        >
            {/* Main Streaming Area */}
            <div ref={containerRef} className="flex-1 relative flex items-center justify-center bg-black h-[60vh] lg:h-full group">
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
                <div className="absolute inset-x-0 bottom-0 pointer-events-none flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
                    <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent p-6 pt-24 pointer-events-auto flex items-end justify-between">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">{streamTitle}</h1>
                            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-gray-300">
                                <span className="hidden sm:inline">SportsCast Premium</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-4 relative h-10">
                            <div className="group/volume flex items-center h-10 bg-black/40 rounded-full pr-2 hover:bg-black/60 transition-colors hidden sm:flex shrink-0">
                                <Button size="icon" variant="ghost" className="hover:bg-white/20 text-white rounded-full shrink-0" onClick={toggleMute}>
                                    {isMuted ? <VolumeX className="w-5 h-5 text-red-500" /> : <Volume2 className="w-5 h-5" />}
                                </Button>
                                <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-300 flex items-center h-full ml-1">
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="1" 
                                        step="0.05" 
                                        value={isMuted ? 0 : volume} 
                                        onChange={handleVolumeChange} 
                                        className="w-full accent-primary h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>

                            {/* Mobile mute fallback (no slider) */}
                            <div className="sm:hidden flex items-center h-10 shrink-0">
                                <Button size="icon" variant="ghost" className="hover:bg-white/20 text-white rounded-full shrink-0" onClick={toggleMute}>
                                    {isMuted ? <VolumeX className="w-5 h-5 text-red-500" /> : <Volume2 className="w-5 h-5" />}
                                </Button>
                            </div>

                            <div className="relative flex items-center h-10 shrink-0">
                                <Button size="icon" variant="ghost" className="hover:bg-white/20 text-white rounded-full shrink-0" onClick={() => setShowSettings(!showSettings)}>
                                    <Settings className="w-5 h-5" />
                                </Button>
                                {showSettings && (
                                    <div className="absolute bottom-full right-0 mb-4 w-48 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl overflow-hidden z-50 py-1">
                                        <div className="px-4 py-3 text-xs font-bold text-gray-400 border-b border-[#333] uppercase tracking-wider bg-[#111]">Resolution</div>
                                        {['1080p', '720p', '480p', '360p'].map(res => (
                                            <button 
                                                key={res}
                                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#2a2a2a] transition-all flex items-center justify-between ${viewerResolution === res ? 'text-primary font-bold bg-primary/10' : 'text-gray-200'}`}
                                                onClick={() => { handleResolutionChange(res); setShowSettings(false); }}
                                            >
                                                <span>{res === '1080p' ? '1080p (Source)' : res === '720p' ? '720p (Data Saver)' : res === '360p' ? '360p (Mobile)' : '480p'}</span>
                                                {viewerResolution === res && <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(225,29,72,0.8)]"></div>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Button size="icon" variant="ghost" className="hover:bg-white/20 text-white rounded-full shrink-0 h-10 w-10 flex items-center justify-center" onClick={toggleFullscreen}>
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
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={copyShareLink}
                            className={`h-8 px-3 tracking-wide text-xs rounded-full transition-all duration-300 ${copySuccess ? 'bg-emerald-500/20 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/30 font-bold' : 'text-gray-400 hover:text-white bg-white/5'}`}
                        >
                            {copySuccess ? 'Link Copied ✓' : <><Share2 className="w-3.5 h-3.5 mr-1.5" /> Share</>}
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

                <div className="p-4 border-t border-[#1f1f1f] bg-[#0a0a0a] flex gap-2">
                    <input type="text" placeholder="Send a message..." className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-full px-5 py-3 text-sm text-white focus:outline-none focus:border-primary placeholder-gray-500 transition-colors shadow-inner" />
                    <Button size="icon" className="rounded-full w-[46px] h-[46px] shrink-0 bg-primary hover:bg-primary/90 text-white shadow-[0_0_15px_rgba(225,29,72,0.3)] transition-all flex items-center justify-center">
                        <Send className="w-4 h-4 ml-0.5" />
                    </Button>
                </div>
            </div>
        </MotionDiv>
    );
}

export default Watch;
