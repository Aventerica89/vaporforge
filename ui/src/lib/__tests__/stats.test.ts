import { describe, it, expect } from 'vitest';
import { median, percentile, mean, errorRate } from '../stats';

describe('stats', () => {
  describe('median', () => {
    it('returns null for empty array', () => expect(median([])).toBeNull());
    it('returns single value', () => expect(median([5])).toBe(5));
    it('returns middle of odd-length array', () => expect(median([1, 2, 3, 4, 5])).toBe(3));
    it('returns average of middle two for even-length', () => expect(median([1, 2, 3, 4])).toBe(2.5));
    it('handles unsorted input', () => expect(median([5, 1, 3])).toBe(3));
  });

  describe('percentile', () => {
    it('returns null for empty array', () => expect(percentile([], 99)).toBeNull());
    it('returns P99 of 100 values', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(percentile(values, 99)).toBe(99);
    });
    it('returns P50 (median equivalent)', () => {
      expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    });
    it('handles single element', () => expect(percentile([42], 99)).toBe(42));
  });

  describe('mean', () => {
    it('returns null for empty array', () => expect(mean([])).toBeNull());
    it('computes average', () => expect(mean([10, 20, 30])).toBe(20));
    it('handles single value', () => expect(mean([7])).toBe(7));
  });

  describe('errorRate', () => {
    it('returns 0 for no entries', () => expect(errorRate([])).toBe(0));
    it('computes percentage', () => {
      const entries = [{ level: 'error' }, { level: 'info' }, { level: 'info' }];
      expect(errorRate(entries)).toBeCloseTo(33.33, 1);
    });
    it('returns 100 for all errors', () => {
      expect(errorRate([{ level: 'error' }, { level: 'error' }])).toBe(100);
    });
    it('returns 0 for no errors', () => {
      expect(errorRate([{ level: 'info' }, { level: 'warn' }])).toBe(0);
    });
  });
});
