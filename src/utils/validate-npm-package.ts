/**
 * Validates a user-supplied npm package name before interpolating it into a
 * shell command (e.g. `npm install -g <name>`).
 *
 * Allows:
 *   - Scoped packages:   @scope/package-name
 *   - Regular packages:  package-name, some.package, some_package
 *
 * Rejects anything containing shell metacharacters (;, &, |, `, $, (, ), <,
 * >, {, }, [, ], \, ", ', newlines, spaces) or names longer than npm's 214-
 * character limit.
 */

const NPM_PACKAGE_RE = /^(@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]{1,214}$/;

/**
 * Returns true if `name` is a safe, well-formed npm package name that can be
 * interpolated into a shell command without risk of injection.
 */
export function isValidNpmPackageName(name: string): boolean {
  return NPM_PACKAGE_RE.test(name);
}
