import express from 'express';
import { authAdmin } from '../auth/demoAuth.js';
import { hoursSchema, loginSchema, lotSchema, parseBody } from '../validation/schemas.js';

function requireAdmin(req, res, config) {
  if (!authAdmin(req, config)) { res.status(401).json({ error: 'Admin login required' }); return false; }
  return true;
}

export function adminRoutes({ adminService, config }) {
  const router = express.Router();
  router.get('/audit', (req, res) => {
    if (!requireAdmin(req, res, config)) return;
    res.json({ audit: adminService.auditEvents() });
  });
  router.post('/login', (req, res) => {
    const body = parseBody(loginSchema, req, res); if (!body) return;
    if (body.username !== config.adminUsername || body.password !== config.adminPassword) return res.status(401).json({ error: 'Wrong admin username or password' });
    res.json({ admin: { username: config.adminUsername, token: config.adminSessionToken } });
  });
  router.post('/open-hours', (req, res) => {
    if (!requireAdmin(req, res, config)) return;
    const body = parseBody(hoursSchema, req, res); if (!body) return;
    res.json(adminService.openHours(body.hours));
  });
  router.post('/lot', (req, res) => {
    if (!requireAdmin(req, res, config)) return;
    const body = parseBody(lotSchema, req, res); if (!body) return;
    res.json(adminService.saveLot(body));
  });
  router.delete('/lot/:id', (req, res) => {
    if (!requireAdmin(req, res, config)) return;
    res.json(adminService.removeLot(req.params.id));
  });
  return router;
}
