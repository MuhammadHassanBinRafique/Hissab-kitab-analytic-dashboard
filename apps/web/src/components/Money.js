import { createContext, useContext, useState } from "react";
import { formatRs } from "../utils/format";

const PrivacyContext = createContext({ hidden: false, toggle() {} });

// One switch hides every amount, like the eye icons in the Hisab-Kitab portal.
export function PrivacyProvider({ children }) {
  const [hidden, setHidden] = useState(true);
  return <PrivacyContext.Provider value={{ hidden, toggle: () => setHidden((h) => !h) }}>{children}</PrivacyContext.Provider>;
}
export const usePrivacy = () => useContext(PrivacyContext);

export default function Money({ value, className = "" }) {
  const { hidden } = usePrivacy();
  return <span className={`money ${className}`}>{hidden ? "Rs. ****" : formatRs(value)}</span>;
}
