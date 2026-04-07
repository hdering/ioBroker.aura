import pkg from 'socket.io-client';
const { io } = pkg;

async function test(label, url, opts) {
  return new Promise((resolve) => {
    const socket = io(url, { ...opts, transports: ['polling', 'websocket'] });
    const timer = setTimeout(() => {
      socket.disconnect();
      console.log(label, '→ TIMEOUT');
      resolve();
    }, 3000);

    socket.on('connect', () => {
      clearTimeout(timer);
      console.log(label, '→ CONNECTED', socket.id);
      socket.onAny?.((ev, ...args) => {
        console.log(label, 'EVENT:', ev, JSON.stringify(args).slice(0, 200));
      });
      setTimeout(() => { socket.disconnect(); resolve(); }, 1500);
    });
    socket.on('connect_error', (e) => {
      console.log(label, '→ ERROR:', e.message);
    });
    socket.on('error', (e) => {
      console.log(label, '→ SOCKET ERROR:', e);
    });
  });
}

await test('8082 /socket.io', 'http://localhost:8082', { path: '/socket.io' });
await test('8082 default',    'http://localhost:8082', {});

process.exit(0);
