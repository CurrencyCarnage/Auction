import express from 'express';
import { authAdmin } from '../auth/demoAuth.js';
import { createToken } from '../auth/session.js';
import { hoursSchema, loginSchema, lotSchema, parseBody } from '../validation/schemas.js';

function requireAdmin(req, res, config) {
  if (!authAdmin(req, config)) { res.status(401).json({ error: 'Admin login required' }); return false; }
  return true;
}
async function handle(res, fn) {
  try { return await fn(); } catch (e) { return res.status(e.status || 500).json({ error: e.message || 'Request failed' }); }
}

export function adminRoutes({ adminService, config }) {
  const router = express.Router();
  router.get('/audit', async (req, res) => {
    if (!requireAdmin(req, res, config)) return;
    return handle(res, async () => res.json({ audit: await adminService.auditEvents() }));
  });
  router.post('/login', (req, res) => {
    const body = parseBody(loginSchema, req, res); if (!body) return;
    if (body.username !== config.adminUsername || body.password !== config.adminPassword) return res.status(401).json({ error: 'Wrong admin username or password' });
    res.json({ admin: { username: config.adminUsername, token: createToken({ type: 'admin', username: config.adminUsername }, config.sessionSecret) } });
  });
  router.post('/open-hours', async (req, res) => {
    if (!requireAdmin(req, res, config)) return;
    const body = parseBody(hoursSchema, req, res); if (!body) return;
    return handle(res, async () => res.json(await adminService.openHours(body.hours)));
  });
  router.post('/lot', async (req, res) => {
    if (!requireAdmin(req, res, config)) return;
    const body = parseBody(lotSchema, req, res); if (!body) return;
    return handle(res, async () => res.json(await adminService.saveLot(body)));
  });
  router.delete('/lot/:id', async (req, res) => {
    if (!requireAdmin(req, res, config)) return;
    return handle(res, async () => res.json(await adminService.removeLot(req.params.id)));
  });
  return router;
}
