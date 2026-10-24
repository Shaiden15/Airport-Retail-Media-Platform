import type { ReactNode } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';

export function Card({ title, actions, children, className = '', testId }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={`rounded-xl border border-muted/20 bg-surface p-4 shadow-sm ${className}`} data-testid={testId}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone = 'default', testId }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad'; testId?: string }) {
  const ring = tone === 'good' ? 'border-emerald-500/40' : tone === 'warn' ? 'border-amber-500/50' : tone === 'bad' ? 'border-red-500/50' : 'border-muted/20';
  return (
    <div className={`rounded-xl border ${ring} bg-surface p-4`}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" data-testid={testId}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

const BADGE_TONES: Readonly<Record<string, string>> = {
  neutral: 'bg-muted/15 text-fg',
  good: 'bg-emerald-500/15 text-emerald-600',
  warn: 'bg-amber-500/20 text-amber-600',
  bad: 'bg-red-500/15 text-red-600',
  info: 'bg-sky-500/15 text-sky-600',
  accent: 'bg-primary/15 text-primary',
};

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent'; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${new Map(Object.entries(BADGE_TONES)).get(tone) ?? ''}`}>{children}</span>;
}

export function Button({ children, onClick, variant = 'secondary', type = 'button', disabled, testId }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; type?: 'button' | 'submit'; disabled?: boolean; testId?: string }) {
  const style =
    variant === 'primary'
      ? 'bg-primary text-bg hover:opacity-90'
      : variant === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : variant === 'ghost'
          ? 'text-primary hover:bg-primary/10'
          : 'border border-muted/30 bg-surface hover:bg-primary/10';
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${style}`} data-testid={testId}>
      {children}
    </button>
  );
}

const fieldClass = 'w-full rounded-md border border-muted/30 bg-surface px-2 py-1.5 text-sm';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, label, placeholder, maxLength, testId }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; maxLength?: number; testId?: string }) {
  return <input className={fieldClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={placeholder} maxLength={maxLength} data-testid={testId} />;
}

export function NumberInput({ value, onChange, label, min, max, step, testId }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number; testId?: string }) {
  return <input className={fieldClass} type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-testid={testId} />;
}

export function Select({ value, onChange, label, options, testId }: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[]; testId?: string }) {
  return (
    <select className={fieldClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      {label}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-label={title}>
      <div className={`max-h-[90vh] w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-muted/10" aria-label="Close">
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Sub-page tabs for a role; keeps the selected company in the query string
export function SubNav({ items }: { items: { to: string; label: string; end?: boolean }[] }) {
  const [params] = useSearchParams();
  const company = params.get('company');
  return (
    <nav className="flex flex-wrap gap-1 border-b border-muted/20 px-6" aria-label="Sections">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={company ? `${item.to}?company=${encodeURIComponent(company)}` : item.to}
          end={item.end}
          className={({ isActive }) => `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg'}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-muted/40 p-4 text-center text-sm text-muted">{children}</p>;
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export const table = {
  wrap: 'w-full overflow-x-auto',
  table: 'w-full text-sm',
  th: 'whitespace-nowrap px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted',
  thRight: 'whitespace-nowrap px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted',
  td: 'border-t border-muted/10 px-2 py-2 align-top',
  tdRight: 'border-t border-muted/10 px-2 py-2 text-right tabular-nums align-top',
};
