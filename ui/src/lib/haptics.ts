/**
 * Haptic feedback utility using the Vibration API.
 * Falls back silently on devices without vibration support.
 */
export const haptics = {
  /** Light tap — button press, copy action */
  light: () => navigator.vibrate?.(10),

  /** Medium tap — swipe close, significant action */
  medium: () => navigator.vibrate?.(20),

  /** Success pattern — task completed */
  success: () => navigator.vibrate?.([10, 30, 10]),

  /** Error pattern — action failed */
  error: () => navigator.vibrate?.([20, 50, 20]),
};
