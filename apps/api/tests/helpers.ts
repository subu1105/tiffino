import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import type { Permission } from '@tiffino/shared';
import { buildApp } from '../src/app';
import { connectDb } from '../src/config/db';
import { Customer } from '../src/models/Customer';
import { Order } from '../src/models/Order';
import { User } from '../src/models/User';

export async function setupTestDb(): Promise<Express> {
  if (mongoose.connection.readyState === 0) {
    await connectDb(process.env.MONGODB_URI);
  }
  await mongoose.connection.dropDatabase();
  // The partial unique index must exist before booking tests run.
  await Promise.all([Order.syncIndexes(), Customer.syncIndexes(), User.syncIndexes()]);
  return buildApp();
}

export async function teardownTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

export interface TestActor {
  id: string;
  token: string;
  email: string;
  password: string;
}

export async function createOwner(app: Express): Promise<TestActor> {
  const email = 'owner@test.local';
  const password = 'Owner1234';
  await User.create({
    fullName: 'Test Owner',
    email,
    passwordHash: await bcrypt.hash(password, 4),
    role: 'owner',
    permissions: [],
    status: 'active',
  });
  return loginAs(app, email, password);
}

export async function createStaff(
  app: Express,
  permissions: Permission[],
  email = 'staff@test.local',
): Promise<TestActor> {
  const password = 'Staff1234';
  await User.create({
    fullName: 'Test Staff',
    email,
    passwordHash: await bcrypt.hash(password, 4),
    role: 'staff',
    permissions,
    status: 'active',
  });
  return loginAs(app, email, password);
}

export async function loginAs(app: Express, email: string, password: string): Promise<TestActor> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return {
    id: res.body.data.user.id,
    token: res.body.data.accessToken,
    email,
    password,
  };
}

export function auth(actor: TestActor): { Authorization: string } {
  return { Authorization: `Bearer ${actor.token}` };
}

export async function createCustomerVia(
  app: Express,
  actor: TestActor,
  overrides: Partial<{
    fullName: string;
    mobile: string;
    type: 'regular' | 'occasional';
    lunchPrice: number;
    dinnerPrice: number;
    status: 'active' | 'inactive';
  }> = {},
): Promise<{ id: string; [k: string]: unknown }> {
  const res = await request(app)
    .post('/api/customers')
    .set(auth(actor))
    .send({
      fullName: overrides.fullName ?? 'Rahul Sharma',
      mobile: overrides.mobile ?? '9876543210',
      address: 'MG Road, Indore',
      type: overrides.type ?? 'regular',
      lunchPrice: overrides.lunchPrice ?? 70,
      dinnerPrice: overrides.dinnerPrice ?? 80,
      joiningDate: '2026-11-01',
      status: overrides.status ?? 'active',
      notes: '',
    });
  if (res.status !== 201) {
    throw new Error(`createCustomer failed: ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}
