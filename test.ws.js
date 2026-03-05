import WebSocket from 'ws';

const token = '85162f2fe8790f177e782427bb5d445ea9eb60e514af59fe0b78be27b66a450416ee33eba10fe1a6e61fb2634143dd8';
const agentId = 'AGENT_426D7D5B';

const ws = new WebSocket('ws://localhost:15001/ws/agent', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Agent-ID': agentId
  }
});

ws.on('open', () => {
  console.log('✅ WEBSOCKET CONNECTED!');
  
  ws.send(JSON.stringify({
    type: 'device_register',
    data: {
      hostname: 'TEST-PC',
      platform: 'windows'
    }
  }));
});

ws.on('message', (data) => {
  console.log('📨 Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Disconnected: ${code} - ${reason}`);
});