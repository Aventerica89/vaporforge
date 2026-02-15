/** Lightweight class name joiner — filters falsy values and joins with space. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
