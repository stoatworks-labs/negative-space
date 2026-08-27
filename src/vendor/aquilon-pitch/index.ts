/**
 * The public face of the engine — the barrel the vendored build is made from.
 *
 * `npm run build:lib` bundles everything reachable from here into one readable
 * ESM file in `dist-lib/`, which is what the other LivePremier tools in the
 * fleet copy in. Adding an export here widens that contract; removing one
 * breaks a consumer. Treat this file as the API.
 *
 * Deliberately NOT exported: anything from `urlstate.ts` — localStorage and the
 * URL hash are this app's own concerns and a host application has its own — and
 * everything under `components/`, which is React.
 */

export {
  compensate, pickReference, resolvePitch,
  SQUARE_PIXEL_TOLERANCE, DRIFT_WARN_PX,
} from './pitch.ts'

export {
  footprint, awjPath, awjCommitPath,
  PITCH_SCALE, PITCH_MIN, PITCH_MAX, PITCH_UNITY, PITCH_STEP_DISPLAYED,
  PITCHED_MAX, RANGE_IS_REJECTED, FIELD_LABELS, UI_LOCATION,
} from './device.ts'

export { instructions, walkthrough, awjFrames, csv } from './awj.ts'

export type {
  Arrangement, AxisResult, GroupResult, OutputGroup, PitchEntry, Project,
  ResolvedPitch, Result, Warning, WarningCode, WarningLevel,
} from './types.ts'

export type { AwjFrame, Instruction } from './awj.ts'
