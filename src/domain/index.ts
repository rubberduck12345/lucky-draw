// 도메인 공개 API. UI는 이 모듈만 import 한다.
export * from "./types.ts";
export { createRng, shuffle, type Rng } from "./rng.ts";
export {
  parseParticipantsFromNames,
  parseParticipantsFromCount,
  parsePrizes,
  type ParseParticipantsResult,
} from "./input.ts";
export {
  buildSlots,
  isWheelExhausted,
  pickSpinOutcome,
  assertSlotInvariant,
  type SpinOutcome,
} from "./wheel.ts";
export {
  startDrawing,
  startDrawingLive,
  assignNextParticipant,
  selectParticipant,
  beginSpin,
  resolveSpin,
  nextRound,
  checkFinished,
  canSpin,
  reset,
  recoverFromReload,
  eligibleParticipants,
  remainingPrizeCount,
  type InitOptions,
  type BeginSpinResult,
} from "./draw.ts";
