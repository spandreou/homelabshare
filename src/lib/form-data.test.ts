import test from 'node:test';
import assert from 'node:assert';
import { getFormDataValue, getFormDataString, isFormDataOn } from './form-data';

test('getFormDataValue', async (t) => {
  await t.test('returns exact match if meaningful', () => {
    const formData = new FormData();
    formData.append('key', 'value');
    assert.strictEqual(getFormDataValue(formData, 'key'), 'value');
  });

  await t.test('returns exact match if its a File', () => {
    const formData = new FormData();
    const file = new File(['content'], 'file.txt');
    formData.append('key', file);
    assert.strictEqual(getFormDataValue(formData, 'key'), file);
  });

  await t.test('falls back to prefix match if exact match is not meaningful (empty string)', () => {
    const formData = new FormData();
    formData.append('key', '');
    formData.append('prefix_key', 'value');
    assert.strictEqual(getFormDataValue(formData, 'key'), 'value');
  });

  await t.test('returns exact match empty string if no prefix match exists', () => {
    const formData = new FormData();
    formData.append('key', '');
    assert.strictEqual(getFormDataValue(formData, 'key'), '');
  });

  await t.test('returns null if multiple prefix matches are found', () => {
    const formData = new FormData();
    formData.append('prefix1_key', 'value1');
    formData.append('prefix2_key', 'value2');
    assert.strictEqual(getFormDataValue(formData, 'key'), null);
  });

  await t.test('ignores empty string prefix matches', () => {
    const formData = new FormData();
    formData.append('prefix1_key', '');
    formData.append('prefix2_key', 'value2');
    assert.strictEqual(getFormDataValue(formData, 'key'), 'value2');
  });

  await t.test('ignores non-matching keys', () => {
    const formData = new FormData();
    formData.append('other_field', 'value');
    formData.append('prefix_key', 'value2');
    assert.strictEqual(getFormDataValue(formData, 'key'), 'value2');
  });

  await t.test('returns null if no exact or prefix match exists', () => {
    const formData = new FormData();
    formData.append('other', 'value');
    assert.strictEqual(getFormDataValue(formData, 'key'), null);
  });
});

test('getFormDataString', async (t) => {
  await t.test('returns string value', () => {
    const formData = new FormData();
    formData.append('key', 'value');
    assert.strictEqual(getFormDataString(formData, 'key'), 'value');
  });

  await t.test('returns fallback if value is a File', () => {
    const formData = new FormData();
    formData.append('key', new File([''], 'test.txt'));
    assert.strictEqual(getFormDataString(formData, 'key', 'fallback'), 'fallback');
  });

  await t.test('returns fallback if value is missing', () => {
    const formData = new FormData();
    assert.strictEqual(getFormDataString(formData, 'key', 'fallback'), 'fallback');
  });
});

test('isFormDataOn', async (t) => {
  await t.test('returns true if value is "on"', () => {
    const formData = new FormData();
    formData.append('key', 'on');
    assert.strictEqual(isFormDataOn(formData, 'key'), true);
  });

  await t.test('returns false if value is not "on"', () => {
    const formData = new FormData();
    formData.append('key', 'off');
    assert.strictEqual(isFormDataOn(formData, 'key'), false);
  });

  await t.test('returns false if value is missing', () => {
    const formData = new FormData();
    assert.strictEqual(isFormDataOn(formData, 'key'), false);
  });
});
