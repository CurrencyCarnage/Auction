import express from 'express';
import { authBidder } from '../auth/demoAuth.js';
import { createToken } from '../auth/session.js';
import { bidSchema, loginSchema, lotIdSchema, parseBody, proxySchema } from '../validation/schemas.js';

async function handle(res, fn) {
  try { return await fn(); } catch (e) { return res.status(e.status || 500).json({ error: e.message || 'Request failed' }); }
}

export function publicRoutes({ auctionService, config }) {
  const router = express.Router();
  router.get('/users', (_, res) => res.json(auctionService.users()));
  router.get('/state', async (_, res) => handle(res, async () => res.json(await auctionService.publicState())));
  router.post('/login', (req, res) => {
    const body = parseBody(loginSchema, req, res); if (!body) return;
    const user = auctionService.login(body.username, body.password);
    if (!user) return res.status(401).json({ error: 'Wrong username or password' });
    res.json({ user: { ...user, token: createToken({ type: 'bidder', username: user.username }, config.sessionSecret) } });
  });
  router.post('/reset', async (_, res) => handle(res, async () => res.json(await auctionService.reset())));
  router.post('/bid', async (req, res) => {
    const user = authBidder(req, config); if (!user) return res.status(401).json({ error: 'Login required' });
    const body = parseBody(bidSchema, req, res); if (!body) return;
    return handle(res, async () => res.json(await auctionService.placeBid(user, body)));
  });
  router.post('/proxy', async (req, res) => {
    const user = authBidder(req, config); if (!user) return res.status(401).json({ error: 'Login required' });
    const body = parseBody(proxySchema, req, res); if (!body) return;
    return handle(res, async () => res.json(await auctionService.saveProxy(user, body)));
  });
  router.post('/buy-now', async (req, res) => {
    const user = authBidder(req, config); if (!user) return res.status(401).json({ error: 'Login required' });
    const body = parseBody(lotIdSchema, req, res); if (!body) return;
    return handle(res, async () => res.json(await auctionService.requestBuyNow(user, body)));
  });
  return router;
}
