import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  createCustomerVia,
  createOwner,
  createStaff,
  loginAs,
  setupTestDb,
  teardownTestDb,
  type TestActor,
} from './helpers';

let app: Express;
let owner: TestActor;

beforeAll(async () => {
  app = await setupTestDb();
  owner = await createOwner(app);
});
afterAll(teardownTestDb);

describe('role-based access control (enforced in the backend)', () => {
  it('staff without a permission is rejected with 403 and the missing permission named', async () => {
    const viewer = await createStaff(app, ['customers.view'], 'viewer@test.local');
    const res = await request(app).post('/api/customers').set(auth(viewer)).send({
      fullName: 'Blocked Customer',
      mobile: '9876500009',
      address: '',
      type: 'regular',
      lunchPrice: 70,
      dinnerPrice: 80,
      joiningDate: '2026-11-01',
      status: 'active',
      notes: '',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.details.required).toBe('customers.manage');
  });

  it('staff with the permission passes; owner always passes', async () => {
    const manager = await createStaff(app, ['customers.view', 'customers.manage'], 'manager@test.local');
    const byStaff = await createCustomerVia(app, manager, { mobile: '9876500010', fullName: 'By Staff' });
    expect(byStaff.id).toBeTruthy();
    const byOwner = await createCustomerVia(app, owner, { mobile: '9876500011', fullName: 'By Owner' });
    expect(byOwner.id).toBeTruthy();
  });

  it('staff cannot reach owner-only user management', async () => {
    const manager = await loginAs(app, 'manager@test.local', 'Staff1234');
    const res = await request(app).get('/api/users').set(auth(manager));
    expect(res.status).toBe(403);
  });

  it('owner creates staff; permission changes invalidate outstanding staff tokens', async () => {
    const createRes = await request(app).post('/api/users/staff').set(auth(owner)).send({
      fullName: 'New Staff',
      email: 'newstaff@test.local',
      password: 'Staff5678',
      permissions: ['orders.view'],
    });
    expect(createRes.status).toBe(201);
    const staffId = createRes.body.data.id as string;
    const staff = await loginAs(app, 'newstaff@test.local', 'Staff5678');

    // Granted only orders.view → booking is forbidden.
    const customer = await createCustomerVia(app, owner, { mobile: '9876500012', fullName: 'T Customer' });
    const bookBlocked = await request(app).post('/api/orders').set(auth(staff)).send({
      customerId: customer.id,
      orderDate: '2026-11-20',
      mealType: 'lunch',
    });
    expect(bookBlocked.status).toBe(403);

    // Owner grants orders.book → old token goes stale (tokenVersion bumped).
    const update = await request(app)
      .put(`/api/users/${staffId}`)
      .set(auth(owner))
      .send({ permissions: ['orders.view', 'orders.book'] });
    expect(update.status).toBe(200);
    const staleRes = await request(app).get('/api/auth/me').set(auth(staff));
    expect(staleRes.status).toBe(401);

    // Re-login picks up the new permission.
    const fresh = await loginAs(app, 'newstaff@test.local', 'Staff5678');
    const bookOk = await request(app).post('/api/orders').set(auth(fresh)).send({
      customerId: customer.id,
      orderDate: '2026-11-20',
      mealType: 'lunch',
    });
    expect(bookOk.status).toBe(201);
  });

  it('deactivating a staff account kills access; owner cannot deactivate self', async () => {
    const staff = await createStaff(app, ['customers.view'], 'leaver@test.local');
    const list = await request(app).get('/api/users').set(auth(owner));
    const leaver = (list.body.data as { id: string; email: string }[]).find(
      (u) => u.email === 'leaver@test.local',
    )!;

    const res = await request(app)
      .patch(`/api/users/${leaver.id}/status`)
      .set(auth(owner))
      .send({ status: 'inactive' });
    expect(res.status).toBe(200);

    const blocked = await request(app).get('/api/customers').set(auth(staff));
    expect(blocked.status).toBe(401);

    const self = await request(app)
      .patch(`/api/users/${owner.id}/status`)
      .set(auth(owner))
      .send({ status: 'inactive' });
    expect(self.status).toBe(400);
  });

  it('owner resets a staff password (Phase 1 forgot-password path)', async () => {
    await createStaff(app, ['customers.view'], 'forgetful@test.local');
    const list = await request(app).get('/api/users').set(auth(owner));
    const target = (list.body.data as { id: string; email: string }[]).find(
      (u) => u.email === 'forgetful@test.local',
    )!;

    const res = await request(app)
      .patch(`/api/users/${target.id}/password`)
      .set(auth(owner))
      .send({ newPassword: 'Fresh1234' });
    expect(res.status).toBe(200);

    const relogin = await loginAs(app, 'forgetful@test.local', 'Fresh1234');
    expect(relogin.token).toBeTruthy();
  });
});
