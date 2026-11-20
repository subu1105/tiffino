import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../src/models/AuditLog';
import { auth, createOwner, loginAs, setupTestDb, teardownTestDb, type TestActor } from './helpers';

let app: Express;
let owner: TestActor;

beforeAll(async () => {
  app = await setupTestDb();
  owner = await createOwner(app);
});
afterAll(teardownTestDb);

describe('authentication', () => {
  it('logs in with valid credentials and returns user + both tokens', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: owner.email, password: owner.password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('owner');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    const setCookie = res.headers['set-cookie'];
    expect(String(setCookie)).toContain('tiffino_refresh=');
    expect(String(setCookie)).toContain('HttpOnly');
  });

  it('rejects a wrong password with the same message as a wrong email', async () => {
    const wrongPass = await request(app)
      .post('/api/auth/login')
      .send({ email: owner.email, password: 'nope-nope' });
    const wrongEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'nope-nope' });
    expect(wrongPass.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    expect(wrongPass.body.error.message).toBe(wrongEmail.body.error.message);
  });

  it('writes audit entries for login success and failure', async () => {
    const entries = await AuditLog.find({ entity: 'auth' });
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('auth.login_success');
    expect(actions).toContain('auth.login_failed');
  });

  it('protects routes: no token → 401, garbage token → 401', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set({ Authorization: 'Bearer garbage' })).status,
    ).toBe(401);
  });

  it('GET /me returns the authenticated user', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('owner');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: owner.email, password: owner.password });
    const original = login.body.data.refreshToken as string;

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: original });
    expect(first.status).toBe(200);
    const rotated = first.body.data.refreshToken as string;
    expect(rotated).not.toBe(original);

    // Reusing the consumed token is treated as theft → whole family dies.
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: original });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('AUTH_REFRESH_INVALID');

    const afterReuse = await request(app).post('/api/auth/refresh').send({ refreshToken: rotated });
    expect(afterReuse.status).toBe(401);
  });

  it('refresh without any token → 401', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REFRESH_INVALID');
  });

  it('change-password rejects a wrong current password and a weak new password', async () => {
    const wrong = await request(app)
      .post('/api/auth/change-password')
      .set(auth(owner))
      .send({ currentPassword: 'wrong-current', newPassword: 'NewPass123' });
    expect(wrong.status).toBe(400);

    const weak = await request(app)
      .post('/api/auth/change-password')
      .set(auth(owner))
      .send({ currentPassword: owner.password, newPassword: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('change-password invalidates old access tokens via tokenVersion', async () => {
    const session = await loginAs(app, owner.email, owner.password);
    const res = await request(app)
      .post('/api/auth/change-password')
      .set(auth(session))
      .send({ currentPassword: owner.password, newPassword: 'NewOwner123' });
    expect(res.status).toBe(200);

    // The old access token is stale now.
    const stale = await request(app).get('/api/auth/me').set(auth(session));
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('AUTH_TOKEN_STALE');

    // Old password no longer works; new one does.
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: owner.email, password: owner.password });
    expect(oldLogin.status).toBe(401);
    owner = await loginAs(app, owner.email, 'NewOwner123');
    owner.password = 'NewOwner123';
  });

  it('logout revokes the refresh token', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: owner.email, password: owner.password });
    const refreshToken = login.body.data.refreshToken as string;

    await request(app).post('/api/auth/logout').send({ refreshToken });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it('forgot-password answers with owner-reset guidance (no email infra in Phase 1)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: owner.email });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('owner');
  });
});
