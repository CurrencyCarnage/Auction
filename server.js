import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createConfig } from './src/server/config.js';
import { createStore } from './src/server/storage/index.js';
import { AuctionService } from './src/server/services/auctionService.js';
import { AdminService } from './src/server/services/adminService.js';
import { publicRoutes } from './src/server/routes/publicRoutes.js';
import { adminRoutes } from './src/server/routes/adminRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const config = createConfig(__dirname);
const app = express();
const store = createStore(config);
const auctionService = new AuctionService(store);
const adminService = new AdminService(store);

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: config.demoMode ? 240 : 90, standardHeaders: true, legacyHeaders: false }));

app.get('/healthz', (_, res) => res.json({ ok: true, mode: config.demoMode ? 'demo' : 'production', time: new Date().toISOString() }));
app.use('/api/admin', adminRoutes({ adminService, config }));
app.use('/api', publicRoutes({ auctionService }));

app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (_, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(config.port, '0.0.0.0', () => console.log(`GT Auction demo running on http://0.0.0.0:${config.port}`));
