// Exact money arithmetic in whole paisa (same approach as the portal's lib/money.ts).
export const sumMoney = (amounts: Iterable<number>): number => {
  let paisa = 0;
  for (const a of amounts) paisa += Math.round(a * 100);
  return paisa / 100;
};
