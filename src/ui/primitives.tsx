import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatusTone = 'neutral' | 'positive' | 'warning' | 'danger';
type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface BrandReadingProgress {
  effectiveWords: number;
  thresholdWords: number;
  completed?: boolean;
}

export interface BrandLockupProps {
  compact?: boolean;
  progress?: BrandReadingProgress;
  progressStatus?: 'loading' | 'unavailable';
}

const YUEL_LOGO_PATHS = [
  'M 273.5 230 L 483 303.5 C 506 311.5 530.5 327 552 349 C 572.5 370 590 395 599.5 419.5 L 509 596 C 466 580.5 426.5 568 397.5 554 C 363.5 537.5 339 508.5 328 471.5 L 263.5 239.5 C 260.8 231.2 265 227.2 273.5 230 Z',
  'M 980 230 C 988.5 227.8 993.8 232.8 991 241.8 L 925 470 C 916.2 501 899 527.2 875.5 546 C 853 564 827 574.8 798 585 L 714 614.8 C 643 640 584.5 692 531.5 770 C 528.5 709.5 534.5 666.5 548 626 C 559.5 591.5 577.8 555 596 519.5 L 642.5 435.5 C 672 381.5 706.5 328 768.5 304 L 980 230 Z',
  'M 724 655 L 724 873.5 C 724 908.5 704.2 941 670 961.5 L 546 1022.5 C 536 1027 530 1020.8 530 1009.5 L 530 929 C 530 854.5 562.5 778.5 618 728 C 651 698 684 674 715.5 657 C 720 654.5 723 653.8 724 655 Z',
] as const;

type BrandProgressState = 'loading' | 'unavailable' | 'progress' | 'complete';
type BrandMarkStyle = CSSProperties & { '--y-brand-progress': string };

function LogoLayer({ className, outline = false }: { className: string; outline?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="177 177 900 900"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        fill={outline ? 'none' : 'currentColor'}
        stroke={outline ? 'currentColor' : 'none'}
        strokeLinejoin="round"
        strokeWidth={outline ? 16 : undefined}
        shapeRendering="geometricPrecision"
      >
        {YUEL_LOGO_PATHS.map((path) => <path key={path} d={path} />)}
      </g>
    </svg>
  );
}

function normalizeProgress(progress: BrandReadingProgress | undefined, fallback: BrandProgressState) {
  if (!progress) {
    return {
      ariaValueMax: undefined,
      ariaValueNow: undefined,
      description: fallback === 'unavailable' ? '今日阅读进度暂不可用' : '正在读取今日阅读进度',
      percentage: 0,
      state: fallback,
    };
  }

  const effectiveWords = Number.isFinite(progress.effectiveWords)
    ? Math.max(0, Math.floor(progress.effectiveWords))
    : 0;
  const thresholdWords = Number.isFinite(progress.thresholdWords) && progress.thresholdWords > 0
    ? Math.floor(progress.thresholdWords)
    : 1;
  const completed = progress.completed === true || effectiveWords >= thresholdWords;
  const percentage = completed
    ? 100
    : Math.round(Math.min(1, effectiveWords / thresholdWords) * 1000) / 10;

  return {
    ariaValueMax: thresholdWords,
    ariaValueNow: Math.min(effectiveWords, thresholdWords),
    description: completed
      ? `今日已完成打卡，共 ${effectiveWords.toLocaleString('zh-CN')} 个有效词`
      : `今日阅读进度 ${Math.round(percentage)}%，${effectiveWords.toLocaleString('zh-CN')} / ${thresholdWords.toLocaleString('zh-CN')} 个有效词`,
    percentage,
    state: completed ? 'complete' : 'progress',
  } satisfies {
    ariaValueMax: number;
    ariaValueNow: number;
    description: string;
    percentage: number;
    state: BrandProgressState;
  };
}

export function BrandLockup({ compact = false, progress, progressStatus = 'loading' }: BrandLockupProps) {
  const normalized = normalizeProgress(progress, progressStatus);
  const markStyle: BrandMarkStyle = { '--y-brand-progress': `${normalized.percentage}%` };

  return (
    <div
      className={`yuel-brand ${compact ? 'yuel-brand--compact' : ''}`}
      role="progressbar"
      aria-label="阅量 Yuel 今日阅读进度"
      aria-valuemin={0}
      aria-valuemax={normalized.ariaValueMax}
      aria-valuenow={normalized.ariaValueNow}
      aria-valuetext={normalized.description}
      title={normalized.description}
    >
      <span
        className="yuel-brand__mark"
        data-progress={normalized.percentage}
        data-state={normalized.state}
        style={markStyle}
        aria-hidden="true"
      >
        <LogoLayer className="yuel-brand__mark-layer yuel-brand__mark-layer--base" />
        <LogoLayer className="yuel-brand__mark-layer yuel-brand__mark-layer--fill" />
        <LogoLayer className="yuel-brand__mark-layer yuel-brand__mark-layer--celebration" outline />
      </span>
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

export interface SwitchControlProps {
  id: string;
  checked: boolean;
  label: string;
  status: ReactNode;
  busy?: boolean;
  className?: string;
  describedBy?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function SwitchControl({
  id,
  checked,
  label,
  status,
  busy = false,
  className = '',
  describedBy,
  disabled = false,
  onChange,
}: SwitchControlProps) {
  return (
    <label
      className={`yuel-switch ${className}`.trim()}
      htmlFor={id}
      data-busy={busy ? 'true' : undefined}
    >
      <span className="yuel-switch__status" aria-live="polite">{status}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-describedby={describedBy}
        aria-busy={busy || undefined}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="yuel-switch__track" aria-hidden="true">
        <span className="yuel-switch__thumb" />
      </span>
    </label>
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
      <span className="yuel-progress__bar" style={{ transform: `scaleX(${percentage / 100})` }} />
    </div>
  );
}

export function InlineNotice({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
  const isDanger = tone === 'danger';

  return (
    <p
      className={`yuel-notice yuel-notice--${tone}`}
      role={isDanger ? 'alert' : 'status'}
      aria-live={isDanger ? undefined : 'polite'}
    >
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="yuel-empty">{children}</div>;
}
