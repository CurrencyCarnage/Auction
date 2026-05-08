import express from 'express';
import { authAdmin } from '../auth/demoAuth.js';
import { createToken } from '../auth/session.js';
import { hoursSchema, loginSchema, lotSchema, lotStatusSchema, parseBody } from '../validation/schemas.js';

function requireAdmin(req, res, config, roles = []) {
  const admin = authAdmin(req, config);
  if (!admin) { res.status(401).json({ error: 'Admin login required' }); return false; }
  if (roles.length && admin !== true && !roles.includes(admin.role)) {
    res.status(403).json({ error: 'Admin role is not allowed for this action' });
    return false;
  }
  return true;
}
async function handle(res, fn) {
  try { return await fn(); } catch (e) { return res.status(e.status || 500).json({ error: e.message || 'Request failed' }); }
}

export function adminRoutes({ adminService, config }) {
  const router = express.Router();
  router.get('/audit', async (req, res) => {
    if (!requireAdmin(req, res, config, ['representative', 'manager', 'super_admin'])) return;
    return handle(res, async () => res.json({ audit: await adminService.auditEvents() }));
  });
  router.post('/login', async (req, res) => {
    const body = parseBody(loginSchema, req, res); if (!body) return;
    return handle(res, async () => {
      const admin = await adminService.login(body.username, body.password, config);
      if (!admin) return res.status(401).json({ error: 'Wrong admin username or password' });
      if (admin.status && admin.status !== 'active') return res.status(403).json({ error: 'Admin account is disabled' });
      res.json({ admin: { username: admin.username, name: admin.name, role: admin.role, token: createToken({ type: 'admin', username: admin.username, role: admin.role }, config.sessionSecret) } });
    });
  });
  router.post('/open-hours', async (req, res) => {
    if (!requireAdmin(req, res, config, ['manager', 'super_admin'])) return;
    const body = parseBody(hoursSchema, req, res); if (!body) return;
    return handle(res, async () => res.json(await adminService.openHours(body.hours)));
  });
  router.post('/lot', async (req, res) => {
    if (!requireAdmin(req, res, config, ['representative', 'manager', 'super_admin'])) return;
    const body = parseBody(lotSchema, req, res); if (!body) return;
    return handle(res, async () => res.json(await adminService.saveLot(body)));
  });
  router.patch('/lot/:id/status', async (req, res) => {
    if (!requireAdmin(req, res, config, ['manager', 'super_admin'])) return;
    const body = parseBody(lotStatusSchema, req, res); if (!body) return;
    return handle(res, async () => res.json(await adminService.setLotStatus(req.params.id, body.status)));
  });
  router.delete('/lot/:id', async (req, res) => {
    if (!requireAdmin(req, res, config, ['manager', 'super_admin'])) return;
    return handle(res, async () => res.json(await adminService.removeLot(req.params.id)));
  });
  return router;
}
