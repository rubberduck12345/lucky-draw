// 표시용 포매팅 헬퍼. 순수 함수.

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// 당첨자 명단 CSV — FR-7.3 (선택 구현). 참가자, 경품, 시각.
export interface CsvRow {
  round: number;
  participantLabel: string;
  prizeName: string | null;
  timestamp: number;
}

export function resultsToCsv(rows: readonly CsvRow[]): string {
  const header = ["라운드", "참가자", "경품", "시각"];
  const escape = (v: string): string =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        String(r.round),
        escape(r.participantLabel),
        escape(r.prizeName ?? "꽝"),
        formatTime(r.timestamp),
      ].join(","),
    );
  }
  return lines.join("\n");
}
