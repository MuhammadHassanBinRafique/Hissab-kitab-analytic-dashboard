const currentMonth = () => new Date().toISOString().slice(0, 7);

export function MonthPicker({ month, onChange }) {
  return <input className="field month-picker" type="month" value={month} max={currentMonth()} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Month" />;
}

// Small label + serif title + one plain sentence saying what the page is for.
export default function PageHeader({ eyebrow, title, hint, children }) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-h1">{title}</h1>
        {hint && <p className="page-hint">{hint}</p>}
      </div>
      {children && <div className="page-tools">{children}</div>}
    </div>
  );
}
