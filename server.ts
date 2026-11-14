import { createServer } from 'node:http';
import next from 'next';
import { attachGameServer } from './src/server/gameServer';

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOST || '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    handle(req, res);
  });
  const game = attachGameServer(httpServer);

  httpServer.listen(port, hostname, () => {
    console.log(`> Kingdom Chaos ready on http://localhost:${port} (${dev ? 'development' : 'production'})`);
  });

  const shutdown = () => {
    game.close();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});
