const http = require('http');
const Gun = require('gun');

const port = process.env.PORT || 8765;

const server = http.createServer();

Gun({
  web: server,
  file: false
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Gun relay server running on port ${port}`);
});
