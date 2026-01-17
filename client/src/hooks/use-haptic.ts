/**
 * iOS Haptic Feedback Hook
 * Provides tactile feedback for user interactions on supported devices.
 * Uses the Web Vibration API with iOS-specific patterns.
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

// Vibration patterns for different feedback styles (in milliseconds)
const hapticPatterns: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 50, 10],
  warning: [20, 30, 20],
  error: [30, 50, 30, 50, 30],
  selection: 5,
};

/**
 * Check if haptic feedback is available on this device
 */
function isHapticSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * Trigger haptic feedback
 * @param style - The type of haptic feedback to trigger
 */
function triggerHaptic(style: HapticStyle = 'medium'): void {
  if (!isHapticSupported()) return;

  const pattern = hapticPatterns[style];

  try {
    navigator.vibrate(pattern);
  } catch {
    // Silently fail if vibration is not available
  }
}

/**
 * React hook for haptic feedback
 * Returns functions to trigger different types of haptic feedback
 */
export function useHaptic() {
  return {
    /** Light tap feedback - for subtle interactions */
    light: () => triggerHaptic('light'),

    /** Medium tap feedback - for standard button presses */
    medium: () => triggerHaptic('medium'),

    /** Heavy tap feedback - for significant actions */
    heavy: () => triggerHaptic('heavy'),

    /** Success feedback - for completed actions */
    success: () => triggerHaptic('success'),

    /** Warning feedback - for cautionary actions */
    warning: () => triggerHaptic('warning'),

    /** Error feedback - for failed actions */
    error: () => triggerHaptic('error'),

    /** Selection feedback - for picker/selector changes */
    selection: () => triggerHaptic('selection'),

    /** Check if haptic is available */
    isSupported: isHapticSupported(),
  };
}

export { triggerHaptic, isHapticSupported };
export type { HapticStyle };
