import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type StatusTone = 'neutral' | 'positive' | 'warning' | 'danger';
type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`yuel-brand ${compact ? 'yuel-brand--compact' : ''}`} aria-label="阅量 Yuel">
      <span className="yuel-brand__mark" aria-hidden="true">阅</span>
      <span className="yuel-brand__name">阅量 <span>Yuel</span></span>
    </div>
  );
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
  return (
    <span className={`yuel-status yuel-status--${tone}`} role="status" aria-live="polite">
      <span className="yuel-status__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: LucideIcon;
  variant?: ButtonVariant;
}

export function ActionButton({ children, className = '', icon: Icon, variant = 'secondary', ...props }: ActionButtonProps) {
  return (
    <button className={`yuel-button yuel-button--${variant} ${className}`.trim()} {...props}>
      {Icon ? <Icon className="yuel-button__icon" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function Metric({ icon: Icon, label, value }: { icon?: LucideIcon; label: string; value: string }) {
  return (
    <div className="yuel-metric">
      <div className="yuel-metric__label">
        {Icon ? <Icon aria-hidden="true" /> : null}
        <span>{label}</span>
      </div>
      <strong className="yuel-metric__value">{value}</strong>
    </div>
  );
}

export function SectionHeader({
  children,
  icon: Icon,
  meta,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  meta?: ReactNode;
}) {
  return (
    <div className="yuel-section-heading">
      <div className="yuel-section-heading__title">
        {Icon ? <Icon aria-hidden="true" /> : null}
        <h2>{children}</h2>
      </div>
      {meta ? <div className="yuel-section-heading__meta">{meta}</div> : null}
    </div>
  );
}

export function ProgressBar({
  label,
  max,
  value,
  valueText,
}: {
  label: string;
  max: number;
  value: number;
  valueText?: string;
}) {
  const safeMax = Math.max(1, max);
  const safeValue = Math.min(safeMax, Math.max(0, value));
  const percentage = Math.round((safeValue / safeMax) * 100);

  return (
    <div
      className="yuel-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      aria-valuetext={valueText ?? `${percentage}%`}
    >
      <span className="yuel-progress__bar" style={{ width: `${percentage}%` }} />
    </div>
  );
}

export function InlineNotice({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
  return (
    <p className={`yuel-notice yuel-notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'} aria-live="polite">
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="yuel-empty" role="status">{children}</div>;
}
