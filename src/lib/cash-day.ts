/** True when a cash session was opened before the start of the local day `now`. */
export function isFromPreviousDay(openedAt: string | Date, now: Date = new Date()): boolean {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(openedAt).getTime() < start.getTime();
}
