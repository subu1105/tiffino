// Runs before each test file's imports — must configure env before config/env.ts loads.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-test-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.BCRYPT_COST = '4';
process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/tiffino_test_${process.env.VITEST_POOL_ID ?? '0'}`;
