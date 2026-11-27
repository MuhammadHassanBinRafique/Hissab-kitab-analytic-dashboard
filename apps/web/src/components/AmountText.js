import Money from "./Money";

// The server sends text as parts: plain strings and { amount } objects. Amounts go through <Money>,
// so the "Hide amounts" switch (on by default) covers them like everywhere else.
export default function AmountText({ parts }) {
  return parts.map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <Money key={i} value={p.amount} />));
}
