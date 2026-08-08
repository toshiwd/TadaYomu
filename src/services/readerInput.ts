export type ReaderPageDirection = "next" | "previous";
export type ReaderVolumeButton = "volumeDown" | "volumeUp";

export const READER_FLICK_MIN_DISTANCE_PX = 48;
export const READER_FLICK_MAX_DURATION_MS = 650;
export const READER_FLICK_AXIS_RATIO = 1.25;

export function getReaderFlickDirection(
  deltaX: number,
  deltaY: number,
  durationMs: number,
  reverseDirection: boolean,
): ReaderPageDirection | null {
  if (
    !Number.isFinite(deltaX) ||
    !Number.isFinite(deltaY) ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    durationMs > READER_FLICK_MAX_DURATION_MS ||
    Math.abs(deltaX) < READER_FLICK_MIN_DISTANCE_PX ||
    Math.abs(deltaX) <= Math.abs(deltaY) * READER_FLICK_AXIS_RATIO
  ) {
    return null;
  }

  const defaultDirection = deltaX < 0 ? "next" : "previous";
  if (!reverseDirection) return defaultDirection;
  return defaultDirection === "next" ? "previous" : "next";
}

export function getVolumeButtonPageDirection(
  button: ReaderVolumeButton,
): ReaderPageDirection {
  return button === "volumeDown" ? "next" : "previous";
}
