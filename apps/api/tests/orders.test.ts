import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let rahul: { id: string };
let amit: { id: string };
let priya: { id: string };

const DATE = '2026-11-20';

beforeAll(async () => {
  app = await setupTestDb();
  owner = await createOwner(app);
  rahul = await createCustomerVia(app, owner, {
    fullName: 'Rahul Sharma',
    mobile: '9876500030',
    type: 'regular',
    lunchPrice: 70,
    dinnerPrice: 80,
  });
  amit = await createCustomerVia(app, owner, {
    fullName: 'Amit Verma',
    mobile: '9876500031',
    type: 'regular',
    lunchPrice: 65,
    dinnerPrice: 75,
  });
  priya = await createCustomerVia(app, owner, {
    fullName: 'Priya Singh',
    mobile: '9876500032',
    type: 'occasional',
    lunchPrice: 90,
    dinnerPrice: 100,
  });
});
afterAll(teardownTestDb);

describe('daily booking — core business rules', () => {
  it('books lunch at the customer-specific price with type snapshot', async () => {
    const res = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: rahul.id,
      orderDate: DATE,
      mealType: 'lunch',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      customerName: 'Rahul Sharma',
      orderDate: DATE,
      mealType: 'lunch',
      price: 70,
      customerTypeSnapshot: 'regular',
      status: 'booked',
      active: true,
    });
  });

  it('lunch and dinner are separate orders; both can exist the same day', async () => {
    const dinner = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: rahul.id,
      orderDate: DATE,
      mealType: 'dinner',
    });
    expect(dinner.status).toBe(201);
    expect(dinner.body.data.price).toBe(80);

    const list = await request(app)
      .get(`/api/orders?date=${DATE}&customerId=${rahul.id}`)
      .set(auth(owner));
    expect(list.body.data).toHaveLength(2);
  });

  it('prevents duplicate booking for the same customer+date+meal', async () => {
    const dup = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: rahul.id,
      orderDate: DATE,
      mealType: 'lunch',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_BOOKING');
  });

  it('cancel frees the slot; the cancelled order stays in history; rebooking works', async () => {
    const booking = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: amit.id,
      orderDate: DATE,
      mealType: 'lunch',
    });
    const orderId = booking.body.data.id as string;

    const cancel = await request(app)
      .patch(`/api/orders/${orderId}/cancel`)
      .set(auth(owner))
      .send({ reason: 'Out of town' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('cancelled');
    expect(cancel.body.data.active).toBe(false);

    const again = await request(app)
      .patch(`/api/orders/${orderId}/cancel`)
      .set(auth(owner))
      .send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ORDER_ALREADY_CANCELLED');

    // The slot is free again thanks to the partial unique index.
    const rebook = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: amit.id,
      orderDate: DATE,
      mealType: 'lunch',
    });
    expect(rebook.status).toBe(201);

    // Cancelled order remains queryable history.
    const cancelled = await request(app)
      .get(`/api/orders?date=${DATE}&status=cancelled`)
      .set(auth(owner));
    expect(cancelled.body.data.some((o: { id: string }) => o.id === orderId)).toBe(true);
  });

  it('status flows forward only: booked → prepared → delivered', async () => {
    const booking = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: priya.id,
      orderDate: DATE,
      mealType: 'lunch',
    });
    const id = booking.body.data.id as string;

    const prepared = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(auth(owner))
      .send({ status: 'prepared' });
    expect(prepared.body.data.status).toBe('prepared');

    const delivered = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(auth(owner))
      .send({ status: 'delivered' });
    expect(delivered.body.data.status).toBe('delivered');

    const backwards = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(auth(owner))
      .send({ status: 'prepared' });
    expect(backwards.status).toBe(409);
    expect(backwards.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const cancelDelivered = await request(app)
      .patch(`/api/orders/${id}/cancel`)
      .set(auth(owner))
      .send({});
    expect(cancelDelivered.status).toBe(409);
  });

  it('price override needs the permission, marks the order, and spares the customer record', async () => {
    const plainStaff = await createStaff(app, ['orders.view', 'orders.book'], 'plain@test.local');
    const blocked = await request(app).post('/api/orders').set(auth(plainStaff)).send({
      customerId: priya.id,
      orderDate: '2026-11-21',
      mealType: 'dinner',
      priceOverride: 50,
    });
    expect(blocked.status).toBe(403);

    const allowed = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: priya.id,
      orderDate: '2026-11-21',
      mealType: 'dinner',
      priceOverride: 50,
    });
    expect(allowed.status).toBe(201);
    expect(allowed.body.data.price).toBe(50);
    expect(allowed.body.data.priceOverridden).toBe(true);

    const profile = await request(app).get(`/api/customers/${priya.id}`).set(auth(owner));
    expect(profile.body.data.customer.dinnerPrice).toBe(100);
  });

  it('bulk-books all regular customers, skipping existing bookings with counts', async () => {
    const res = await request(app).post('/api/orders/bulk-book').set(auth(owner)).send({
      orderDate: DATE,
      mealType: 'dinner',
      mode: 'all-regular',
    });
    expect(res.status).toBe(200);
    // Rahul already has dinner on DATE; Amit does not. Priya is occasional → not targeted.
    expect(res.body.data.booked).toBe(1);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.skippedCustomers[0]).toMatchObject({
      fullName: 'Rahul Sharma',
      reason: 'already-booked',
    });

    // Re-running books nobody new.
    const rerun = await request(app).post('/api/orders/bulk-book').set(auth(owner)).send({
      orderDate: DATE,
      mealType: 'dinner',
      mode: 'all-regular',
    });
    expect(rerun.body.data.booked).toBe(0);
    expect(rerun.body.data.skipped).toBe(2);
  });

  it('bulk-books an explicit selection, reporting inactive customers', async () => {
    const dormant = await createCustomerVia(app, owner, {
      fullName: 'Dormant Dinesh',
      mobile: '9876500033',
      status: 'inactive',
    });
    const res = await request(app).post('/api/orders/bulk-book').set(auth(owner)).send({
      orderDate: '2026-11-22',
      mealType: 'lunch',
      mode: 'selected',
      customerIds: [priya.id, dormant.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.booked).toBe(1);
    expect(res.body.data.skippedCustomers[0]).toMatchObject({
      fullName: 'Dormant Dinesh',
      reason: 'inactive',
    });
  });

  it('booking sheet returns every active customer with their bookings for the date', async () => {
    const res = await request(app).get(`/api/orders/sheet?date=${DATE}`).set(auth(owner));
    expect(res.status).toBe(200);
    const rows = res.body.data as {
      customer: { fullName: string };
      lunch: { price: number } | null;
      dinner: { price: number } | null;
    }[];
    expect(rows.length).toBeGreaterThanOrEqual(3); // dormant customer excluded
    const rahulRow = rows.find((r) => r.customer.fullName === 'Rahul Sharma')!;
    expect(rahulRow.lunch?.price).toBe(70);
    expect(rahulRow.dinner?.price).toBe(80);
  });

  it('quantity: one customer can take 2 tiffins of the same meal', async () => {
    const booking = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: rahul.id,
      orderDate: '2026-11-25',
      mealType: 'lunch',
      quantity: 2,
    });
    expect(booking.status).toBe(201);
    // price = unit 70 × 2; still ONE row, so duplicate protection stays intact.
    expect(booking.body.data).toMatchObject({ quantity: 2, unitPrice: 70, price: 140 });

    const dup = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: rahul.id,
      orderDate: '2026-11-25',
      mealType: 'lunch',
    });
    expect(dup.status).toBe(409);

    // Change quantity afterwards: 2 → 3 recomputes the total.
    const bumped = await request(app)
      .patch(`/api/orders/${booking.body.data.id}/quantity`)
      .set(auth(owner))
      .send({ quantity: 3 });
    expect(bumped.body.data).toMatchObject({ quantity: 3, price: 210 });

    // Delivered orders can no longer change quantity.
    await request(app)
      .patch(`/api/orders/${booking.body.data.id}/status`)
      .set(auth(owner))
      .send({ status: 'delivered' });
    const frozen = await request(app)
      .patch(`/api/orders/${booking.body.data.id}/quantity`)
      .set(auth(owner))
      .send({ quantity: 1 });
    expect(frozen.status).toBe(409);
  });

  it('breakfast: bookable once a breakfast price is set; guarded when it is 0', async () => {
    // Rahul has no breakfast price yet → booking is refused with guidance.
    const blocked = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: rahul.id,
      orderDate: '2026-11-26',
      mealType: 'breakfast',
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.message).toContain('breakfast price');

    // Set the price (lunch/dinner untouched), then book.
    const priced = await request(app)
      .put(`/api/customers/${rahul.id}/prices`)
      .set(auth(owner))
      .send({ breakfastPrice: 40, lunchPrice: 70, dinnerPrice: 80 });
    expect(priced.status).toBe(200);
    expect(priced.body.data.breakfastPrice).toBe(40);

    const booking = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: rahul.id,
      orderDate: '2026-11-26',
      mealType: 'breakfast',
      quantity: 2,
    });
    expect(booking.status).toBe(201);
    expect(booking.body.data).toMatchObject({ mealType: 'breakfast', unitPrice: 40, price: 80 });

    // Breakfast is its own slot: lunch the same day still books fine.
    const lunch = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: rahul.id,
      orderDate: '2026-11-26',
      mealType: 'lunch',
    });
    expect(lunch.status).toBe(201);

    // The sheet now carries all three meals.
    const sheet = await request(app).get('/api/orders/sheet?date=2026-11-26').set(auth(owner));
    const row = (sheet.body.data as { customer: { fullName: string }; breakfast: unknown }[]).find(
      (r) => r.customer.fullName === 'Rahul Sharma',
    )!;
    expect(row.breakfast).not.toBeNull();
  });

  it('bulk breakfast skips customers without a breakfast price, with reason', async () => {
    const res = await request(app).post('/api/orders/bulk-book').set(auth(owner)).send({
      orderDate: '2026-11-27',
      mealType: 'breakfast',
      mode: 'all-regular',
    });
    expect(res.status).toBe(200);
    // Only Rahul (regular) has a breakfast price; Amit is skipped as no-price.
    expect(res.body.data.booked).toBe(1);
    expect(
      res.body.data.skippedCustomers.some(
        (s: { fullName: string; reason: string }) =>
          s.fullName === 'Amit Verma' && s.reason === 'no-price',
      ),
    ).toBe(true);
  });

  it('rejects bookings with malformed dates or ids', async () => {
    const badDate = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: rahul.id,
      orderDate: '2026-13-45',
      mealType: 'lunch',
    });
    expect(badDate.status).toBe(400);

    const badId = await request(app).post('/api/orders').set(auth(owner)).send({
      customerId: 'not-an-id',
      orderDate: DATE,
      mealType: 'lunch',
    });
    expect(badId.status).toBe(400);
  });
});
