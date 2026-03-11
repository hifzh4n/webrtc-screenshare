import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MonitorPlay, Radio, Home, Play, PlayCircle, Menu, LogOut } from 'lucide-react';
import Broadcast from './pages/Broadcast';
import Watch from './pages/Watch';
import { Badge } from './components/ui/Badge';
import { Button } from './components/ui/Button';

function AppContent() {
  const location = useLocation();
  const isFullScreen = location.pathname === '/watch' || location.pathname === '/broadcast';

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white selection:bg-primary/30">
      {/* Sidebar Navigation */}
      {!isFullScreen && (
        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-[#1f1f1f] bg-[#0f0f0f] md:block">
          <div className="flex h-full flex-col px-4 py-8">
            <div className="flex items-center gap-3 px-2 mb-12">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white shadow-[0_0_15px_rgba(225,29,72,0.5)]">
                <PlayCircle className="h-6 w-6" />
              </div>
              <span className="text-xl font-bold tracking-tighter">SPORTS<span className="text-primary">CAST</span></span>
            </div>

            <nav className="flex-1 space-y-2">
              <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-gray-400 transition-all hover:bg-[#1a1a1a] hover:text-white">
                <Home className="h-5 w-5" /> Home
              </Link>
              <Link to="/broadcast" className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-gray-400 transition-all hover:bg-[#1a1a1a] hover:text-white">
                <Radio className="h-5 w-5" /> Broadcast Center
              </Link>
              <Link to="/watch" className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-gray-400 transition-all hover:bg-[#1a1a1a] hover:text-white">
                <MonitorPlay className="h-5 w-5" /> Live Matches
              </Link>
            </nav>

            <div className="mt-auto px-2">
              <div className="rounded-xl bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] p-4 border border-[#1f1f1f]">
                <p className="mb-2 text-xs font-semibold text-gray-400">PRO PLAN</p>
                <p className="text-sm font-medium text-white mb-4">You're on the ultra low-latency plan.</p>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1a1a1a] px-3 py-2 text-xs font-semibold hover:bg-white hover:text-black transition-colors">
                  Upgrade
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className={`flex-1 relative min-h-screen ${!isFullScreen ? 'md:ml-64 pt-4 md:pt-0' : 'p-0'}`}>
        {!isFullScreen && (
          <header className="flex md:hidden items-center justify-between px-6 pb-4 border-b border-[#1f1f1f] bg-[#0a0a0a] sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold tracking-tighter">SPORTS<span className="text-primary">CAST</span></span>
            </div>
            <button><Menu className="w-6 h-6" /></button>
          </header>
        )}
        <div className={!isFullScreen ? "p-6 h-full max-w-[1600px] mx-auto" : "w-full h-full"}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col h-full items-center justify-center py-20"
                >
                  <div className="max-w-3xl text-center space-y-6">
                    <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10 px-4 py-1.5 uppercase tracking-widest text-xs">High Definition Streaming</Badge>
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter">SHARE THE <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-500">THRILL</span></h1>
                    <p className="text-lg text-gray-400 max-w-xl mx-auto">Experience ultra low-latency WebRTC streams. Broadcast games, events, and highlights directly from your desktop to fans worldwide.</p>
                    <div className="pt-8 flex flex-wrap gap-4 justify-center">
                      <Link to="/broadcast">
                        <Button size="lg" className="rounded-full px-8 font-bold flex gap-2 h-14 bg-white text-black hover:bg-gray-200">
                          <Radio className="w-5 h-5" /> Start Broadcasting
                        </Button>
                      </Link>
                      <Link to="/watch">
                        <Button size="lg" variant="outline" className="rounded-full px-8 font-bold flex gap-2 h-14 border-[#333] hover:bg-[#1a1a1a]">
                          <Play className="w-5 h-5" /> Watch Streams
                        </Button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              } />
              <Route path="/broadcast" element={<Broadcast />} />
              <Route path="/watch" element={<Watch />} />
            </Routes>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}


function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
