export const formatRs = (n) =>
  `${n < 0 ? "-" : ""}Rs. ${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

export const formatNumber = (n) => Math.round(n).toLocaleString("en-US");

// % change vs the previous period. Returns null when there is nothing to compare with.
export const pctChange = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
};
