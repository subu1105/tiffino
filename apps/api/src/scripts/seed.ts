/**
 * Bootstrap script.
 *
 *   pnpm --filter @tiffino/api seed         → creates the owner account (idempotent)
 *   pnpm --filter @tiffino/api seed:demo    → also loads demo customers/orders/payments
 *                                             (development only — refuses in production)
 *
 * Owner credentials come from SEED_OWNER_EMAIL / SEED_OWNER_NAME / SEED_OWNER_PASSWORD.
 * If SEED_OWNER_PASSWORD is unset, a random password is generated and printed ONCE.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { addDays, todayBusinessDate, DEFAULT_STAFF_PERMISSIONS } from '@tiffino/shared';
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { Customer } from '../models/Customer';
import { CustomerPriceHistory } from '../models/CustomerPriceHistory';
import { Order } from '../models/Order';
import { Payment } from '../models/Payment';
import { User } from '../models/User';

const DEMO = process.argv.includes('--demo');

async function ensureOwner(): Promise<InstanceType<typeof User>> {
  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@tiffino.local';
  const existing = await User.findOne({ role: 'owner' });
  if (existing) {
    console.log(`Owner already exists: ${existing.email}`);
    return existing;
  }
  const password = process.env.SEED_OWNER_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const owner = await User.create({
    fullName: process.env.SEED_OWNER_NAME ?? 'Tiffino Owner',
    email,
    passwordHash: await bcrypt.hash(password, env.BCRYPT_COST),
    role: 'owner',
    permissions: [],
    status: 'active',
  });
  console.log('Owner account created:');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log('Change this password after first login (Settings → Change password).');
  return owner;
}

async function seedDemo(ownerId: string): Promise<void> {
  if (env.isProd) {
    console.error('Refusing to seed demo data in production.');
    return;
  }
  if ((await Customer.countDocuments()) > 0) {
    console.log('Customers already exist — skipping demo data.');
    return;
  }

  const staff = await User.create({
    fullName: 'Demo Staff',
    email: 'staff@tiffino.local',
    passwordHash: await bcrypt.hash('Staff1234', env.BCRYPT_COST),
    role: 'staff',
    permissions: DEFAULT_STAFF_PERMISSIONS,
    status: 'active',
    createdBy: ownerId,
  });
  console.log('Demo staff created: staff@tiffino.local / Staff1234');

  const today = todayBusinessDate();
  const joining = addDays(today, -30);
  const demoCustomers = [
    { fullName: 'Rahul Sharma', mobile: '9876500001', type: 'regular', lunchPrice: 70, dinnerPrice: 80 },
    { fullName: 'Amit Verma', mobile: '9876500002', type: 'regular', lunchPrice: 65, dinnerPrice: 75 },
    { fullName: 'Priya Singh', mobile: '9876500003', type: 'occasional', lunchPrice: 90, dinnerPrice: 100 },
    { fullName: 'Sneha Patel', mobile: '9876500004', type: 'regular', lunchPrice: 70, dinnerPrice: 80 },
    { fullName: 'Vikram Rao', mobile: '9876500005', type: 'regular', lunchPrice: 75, dinnerPrice: 85 },
    { fullName: 'Anjali Gupta', mobile: '9876500006', type: 'occasional', lunchPrice: 95, dinnerPrice: 105 },
  ] as const;

  const customers = [];
  for (const c of demoCustomers) {
    const doc = await Customer.create({
      ...c,
      address: 'Demo address, Indore',
      joiningDate: joining,
      status: 'active',
      notes: '',
      createdBy: ownerId,
      updatedBy: ownerId,
    });
    await CustomerPriceHistory.create({
      customerId: doc._id,
      lunchPrice: doc.lunchPrice,
      dinnerPrice: doc.dinnerPrice,
      prevLunchPrice: null,
      prevDinnerPrice: null,
      effectiveDate: joining,
      changedBy: ownerId,
    });
    customers.push(doc);
  }

  // Last 7 days of bookings: regulars get lunch+dinner, occasionals get sporadic lunches.
  let orderCount = 0;
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    for (const c of customers) {
      const isRegular = c.type === 'regular';
      const meals = isRegular ? ['lunch', 'dinner'] : i % 3 === 0 ? ['lunch'] : [];
      for (const mealType of meals) {
        const unitPrice = mealType === 'lunch' ? c.lunchPrice : c.dinnerPrice;
        await Order.create({
          customerId: c._id,
          orderDate: date,
          mealType,
          customerTypeSnapshot: c.type,
          customerNameSnapshot: c.fullName,
          price: unitPrice,
          unitPrice,
          quantity: 1,
          status: i === 0 ? 'booked' : 'delivered',
          active: true,
          createdBy: staff._id,
          updatedBy: staff._id,
        });
        orderCount++;
      }
    }
  }

  for (const [i, c] of customers.entries()) {
    if (c.type !== 'regular') continue;
    await Payment.create({
      customerId: c._id,
      amount: 500 + i * 100,
      paymentDate: addDays(today, -2),
      method: i % 2 === 0 ? 'upi' : 'cash',
      notes: 'Demo part payment',
      recordedBy: ownerId,
    });
  }

  console.log(`Demo data: ${customers.length} customers, ${orderCount} orders, payments recorded.`);
}

async function main(): Promise<void> {
  await connectDb();
  const owner = await ensureOwner();
  if (DEMO) await seedDemo(owner.id);
  await disconnectDb();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
