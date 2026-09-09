import { expect, test, describe } from 'vitest';
import { hashPassword, verifyPassword } from './auth';

describe('hashPassword and verifyPassword', () => {
  test('hashPassword generates a valid hash string', async () => {
    const password = 'mySecurePassword123!';
    const hashStr = await hashPassword(password);

    expect(hashStr).toBeTypeOf('string');
    expect(hashStr).toContain(':');

    const parts = hashStr.split(':');
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0); // salt
    expect(parts[1].length).toBeGreaterThan(0); // hash
  });

  test('hashPassword generates different hashes for the same password due to random salts', async () => {
    const password = 'mySecurePassword123!';
    const hashStr1 = await hashPassword(password);
    const hashStr2 = await hashPassword(password);

    expect(hashStr1).not.toBe(hashStr2);
  });

  test('verifyPassword returns true for a correct password', async () => {
    const password = 'mySecurePassword123!';
    const hashStr = await hashPassword(password);

    const isValid = await verifyPassword(password, hashStr);
    expect(isValid).toBe(true);
  });

  test('verifyPassword returns false for an incorrect password', async () => {
    const password = 'mySecurePassword123!';
    const wrongPassword = 'wrongPassword123!';
    const hashStr = await hashPassword(password);

    const isValid = await verifyPassword(wrongPassword, hashStr);
    expect(isValid).toBe(false);
  });

  test('verifyPassword returns false for incorrectly formatted stored hash', async () => {
    const password = 'mySecurePassword123!';

    const isValid1 = await verifyPassword(password, 'invalidhashformat');
    expect(isValid1).toBe(false);

    const isValid2 = await verifyPassword(password, ':onlyhash');
    expect(isValid2).toBe(false);

    const isValid3 = await verifyPassword(password, 'onlysalt:');
    expect(isValid3).toBe(false);
  });

  test('handles empty password strings', async () => {
    const emptyPassword = '';
    const hashStr = await hashPassword(emptyPassword);

    const isValid = await verifyPassword(emptyPassword, hashStr);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('notempty', hashStr);
    expect(isInvalid).toBe(false);
  });
});
