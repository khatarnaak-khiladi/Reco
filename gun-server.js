const http = require('http');
const Gun = require('gun');

const port = process.env.GUN_PORT || 8765;
const server = http.createServer();
const gun = Gun({ web: server, file: false });

server.on('request', (req, res) => {
  res.writeHead(200);
  res.end('Gun relay running');
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Gun relay server listening on http://localhost:${port}/gun`);
});

// Keep the process alive and allow Gun to handle WebSocket connections
module.exports = gun;
