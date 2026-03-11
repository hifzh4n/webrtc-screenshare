import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Video, MicOff, Settings, Users, RadioTower, Disc3, ShieldAlert } from 'lucide-react';
import { socket } from '../services/socket';
import { createPeerConnection, createOffer } from '../services/webrtc';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

function Broadcast() {
    const videoRef = useRef(null);
    const peerConnectionsRef = useRef({});
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [viewers, setViewers] = useState(0);
    const [streamTitle, setStreamTitle] = useState('Championship Finals HD');
    const [resolution, setResolution] = useState('1080p');
    const streamTitleRef = useRef(streamTitle);

    const activeStreamRef = useRef(null);

    useEffect(() => {
        streamTitleRef.current = streamTitle;
        if (isBroadcasting) {
            socket.emit('update_title', streamTitle);
        }
    }, [streamTitle, isBroadcasting]);

    useEffect(() => {
        socket.on('viewer_joined', async (viewerId) => {
            if (!isBroadcasting || !activeStreamRef.current) return;

            const peerConnection = createPeerConnection();
            peerConnectionsRef.current[viewerId] = peerConnection;

            activeStreamRef.current.getTracks().forEach((track) => {
                peerConnection.addTrack(track, activeStreamRef.current);
            });

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('candidate', { target: viewerId, candidate: event.candidate });
                }
            };

            const offer = await createOffer(peerConnection);
            socket.emit('offer', { target: viewerId, offer, title: streamTitleRef.current });
        });

        socket.on('answer', async ({ sender, answer }) => {
            const pc = peerConnectionsRef.current[sender];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
                setViewers((prev) => prev + 1);
            }
        });

        socket.on('candidate', async ({ sender, candidate }) => {
            const pc = peerConnectionsRef.current[sender];
            if (pc && candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        socket.on('viewer_left', (viewerId) => {
            if (peerConnectionsRef.current[viewerId]) {
                peerConnectionsRef.current[viewerId].close();
                delete peerConnectionsRef.current[viewerId];
                setViewers((prev) => Math.max(0, prev - 1));
            }
        });

        return () => {
            socket.off('viewer_joined');
            socket.off('answer');
            socket.off('candidate');
            socket.off('viewer_left');
        };
    }, [isBroadcasting]);

    const startScreenShare = async () => {
        try {
            const videoConstraints = {
                '1080p': { height: 1080 },
                '720p': { height: 720 },
                '480p': { height: 480 }
            };

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: videoConstraints[resolution] || true,
                audio: true
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            setIsBroadcasting(true);
            activeStreamRef.current = stream;

            stream.getTracks().forEach((track) => {
                track.onended = () => {
                    stopBroadcasting();
                };
            });

        } catch (err) {
            console.error("Error starting screen share:", err);
            setIsBroadcasting(false);
        }
    };

    const stopBroadcasting = () => {
        if (activeStreamRef.current) {
            activeStreamRef.current.getTracks().forEach(t => t.stop());
        }

        Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
        peerConnectionsRef.current = {};

        activeStreamRef.current = null;
        setIsBroadcasting(false);
        setViewers(0);
        socket.emit('broadcast_ended');
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="w-full h-screen flex flex-col lg:flex-row bg-black overflow-hidden font-sans"
        >
            {/* Main Streaming Output Area */}
            <div className="flex-1 relative flex items-center justify-center bg-black h-[60vh] lg:h-full">

                {/* Status Badges */}
                <div className="absolute top-6 left-6 z-20 flex gap-2">
                    {isBroadcasting ? (
                        <Badge className="bg-red-600 hover:bg-red-700 font-bold tracking-widest text-white shadow-xl px-4 py-1.5 uppercase drop-shadow-lg backdrop-blur-md gap-2 rounded-full border border-red-500/50">
                            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                            LIVE
                        </Badge>
                    ) : (
                        <Badge className="bg-white/10 hover:bg-white/20 font-bold tracking-widest text-white shadow-xl px-4 py-1.5 uppercase drop-shadow-lg backdrop-blur-md rounded-full border border-white/10">
                            OFF AIR
                        </Badge>
                    )}
                    <Badge variant="secondary" className="bg-black/60 text-white backdrop-blur-md border border-white/10 px-4 py-1.5 font-bold gap-2 rounded-full hidden sm:flex items-center">
                        <Users className="w-3.5 h-3.5 text-primary" /> {viewers}
                    </Badge>
                </div>

                {/* Idle Background */}
                {!isBroadcasting && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[url('https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=2667&auto=format&fit=crop')] bg-cover bg-center before:content-[''] before:absolute before:inset-0 before:bg-black/90 z-10">
                        <RadioTower className="w-20 h-20 text-[#333] mb-6 relative z-10" />
                        <h2 className="text-3xl font-bold text-white relative z-10 mb-2">Control Room</h2>
                        <p className="text-gray-500 font-medium relative z-10 uppercase tracking-widest text-sm mb-6">Ready to Transmit Feed</p>

                        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4 mb-8">
                            <input
                                type="text"
                                value={streamTitle}
                                onChange={(e) => setStreamTitle(e.target.value)}
                                className="bg-[#111]/80 text-white border border-[#333] rounded-lg px-4 py-3 w-64 focus:outline-none focus:border-primary placeholder-gray-500 shadow-xl backdrop-blur-md"
                                placeholder="Enter Stream Title"
                            />
                            <select
                                value={resolution}
                                onChange={(e) => setResolution(e.target.value)}
                                className="bg-[#111]/80 text-white border border-[#333] rounded-lg px-4 py-3 w-32 focus:outline-none focus:border-primary shadow-xl backdrop-blur-md"
                            >
                                <option value="1080p">1080p</option>
                                <option value="720p">720p</option>
                                <option value="480p">480p</option>
                            </select>
                        </div>

                        <Button onClick={startScreenShare}
                            size="lg"
                            className="gap-2 bg-primary text-white hover:bg-primary/90 font-bold px-8 py-6 rounded-full relative z-10 shadow-[0_0_30px_rgba(225,29,72,0.3)] transition-all hover:scale-105"
                        >
                            <RadioTower className="w-5 h-5" /> Start Broadcasting
                        </Button>

                        <div className="absolute bottom-6 left-6 flex items-center gap-2 z-10">
                            <ShieldAlert className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs text-emerald-500 font-bold uppercase tracking-wider">WebRTC Secured P2P</span>
                        </div>
                    </div>
                )}

                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-contain bg-black transition-opacity duration-1000 ${isBroadcasting ? 'opacity-100' : 'opacity-0'}`}
                />

                {/* Stream Controls Overlay (Only visible when broadcasting) */}
                {isBroadcasting && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col justify-end">
                        <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent p-6 pt-24 opacity-0 hover:opacity-100 transition-all duration-300 pointer-events-auto flex items-end justify-between z-20">
                            <div className="flex flex-col gap-2">
                                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white">{streamTitle}</h1>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-4">
                                <Button size="icon" variant="ghost" className="bg-white/10 hover:bg-white/20 text-white rounded-full">
                                    <Video className="w-5 h-5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="bg-white/10 hover:bg-red-500/20 text-red-500 rounded-full">
                                    <MicOff className="w-5 h-5" />
                                </Button>
                                <Button onClick={stopBroadcasting}
                                    size="sm"
                                    className="ml-4 gap-2 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold px-4"
                                >
                                    <Disc3 className="w-4 h-4 animate-spin" /> Stop
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Session Info Sidebar */}
            <div className="w-full lg:w-96 h-[40vh] lg:h-full bg-[#0a0a0a] border-t lg:border-t-0 lg:border-l border-[#1f1f1f] flex flex-col shrink-0">
                <div className="p-6 border-b border-[#1f1f1f] flex justify-between items-center bg-[#0a0a0a]">
                    <h3 className="font-semibold text-white uppercase tracking-wider text-sm flex items-center gap-2">
                        <Disc3 className="w-4 h-4 text-primary" /> Session Info
                    </h3>
                    <Settings className="w-4 h-4 text-gray-500 hover:text-white cursor-pointer transition-colors" />
                </div>

                <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-gradient-to-b from-[#0a0a0a] to-[#0f0f0f]">
                    <div className="space-y-4">
                        <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Network Status</p>
                            <p className="text-sm font-semibold text-white flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${isBroadcasting ? 'bg-primary shadow-[0_0_8px_rgba(225,29,72,0.8)]' : 'bg-gray-600'}`}></span>
                                {isBroadcasting ? 'Transmitting' : 'Awaiting Connection'}
                            </p>
                        </div>

                        <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Output Resolution</p>
                            <p className="text-sm font-medium text-gray-200">{resolution} (Display Source)</p>
                        </div>

                        <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Concurrent Viewers</p>
                            <div className="flex items-center gap-2 text-white">
                                <Users className="w-4 h-4 text-primary" />
                                <span className="text-lg font-bold">{viewers}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-[#1f1f1f] bg-[#0a0a0a]">
                    <Button className="w-full bg-white text-black hover:bg-gray-200 rounded-full font-bold py-6">Copy Share Link</Button>
                </div>
            </div>
        </motion.div>
    );
}

export default Broadcast;
