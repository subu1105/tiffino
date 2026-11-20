import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, todayBusinessDate } from '@tiffino/shared';
import {
  auth,
  createCustomerVia,
  createOwner,
  createStaff,
  setupTestDb,
  teardownTestDb,
  type TestActor,
} from './helpers';

let app: Express;
let owner: TestActor;

const TODAY = todayBusinessDate();
const YESTERDAY = addDays(TODAY, -1);

beforeAll(async () => {
  app = await setupTestDb();
  owner = await createOwner(app);
});
afterAll(teardownTestDb);

describe('expense book', () => {
  it('records expenses: one date carries multiple items', async () => {
    for (const [item, amount, date] of [
      ['Sabzi mandi', 400, TODAY],
      ['Gas cylinder', 850, TODAY],
      ['Atta 10kg', 380, TODAY],
      ['Milk', 120, YESTERDAY],
    ] as const) {
      const res = await request(app)
        .post('/api/expenses')
        .set(auth(owner))
        .send({ expenseDate: date, item, amount, notes: '' });
      expect(res.status).toBe(201);
    }

    const book = await request(app)
      .get(`/api/expenses/book?from=${YESTERDAY}&to=${TODAY}`)
      .set(auth(owner));
    expect(book.status).toBe(200);
    expect(book.body.data.grandTotal).toBe(1750);
    const todayDay = book.body.data.days.find((d: { date: string }) => d.date === TODAY);
    expect(todayDay.items).toHaveLength(3);
    expect(todayDay.total).toBe(1630);
  });

  it('validates input and enforces permissions', async () => {
    const bad = await request(app)
      .post('/api/expenses')
      .set(auth(owner))
      .send({ expenseDate: TODAY, item: '', amount: 0, notes: '' });
    expect(bad.status).toBe(400);

    const staff = await createStaff(app, ['orders.view'], 'nokharcha@test.local');
    const blocked = await request(app).get('/api/expenses').set(auth(staff));
    expect(blocked.status).toBe(403);
    const blockedPost = await request(app)
      .post('/api/expenses')
      .set(auth(staff))
      .send({ expenseDate: TODAY, item: 'Sneaky', amount: 10, notes: '' });
    expect(blockedPost.status).toBe(403);
  });

  it('deletes an expense and updates the book', async () => {
    const created = await request(app)
      .post('/api/expenses')
      .set(auth(owner))
      .send({ expenseDate: TODAY, item: 'To delete', amount: 99, notes: '' });
    const del = await request(app)
      .delete(`/api/expenses/${created.body.data.id}`)
      .set(auth(owner));
    expect(del.status).toBe(200);
    const book = await request(app)
      .get(`/api/expenses/book?from=${TODAY}&to=${TODAY}`)
      .set(auth(owner));
    expect(book.body.data.grandTotal).toBe(1630);
  });

  it('exports the book as CSV', async () => {
    const res = await request(app)
      .get(`/api/expenses/export?from=${YESTERDAY}&to=${TODAY}`)
      .set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('Date,Item,Amount (INR),Notes,Recorded By');
    expect(lines).toHaveLength(5); // header + 4 expenses
    expect(res.text).toContain('Gas cylinder,850');
  });
});

describe('profit & loss', () => {
  it('computes revenue − expense per day and for the range', async () => {
    // Revenue today: one lunch (70) + one dinner (80) = 150.
    const c = await createCustomerVia(app, owner, {
      fullName: 'PnL Customer',
      mobile: '9876500050',
      lunchPrice: 70,
      dinnerPrice: 80,
    });
    await request(app).post('/api/orders').set(auth(owner)).send({ customerId: c.id, orderDate: TODAY, mealType: 'lunch' });
    const dinner = await request(app).post('/api/orders').set(auth(owner)).send({ customerId: c.id, orderDate: TODAY, mealType: 'dinner' });
    // Cancelled orders must not count as revenue.
    await request(app).patch(`/api/orders/${dinner.body.data.id}/cancel`).set(auth(owner)).send({});

    const res = await request(app)
      .get(`/api/expenses/profit-loss?from=${YESTERDAY}&to=${TODAY}`)
      .set(auth(owner));
    expect(res.status).toBe(200);
    // Revenue 70 (dinner cancelled) · expenses 1630 + 120 = 1750 → loss.
    expect(res.body.data).toMatchObject({
      revenue: 70,
      expense: 1750,
      profit: 70 - 1750,
    });
    const today = res.body.data.byDate.find((p: { date: string }) => p.date === TODAY);
    expect(today).toMatchObject({ revenue: 70, expense: 1630, profit: 70 - 1630 });
    const yesterday = res.body.data.byDate.find((p: { date: string }) => p.date === YESTERDAY);
    expect(yesterday).toMatchObject({ revenue: 0, expense: 120, profit: -120 });
  });

  it('named filters work (today)', async () => {
    const res = await request(app)
      .get('/api/expenses/profit-loss?filter=today')
      .set(auth(owner));
    expect(res.status).toBe(200);
    expect(res.body.data.from).toBe(TODAY);
    expect(res.body.data.byDate).toHaveLength(1);
  });
});

describe('cook ledger', () => {
  it('records paid and return entries; totals net out', async () => {
    for (const [kind, amount, date] of [
      ['paid', 500, YESTERDAY],
      ['paid', 300, TODAY],
      ['return', 200, TODAY],
    ] as const) {
      const res = await request(app)
        .post('/api/cook-ledger')
        .set(auth(owner))
        .send({ entryDate: date, kind, amount, notes: '' });
      expect(res.status).toBe(201);
    }
    const ledger = await request(app).get('/api/cook-ledger').set(auth(owner));
    expect(ledger.status).toBe(200);
    expect(ledger.body.data).toMatchObject({ totalPaid: 800, totalReturned: 200, net: 600 });
    expect(ledger.body.data.entries).toHaveLength(3);
  });

  it('range filter + delete + permission gate', async () => {
    const todayOnly = await request(app)
      .get(`/api/cook-ledger?from=${TODAY}&to=${TODAY}`)
      .set(auth(owner));
    expect(todayOnly.body.data).toMatchObject({ totalPaid: 300, totalReturned: 200, net: 100 });

    const victim = todayOnly.body.data.entries.find(
      (e: { kind: string }) => e.kind === 'return',
    );
    const del = await request(app).delete(`/api/cook-ledger/${victim.id}`).set(auth(owner));
    expect(del.status).toBe(200);
    const after = await request(app).get('/api/cook-ledger').set(auth(owner));
    expect(after.body.data.net).toBe(800);

    const staff = await createStaff(app, ['orders.view'], 'nocook@test.local');
    expect((await request(app).get('/api/cook-ledger').set(auth(staff))).status).toBe(403);
  });
});

describe('cook attendance → profit & loss', () => {
  it('marks worked/leave days, counts them, and upserts corrections', async () => {
    const worked = await request(app)
      .post('/api/cook-ledger/attendance')
      .set(auth(owner))
      .send({ date: TODAY, status: 'worked', dailyRate: 400 });
    expect(worked.status).toBe(200);
    expect(worked.body.data).toMatchObject({ status: 'worked', dailyRate: 400 });

    await request(app)
      .post('/api/cook-ledger/attendance')
      .set(auth(owner))
      .send({ date: YESTERDAY, status: 'leave' });

    const summary = await request(app).get('/api/cook-ledger/attendance').set(auth(owner));
    expect(summary.body.data).toMatchObject({
      workedDays: 1,
      leaveDays: 1,
      wageTotal: 400,
      lastRate: 400,
    });

    // Re-marking the same date corrects it (no duplicate rows).
    await request(app)
      .post('/api/cook-ledger/attendance')
      .set(auth(owner))
      .send({ date: YESTERDAY, status: 'worked', dailyRate: 350 });
    const after = await request(app).get('/api/cook-ledger/attendance').set(auth(owner));
    expect(after.body.data).toMatchObject({ workedDays: 2, leaveDays: 0, wageTotal: 750 });
    expect(after.body.data.days).toHaveLength(2);

    // Worked without a rate is rejected.
    const bad = await request(app)
      .post('/api/cook-ledger/attendance')
      .set(auth(owner))
      .send({ date: TODAY, status: 'worked' });
    expect(bad.status).toBe(400);
  });

  it('worked-day wages land inside profit & loss expenses', async () => {
    const res = await request(app)
      .get(`/api/expenses/profit-loss?from=${YESTERDAY}&to=${TODAY}`)
      .set(auth(owner));
    // Earlier P&L test: kharcha-book 1750; wages 400 (today) + 350 (yesterday).
    expect(res.body.data).toMatchObject({
      cookWage: 750,
      expense: 1750 + 750,
    });
    const today = res.body.data.byDate.find((p: { date: string }) => p.date === TODAY);
    expect(today.cookWage).toBe(400);
    expect(today.expense).toBe(1630 + 400);
  });
});

describe('cook half-day', () => {
  it('half days carry their own wage and join P&L', async () => {
    const TOMORROW_SAFE = TODAY; // reuse today — prior describe deleted nothing here
    const half = await request(app)
      .post('/api/cook-ledger/attendance')
      .set(auth(owner))
      .send({ date: addDays(TODAY, -2), status: 'half-day', dailyRate: 300 });
    expect(half.status).toBe(200);
    expect(half.body.data).toMatchObject({ status: 'half-day', dailyRate: 300 });

    const summary = await request(app).get('/api/cook-ledger/attendance').set(auth(owner));
    // Earlier describe: TODAY worked@400, YESTERDAY worked@350.
    expect(summary.body.data).toMatchObject({
      workedDays: 2,
      halfDays: 1,
      leaveDays: 0,
      wageTotal: 400 + 350 + 300,
      lastRate: 400, // full-day prefill untouched by the half day
    });

    const pnl = await request(app)
      .get(`/api/expenses/profit-loss?from=${addDays(TODAY, -2)}&to=${TOMORROW_SAFE}`)
      .set(auth(owner));
    expect(pnl.body.data.cookWage).toBe(1050);

    // Half day without a rate is rejected.
    const bad = await request(app)
      .post('/api/cook-ledger/attendance')
      .set(auth(owner))
      .send({ date: TODAY, status: 'half-day' });
    expect(bad.status).toBe(400);
  });
});
