# Plan: Fix user data loss on re-authentication (user-alias bug)

## Root Cause

When you log in, the backend hashes your token to derive a `userId` (e.g. `user_abc123`). All your data (sessions, secrets, issues, favorites, plugins, etc.) is stored under KV keys prefixed with that `userId`.

The frontend sends a `previousUserId` hint (from `localStorage`) so that if your token changes, the backend can reconnect you to your old data. **But when localStorage is cleared — which happens on a hard refresh via DevTools — the hint is lost.** Without it, the backend has no way to find your existing user record if the token hash changed.

The system *does* write a `user-alias:${newHash}` forward pointer when tokens rotate (`src/auth.ts:106`), but **it never reads it back**. So the alias exists in KV but is completely unused.

**Result:** After a hard refresh + re-login, the backend creates a brand-new user record. All your data is orphaned under the old userId — hence "half the time my data doesn't show up."

## Fix (2 changes)

### 1. Backend: Resolve `user-alias` during login (`src/auth.ts`)

In `getOrCreateUser()`, after the initial KV lookup misses (step 1), and before the `previousUserId` check (step 2), add a step that looks up `user-alias:${userId}`. If an alias exists, it means this token hash was previously mapped to an older userId — use that older userId to load the user record.

This makes the system self-healing: even without the `previousUserId` localStorage hint, the backend can reconnect a rotated token to its original user.

### 2. Frontend: Persist `vf-user-id` in a cookie alongside localStorage (`ui/src/lib/api.ts`)

Hard refresh clears localStorage but not cookies. By also writing `vf-user-id` to a `SameSite=Strict; Secure` cookie, we create a fallback that survives cache clears. On login, read from localStorage first, fall back to the cookie.

## TDD Approach

### Test file: `src/auth.test.ts` (new)

Write the following **failing** tests first, then implement the fix:

1. **"resolves user-alias when token hash has a forward pointer"**
   - Setup: put `user:user_OLD` in KV with user data, put `user-alias:user_NEW` → `user_OLD`
   - Call `getOrCreateUser(tokenThatHashesToNEW)` with NO previousUserId
   - Assert: returns the user from `user:user_OLD`, does NOT create a new user

2. **"falls through to create new user when no alias and no hint exist"**
   - Setup: KV is empty
   - Call `getOrCreateUser(someToken)` with no previousUserId
   - Assert: creates and returns a new user

3. **"prefers direct user match over alias"**
   - Setup: put `user:user_X` in KV, also put `user-alias:user_X` → `user_Y`
   - Call `getOrCreateUser(tokenThatHashesToX)`
   - Assert: returns `user:user_X` directly (alias is not consulted)

4. **"previousUserId hint still works and takes priority over alias"**
   - Setup: put `user:user_HINT` in KV, put `user-alias:user_NEW` → `user_OTHER`
   - Call `getOrCreateUser(tokenThatHashesToNEW, "user_HINT")`
   - Assert: returns user from `user:user_HINT`, creates alias `user-alias:user_NEW` → `user_HINT`

5. **"creates forward alias when falling back to alias-resolved user"**
   - Ensures that after resolving via alias, the system updates the alias chain so future rotations also work

### Test file: `ui/src/__tests__/api-auth.test.ts` (new)

6. **"reads previousUserId from cookie when localStorage is empty"**
   - Mock localStorage.getItem('vf-user-id') → null
   - Mock document.cookie to contain `vf-user-id=user_abc`
   - Call `authApi.setupWithToken(token)`
   - Assert: request body includes `previousUserId: "user_abc"`

7. **"sets vf-user-id cookie on successful login"**
   - Call `authApi.setupWithToken(token)` with a mocked success response
   - Assert: `document.cookie` was set with `vf-user-id=<userId>`

## Files to Change

| File | Change |
|------|--------|
| `src/auth.test.ts` | **NEW** — Tests 1-5 (backend alias resolution) |
| `src/auth.ts` | Add `user-alias` lookup in `getOrCreateUser()` between steps 1 and 2 |
| `ui/src/__tests__/api-auth.test.ts` | **NEW** — Tests 6-7 (cookie fallback) |
| `ui/src/lib/api.ts` | Read `vf-user-id` from cookie as fallback; write cookie on login |
| `vitest.config.ts` | **NEW** — Vitest config for backend tests (the project has vitest in devDeps but no config file) |

## Implementation Order (TDD)

1. Create `vitest.config.ts` with minimal config
2. Write failing tests 1-5 in `src/auth.test.ts`
3. Implement alias resolution in `src/auth.ts` → tests pass
4. Write failing tests 6-7 in `ui/src/__tests__/api-auth.test.ts`
5. Implement cookie fallback in `ui/src/lib/api.ts` → tests pass
6. Run full test suite, commit, push
