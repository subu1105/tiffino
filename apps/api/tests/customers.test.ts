import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auth,
  createCustomerVia,
  createOwner,
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

describe('customer management', () => {
  it('rejects an invalid Indian mobile and unknown fields', async () => {
    const bad = await request(app).post('/api/customers').set(auth(owner)).send({
      fullName: 'Bad Mobile',
      mobile: '12345',
      address: '',
      type: 'regular',
      lunchPrice: 70,
      dinnerPrice: 80,
      joiningDate: '2026-11-01',
      status: 'active',
      notes: '',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const unknown = await request(app).post('/api/customers').set(auth(owner)).send({
      fullName: 'Sneaky',
      mobile: '9876500020',
      address: '',
      type: 'regular',
      lunchPrice: 70,
      dinnerPrice: 80,
      joiningDate: '2026-11-01',
      status: 'active',
      notes: '',
      isAdmin: true,
    });
    expect(unknown.status).toBe(400);
  });

  it('normalises +91 prefixes and rejects duplicate mobiles', async () => {
    const created = await createCustomerVia(app, owner, {
      fullName: 'Rahul Sharma',
      mobile: '+91 98765 00021',
    });
    expect(created.mobile).toBe('9876500021');

    const dupRes = await request(app).post('/api/customers').set(auth(owner)).send({
      fullName: 'Duplicate Rahul',
      mobile: '9876500021',
      address: '',
      type: 'regular',
      lunchPrice: 70,
      dinnerPrice: 80,
      joiningDate: '2026-11-01',
      status: 'active',
      notes: '',
    });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('DUPLICATE_RESOURCE');
  });

  it('every customer carries their own lunch/dinner prices', async () => {
    const amit = await createCustomerVia(app, owner, {
      fullName: 'Amit Verma',
      mobile: '9876500022',
      lunchPrice: 65,
      dinnerPrice: 75,
    });
    const priya = await createCustomerVia(app, owner, {
      fullName: 'Priya Singh',
      mobile: '9876500023',
      type: 'occasional',
      lunchPrice: 90,
      dinnerPrice: 100,
    });
    expect(amit.lunchPrice).toBe(65);
    expect(amit.dinnerPrice).toBe(75);
    expect(priya.lunchPrice).toBe(90);
    expect(priya.dinnerPrice).toBe(100);
  });

  it('searches by name and mobile, filters by type, paginates with meta', async () => {
    const byName = await request(app).get('/api/customers?q=amit').set(auth(owner));
    expect(byName.status).toBe(200);
    expect(byName.body.data.some((c: { fullName: string }) => c.fullName === 'Amit Verma')).toBe(true);

    const byMobile = await request(app).get('/api/customers?q=9876500023').set(auth(owner));
    expect(byMobile.body.data).toHaveLength(1);
    expect(byMobile.body.data[0].fullName).toBe('Priya Singh');

    const occasional = await request(app).get('/api/customers?type=occasional').set(auth(owner));
    expect(occasional.body.data.every((c: { type: string }) => c.type === 'occasional')).toBe(true);

    const page = await request(app).get('/api/customers?page=1&limit=2').set(auth(owner));
    expect(page.body.data.length).toBeLessThanOrEqual(2);
    expect(page.body.meta.page).toBe(1);
    expect(page.body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it('GET /customers/:id returns the profile with stats block', async () => {
    const c = await createCustomerVia(app, owner, { fullName: 'Stats Person', mobile: '9876500024' });
    const res = await request(app).get(`/api/customers/${c.id}`).set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body.data.customer.fullName).toBe('Stats Person');
    expect(res.body.data.stats).toMatchObject({
      totalLunchOrders: 0,
      totalDinnerOrders: 0,
      totalBilled: 0,
      totalPaid: 0,
      pending: 0,
    });
  });

  it('price changes go through /prices, land in history, and never touch past orders', async () => {
    const c = await createCustomerVia(app, owner, {
      fullName: 'Price Change',
      mobile: '9876500025',
      lunchPrice: 70,
      dinnerPrice: 80,
    });

    // Book at the old price first.
    const booking = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: c.id,
      orderDate: '2026-11-18',
      mealType: 'lunch',
    });
    expect(booking.status).toBe(201);
    expect(booking.body.data.price).toBe(70);

    // Raise prices.
    const update = await request(app)
      .put(`/api/customers/${c.id}/prices`)
      .set(auth(owner))
      .send({ lunchPrice: 85, dinnerPrice: 95, effectiveDate: '2026-11-19' });
    expect(update.status).toBe(200);
    expect(update.body.data.lunchPrice).toBe(85);

    // History has both the creation row and the change row.
    const prices = await request(app).get(`/api/customers/${c.id}/prices`).set(auth(owner));
    expect(prices.body.data.lunchPrice).toBe(85);
    expect(prices.body.data.history).toHaveLength(2);
    expect(prices.body.data.history[0]).toMatchObject({
      lunchPrice: 85,
      prevLunchPrice: 70,
      effectiveDate: '2026-11-19',
    });

    // The historical order is untouched.
    const order = await request(app).get(`/api/orders/${booking.body.data.id}`).set(auth(owner));
    expect(order.body.data.price).toBe(70);

    // New bookings use the new price.
    const newBooking = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: c.id,
      orderDate: '2026-11-19',
      mealType: 'lunch',
    });
    expect(newBooking.body.data.price).toBe(85);
  });

  it('deactivation blocks new bookings and is reversible; no hard delete exists', async () => {
    const c = await createCustomerVia(app, owner, { fullName: 'Leaving Soon', mobile: '9876500026' });
    const deactivate = await request(app)
      .patch(`/api/customers/${c.id}/status`)
      .set(auth(owner))
      .send({ status: 'inactive' });
    expect(deactivate.status).toBe(200);

    const blocked = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: c.id,
      orderDate: '2026-11-20',
      mealType: 'dinner',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CUSTOMER_INACTIVE');

    const del = await request(app).delete(`/api/customers/${c.id}`).set(auth(owner));
    expect(del.status).toBe(404); // no DELETE route — customers are never hard-deleted

    await request(app)
      .patch(`/api/customers/${c.id}/status`)
      .set(auth(owner))
      .send({ status: 'active' });
    const rebook = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: c.id,
      orderDate: '2026-11-20',
      mealType: 'dinner',
    });
    expect(rebook.status).toBe(201);
  });
});
