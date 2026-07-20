import net from 'node:net';

if (process.env.RULELINK_EDITORIAL_PREVIEW_MODE === 'true' || process.env.RULELINK_PUBLIC_BUILD_CHECK === 'true') {
  process.exit(0);
}

const listening = await new Promise(resolve => {
  const socket = net.createConnection({host: '127.0.0.1', port: 8800});
  const finish = value => {
    socket.destroy();
    resolve(value);
  };
  socket.setTimeout(800);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false));
  socket.once('error', () => finish(false));
});

if (listening) {
  console.error('공개 서버가 실행 중이므로 .next를 직접 덮어쓰는 빌드를 거부합니다. npm run build:check 또는 restart_rulelink_public_server.ps1을 사용하세요.');
  process.exit(1);
}
