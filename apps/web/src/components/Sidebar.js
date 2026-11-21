import Logo from "./Logo";

const MAIN_APP_URL = process.env.REACT_APP_MAIN_APP_URL;

export default function Sidebar({ pages, current, onNavigate, isOpen, onClose }) {
  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? "visible" : ""}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-inner">
          <Logo />
          <nav>
            <ul>
              {pages.map((p) => (
                <li key={p.id} className={p.id === current ? "active" : ""} onClick={() => onNavigate(p.id)}>
                  <i className={`fas ${p.icon}`}></i> {p.label}
                </li>
              ))}
            </ul>
            {MAIN_APP_URL && (
              <ul>
                <li><a href={MAIN_APP_URL}><i className="fas fa-arrow-up-right-from-square"></i> Open Hisab-Kitab</a></li>
              </ul>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}
