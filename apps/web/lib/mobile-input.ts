/**
 * Shared mobile input state that both the GameArena and
 * touch control components read/write from.
 */

export const mobileInput = {
  // Virtual joystick for lobby/stage walking
  moveX: 0, // -1 to 1 (left/right)
  moveZ: 0, // -1 to 1 (forward/backward, mapped to w/s)
  active: false,
};
