// r3f 8 adds invalidate() calls up (internal.frames = min(60, frames + 1)), so
// every extra call buys an extra frame. These helpers keep at most one queued.
// internal.frames is not public API: recheck when upgrading @react-three/fiber.

// From events and store updates: draw one frame unless one is already queued.
export function requestFrame(state) {
  if (state.internal.frames === 0) state.invalidate();
}

// From useFrame while an animation runs: the current frame still counts as 1.
export function continueFrames(state) {
  if (state.internal.frames < 2) state.invalidate();
}
