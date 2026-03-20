import React from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Broadcast from './pages/Broadcast';
import Watch from './pages/Watch';


function AppContent() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-[#0a0a0a] text-white selection:bg-primary/30">
      <main className="flex-1 relative min-h-screen p-0">
        <div className="w-full h-full">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<Navigate to="/watch" replace />} />
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
