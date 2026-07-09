import { describe, it, expect } from 'vitest';
import { CounterModel } from './counter.js';

describe('CounterModel', () => {
  it('requires an _id', () => {
    const doc = new CounterModel({});
    const error = doc.validateSync();
    expect(error?.errors._id).toBeDefined();
  });

  it('defaults seq to 0', () => {
    const doc = new CounterModel({ _id: 'blogNumber' });
    expect(doc.seq).toBe(0);
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts an explicit seq value', () => {
    const doc = new CounterModel({ _id: 'blogNumber', seq: 42 });
    expect(doc.seq).toBe(42);
  });
});
