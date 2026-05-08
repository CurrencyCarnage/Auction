import express from 'express';
import { authBidder } from '../auth/demoAuth.js';
import { bidSchema, loginSchema, lotIdSchema, parseBody, proxySchema } from '../validation/schemas.js';

function handle(res, fn) {
  try { return fn(); } catch (e) { return res.status(e.status || 500).json({ error: e.message || 'Request failed' }); }
}

export function publicRoutes({ auctionService }) {
  const router = express.Router();
  router.get('/users', (_, res) => res.json(auctionService.users()));
  router.get('/state', (_, res) => res.json(auctionService.publicState()));
  router.post('/login', (req, res) => {
    const body = parseBody(loginSchema, req, res); if (!body) return;
    const user = auctionService.login(body.username, body.password);
    if (!user) return res.status(401).json({ error: 'Wrong username or password' });
    res.json({ user });
  });
  router.post('/reset', (_, res) => res.json(auctionService.reset()));
  router.post('/bid', (req, res) => {
    const user = authBidder(req); if (!user) return res.status(401).json({ error: 'Login required' });
    const body = parseBody(bidSchema, req, res); if (!body) return;
    return handle(res, () => res.json(auctionService.placeBid(user, body)));
  });
  router.post('/proxy', (req, res) => {
    const user = authBidder(req); if (!user) return res.status(401).json({ error: 'Login required' });
    const body = parseBody(proxySchema, req, res); if (!body) return;
    return handle(res, () => res.json(auctionService.saveProxy(user, body)));
  });
  router.post('/buy-now', (req, res) => {
    const user = authBidder(req); if (!user) return res.status(401).json({ error: 'Login required' });
    const body = parseBody(lotIdSchema, req, res); if (!body) return;
    return handle(res, () => res.json(auctionService.requestBuyNow(user, body)));
  });
  return router;
}
