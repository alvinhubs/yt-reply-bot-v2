const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const apiRoutes = require('./routes/api');
const { initScheduler } = require('./scheduler');

// Starting the worker module registers its listeners (side-effect import).
require('./jobs/replyWorker');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

// Serve the built dashboard (frontend/dist) from this same service, so
// there's one Railway service and one URL for both the API and the UI —
// no separate Netlify deploy, no CORS config to keep in sync.
const distPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: any non-API GET request that isn't a real static file
  // gets index.html, so client-side routing (if ever added) still works.
  app.get(/^(?!\/api|\/health).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn(
    `[server] No built frontend found at ${distPath} — did the build command run "npm run build" in frontend/ first?`
  );
}

async function start() {
  await initScheduler();
  app.listen(config.port, () => {
    console.log(`[server] yt-reply-bot-v2 listening on :${config.port}`);
  });
}

start().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
