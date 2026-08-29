// 데이터 모델 — Requirement.md 5장.

export type ParticipantId = string;
export type PrizeId = string;

export type ParticipantStatus = "eligible" | "won" | "out";

export interface Participant {
  id: ParticipantId;
  label: string; // 표시값(이름 또는 번호)
  status: ParticipantStatus;
}

export interface Prize {
  id: PrizeId;
  name: string;
  consumed: boolean; // 소진(당첨) 여부
}

export type WheelSlotKind = "prize" | "miss";

export interface WheelSlot {
  kind: WheelSlotKind;
  prizeId: PrizeId | null; // miss면 null
}

export interface DrawResult {
  round: number;
  participantId: ParticipantId;
  participantLabel: string;
  prizeId: PrizeId | null; // null = 꽝
  prizeName: string | null;
  timestamp: number;
}

export type Phase = "setup" | "drawing" | "finished";

export interface AppState {
  phase: Phase;
  participants: Participant[];
  prizes: Prize[];
  slots: WheelSlot[]; // 남은 경품 + 꽝 1
  results: DrawResult[];
  currentParticipantId: ParticipantId | null;
  isSpinning: boolean;
  missOnceMode: boolean; // 꽝도 1회만 모드
  round: number; // 완료된 라운드 수
}
