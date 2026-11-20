import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayBusinessDate } from '@tiffino/shared';
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
let rahul: { id: string };
let amit: { id: string };

const TODAY = todayBusinessDate();

beforeAll(async () => {
  app = await setupTestDb();
  owner = await createOwner(app);
  rahul = await createCustomerVia(app, owner, {
    fullName: 'Rahul Sharma',
    mobile: '9876500040',
    type: 'regular',
    lunchPrice: 70,
    dinnerPrice: 80,
  });
  amit = await createCustomerVia(app, owner, {
    fullName: 'Amit Verma',
    mobile: '9876500041',
    type: 'occasional',
    lunchPrice: 65,
    dinnerPrice: 75,
  });

  // Today's scenario: Rahul lunch+dinner (150), Amit lunch 65 which gets cancelled.
  await request(app).post('/api/orders').set(auth(owner)).send({ customerId: rahul.id, orderDate: TODAY, mealType: 'lunch' });
  await request(app).post('/api/orders').set(auth(owner)).send({ customerId: rahul.id, orderDate: TODAY, mealType: 'dinner' });
  const amitLunch = await request(app).post('/api/orders').set(auth(owner)).send({ customerId: amit.id, orderDate: TODAY, mealType: 'lunch' });
  await request(app).patch(`/api/orders/${amitLunch.body.data.id}/cancel`).set(auth(owner)).send({ reason: 'Changed mind' });
});
afterAll(teardownTestDb);

describe('payments', () => {
  it('records a payment and keeps billed vs collected separate', async () => {
    const res = await request(app).post('/api/payments').set(auth(owner)).send({
      customerId: rahul.id,
      amount: 100,
      paymentDate: TODAY,
      method: 'upi',
      notes: 'Part payment',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.customerName).toBe('Rahul Sharma');

    const balance = await request(app)
      .get(`/api/payments/customer/${rahul.id}`)
      .set(auth(owner));
    // Billed 150 (active orders), paid 100 → pending 50.
    expect(balance.body.data.balance).toEqual({ totalBilled: 150, totalPaid: 100, pending: 50 });
    expect(balance.body.data.payments).toHaveLength(1);
  });

  it('cancelled orders never count towards a customer balance', async () => {
    const balance = await request(app)
      .get(`/api/payments/customer/${amit.id}`)
      .set(auth(owner));
    expect(balance.body.data.balance.totalBilled).toBe(0);
  });

  it('lists payments with a filtered grand total', async () => {
    const res = await request(app).get(`/api/payments?method=upi`).set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body.data.totalAmount).toBe(100);
    expect(res.body.meta.total).toBe(1);
  });

  it('rejects zero and negative amounts', async () => {
    const res = await request(app).post('/api/payments').set(auth(owner)).send({
      customerId: rahul.id,
      amount: 0,
      paymentDate: TODAY,
      method: 'cash',
      notes: '',
    });
    expect(res.status).toBe(400);
  });
});

describe('dashboard', () => {
  it('summary reflects real bookings and excludes cancelled orders from revenue', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      date: TODAY,
      activeCustomers: 2,
      regularCustomers: 1,
      occasionalCustomers: 1,
      lunchOrders: 1, // Amit's lunch is cancelled
      dinnerOrders: 1,
      totalOrders: 2,
      expectedRevenue: 150,
      pendingPayments: 50, // 150 billed − 100 collected
    });
    expect(res.body.data.recentBookings.length).toBeGreaterThan(0);
    expect(res.body.data.recentCustomers.length).toBe(2);
  });

  it('revenue endpoint accepts named filters', async () => {
    const res = await request(app).get('/api/dashboard/revenue?filter=today').set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      lunchRevenue: 70,
      dinnerRevenue: 80,
      totalRevenue: 150,
      collected: 100,
    });

    const missing = await request(app).get('/api/dashboard/revenue').set(auth(owner));
    expect(missing.status).toBe(400);
  });

  it('order-statistics returns zero-filled per-day points', async () => {
    const res = await request(app)
      .get(`/api/dashboard/order-statistics?from=${TODAY}&to=${TODAY}`)
      .set(auth(owner));
    expect(res.body.data.points).toHaveLength(1);
    expect(res.body.data.points[0]).toMatchObject({
      date: TODAY,
      lunch: 1,
      dinner: 1,
      lunchRevenue: 70,
      dinnerRevenue: 80,
    });
  });
});

describe('reports', () => {
  it('daily report: totals plus customer-wise rows, cancelled counted separately', async () => {
    const res = await request(app).get(`/api/reports/daily?date=${TODAY}`).set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      date: TODAY,
      lunchOrders: 1,
      dinnerOrders: 1,
      totalTiffins: 2,
      lunchRevenue: 70,
      dinnerRevenue: 80,
      totalRevenue: 150,
    });
    expect(res.body.data.rows).toHaveLength(2);

    const cancelledView = await request(app)
      .get(`/api/reports/daily?date=${TODAY}&status=cancelled`)
      .set(auth(owner));
    expect(cancelledView.body.data.rows).toHaveLength(1);
    expect(cancelledView.body.data.totalRevenue).toBe(0);
  });

  it('customer-orders report with totals over active orders only', async () => {
    const res = await request(app)
      .get(`/api/reports/customer-orders?customerId=${amit.id}`)
      .set(auth(owner));
    expect(res.body.data.orders).toHaveLength(1); // the cancelled one, still visible
    expect(res.body.data.totalOrders).toBe(0);
    expect(res.body.data.totalAmount).toBe(0);
  });

  it('revenue report over a range', async () => {
    const res = await request(app)
      .get(`/api/reports/revenue?from=${TODAY}&to=${TODAY}`)
      .set(auth(owner));
    expect(res.body.data.totalRevenue).toBe(150);
    expect(res.body.data.byDate).toHaveLength(1);
  });

  it('customer-summary export: all-time per-customer ledger', async () => {
    const res = await request(app)
      .get('/api/reports/customer-summary/export')
      .set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'Customer,Mobile,Type,Status,Breakfast Tiffins,Lunch Tiffins,Dinner Tiffins,Total Tiffins,Total Amount (INR),Paid (INR),Pending (INR)',
    );
    // Rahul: lunch + dinner active = 2 tiffins, billed 150, paid 100, pending 50.
    expect(lines).toContain('Rahul Sharma,9876500040,regular,active,0,1,1,2,150,100,50');
    // Amit's only order is cancelled → everything zero.
    expect(lines).toContain('Amit Verma,9876500041,occasional,active,0,0,0,0,0,0,0');
  });

  it('statement record: server-computed numbers, listed per customer', async () => {
    const res = await request(app).post('/api/statements').set(auth(owner)).send({
      customerId: rahul.id,
      periodLabel: 'All time',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      customerName: 'Rahul Sharma',
      periodLabel: 'All time',
      totalTiffins: 2,
      lunchCount: 1,
      dinnerCount: 1,
      periodAmount: 150,
      totalBilled: 150,
      totalPaid: 100,
      pending: 50,
    });

    const list = await request(app)
      .get(`/api/statements?customerId=${rahul.id}`)
      .set(auth(owner));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].pending).toBe(50);

    // Range-limited statement: a date window with no orders → zeros, but the
    // all-time balance block stays authoritative.
    const empty = await request(app).post('/api/statements').set(auth(owner)).send({
      customerId: rahul.id,
      periodLabel: 'Old window',
      from: '2020-01-01',
      to: '2020-01-31',
    });
    expect(empty.body.data).toMatchObject({ totalTiffins: 0, periodAmount: 0, pending: 50 });

    // All-customers listing (no customerId) carries customer names, and a
    // freshly generated statement is still awaiting payment.
    const all = await request(app).get('/api/statements').set(auth(owner));
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBe(2);
    expect(all.body.data[0].customerName).toBe('Rahul Sharma');
    const fresh = all.body.data.find((s: { periodLabel: string }) => s.periodLabel === 'All time');
    expect(fresh).toMatchObject({ receivedSince: 0, settlementStatus: 'awaiting' });

    // Partial payment after the statement → 'partial'; covering the pending → 'settled'.
    await request(app).post('/api/payments').set(auth(owner)).send({
      customerId: rahul.id,
      amount: 20,
      paymentDate: TODAY,
      method: 'cash',
      notes: 'part settle',
    });
    const afterPartial = await request(app)
      .get(`/api/statements?customerId=${rahul.id}`)
      .set(auth(owner));
    const partial = afterPartial.body.data.find(
      (s: { periodLabel: string }) => s.periodLabel === 'All time',
    );
    expect(partial).toMatchObject({ receivedSince: 20, settlementStatus: 'partial' });

    await request(app).post('/api/payments').set(auth(owner)).send({
      customerId: rahul.id,
      amount: 30,
      paymentDate: TODAY,
      method: 'upi',
      notes: 'full settle',
    });
    const afterFull = await request(app)
      .get(`/api/statements?customerId=${rahul.id}`)
      .set(auth(owner));
    const settled = afterFull.body.data.find(
      (s: { periodLabel: string }) => s.periodLabel === 'All time',
    );
    expect(settled).toMatchObject({ receivedSince: 50, settlementStatus: 'settled' });
  });

  it('a payment settled AGAINST one statement counts only for that statement', async () => {
    const stA = await request(app).post('/api/statements').set(auth(owner)).send({
      customerId: rahul.id,
      periodLabel: 'Link A',
    });
    const linked = await request(app).post('/api/payments').set(auth(owner)).send({
      customerId: rahul.id,
      amount: 40,
      paymentDate: TODAY,
      method: 'cash',
      notes: 'settled against A',
      statementId: stA.body.data.id,
    });
    expect(linked.status).toBe(201);
    expect(linked.body.data.statementPeriodLabel).toBe('Link A');

    // A later statement must NOT absorb that linked payment.
    const stB = await request(app).post('/api/statements').set(auth(owner)).send({
      customerId: rahul.id,
      periodLabel: 'Link B',
    });
    const list = await request(app)
      .get(`/api/statements?customerId=${rahul.id}`)
      .set(auth(owner));
    const a = list.body.data.find((s: { id: string }) => s.id === stA.body.data.id);
    const b = list.body.data.find((s: { id: string }) => s.id === stB.body.data.id);
    expect(a.receivedSince).toBe(40);
    expect(b.receivedSince).toBe(0);

    // A statement from another customer is rejected as a link target.
    const wrong = await request(app).post('/api/payments').set(auth(owner)).send({
      customerId: amit.id,
      amount: 10,
      paymentDate: TODAY,
      method: 'cash',
      notes: '',
      statementId: stA.body.data.id,
    });
    expect(wrong.status).toBe(400);

    // Delete works and removes exactly one record.
    const before = await request(app).get('/api/statements').set(auth(owner));
    const victim = before.body.data.find(
      (s: { periodLabel: string }) => s.periodLabel === 'Old window',
    );
    const del = await request(app).delete(`/api/statements/${victim.id}`).set(auth(owner));
    expect(del.status).toBe(200);
    const after = await request(app).get('/api/statements').set(auth(owner));
    expect(after.body.data.length).toBe(before.body.data.length - 1);
  });

  it('CSV export ships a well-formed attachment', async () => {
    const res = await request(app)
      .get(`/api/reports/export?from=${TODAY}&to=${TODAY}`)
      .set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'Date,Meal,Customer,Mobile,Customer Type,Qty,Unit (INR),Price (INR),Status',
    );
    expect(lines).toHaveLength(4); // header + 3 orders (incl. cancelled, marked as such)
    expect(res.text).toContain('cancelled');
  });
});
