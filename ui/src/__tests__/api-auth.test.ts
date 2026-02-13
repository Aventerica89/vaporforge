// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPreviousUserId, persistUserId } from '@/lib/api';

describe('previousUserId cookie fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = 'vf-user-id=; path=/; max-age=0';
  });

  afterEach(() => {
    localStorage.clear();
    document.cookie = 'vf-user-id=; path=/; max-age=0';
  });

  it('reads previousUserId from cookie when localStorage is empty', () => {
    expect(localStorage.getItem('vf-user-id')).toBeNull();

    document.cookie = 'vf-user-id=user_abc123; path=/; SameSite=Strict';

    const result = getPreviousUserId();
    expect(result).toBe('user_abc123');
  });

  it('prefers localStorage over cookie', () => {
    localStorage.setItem('vf-user-id', 'user_from_storage');
    document.cookie = 'vf-user-id=user_from_cookie; path=/; SameSite=Strict';

    const result = getPreviousUserId();
    expect(result).toBe('user_from_storage');
  });

  it('returns undefined when neither localStorage nor cookie has userId', () => {
    const result = getPreviousUserId();
    expect(result).toBeUndefined();
  });

  it('sets vf-user-id cookie on persistUserId', () => {
    persistUserId('user_newid999');

    expect(localStorage.getItem('vf-user-id')).toBe('user_newid999');
    expect(document.cookie).toContain('vf-user-id=user_newid999');
  });
});
