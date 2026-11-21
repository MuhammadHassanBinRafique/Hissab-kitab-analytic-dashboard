import { BookOpenText } from "lucide-react"; // the same icon the Hisab-Kitab portal uses

export default function Logo() {
  return (
    <div className="logo">
      <BookOpenText className="logo-icon" strokeWidth={1.75} aria-hidden="true" />
      <span className="logo-text">Hisab-Kitab</span>
    </div>
  );
}
