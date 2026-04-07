// Test über Vite-Proxy (Port 5174)
const io = require('socket.io-client');

const socket = io('http://localhost:5174', { path: '/socket.io', transports: ['polling', 'websocket'] });

socket.on('connect', () => {
  console.log('CONNECTED via Vite proxy:', socket.id);
  socket.emit('getState', 'system.adapter.admin.0.alive', (err, state) => {
    console.log('getState via proxy:', err, JSON.stringify(state));
    socket.disconnect();
    process.exit(0);
  });
});
socket.on('connect_error', (e) => { console.log('ERROR:', e.message || e); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 6000);
