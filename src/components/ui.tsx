'use client';

import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'sunset';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-deep text-white hover:bg-deep-700',
  secondary: 'bg-white text-deep border border-line hover:bg-sand-50',
  ghost: 'bg-transparent text-deep hover:bg-deep-50',
  danger: 'bg-danger text-white hover:bg-red-800',
  sunset: 'bg-clay-strong text-white hover:bg-clay',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'min-h-11 px-5 py-2 text-[15px]' : 'min-h-9 px-3.5 py-1.5 text-sm',
        buttonStyles[variant],
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx('rounded-lg border border-line bg-white p-5 shadow-card', className)} />;
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'demo' | 'ai';

const toneStyles: Record<Tone, string> = {
  neutral: 'bg-sand text-slate',
  ok: 'bg-green-100 text-green-900',
  warn: 'bg-amber-100 text-amber-900',
  danger: 'bg-red-100 text-red-900',
  info: 'bg-blue-100 text-blue-900',
  demo: 'bg-deep-50 text-deep',
  ai: 'bg-violet-100 text-violet-900',
};

export function Badge({ tone = 'neutral', className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span {...props} className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', toneStyles[tone], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-slate">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const fieldBase =
  'block w-full rounded-md border border-slate/40 bg-white px-3 py-2.5 text-base text-ink placeholder:text-muted min-h-11 focus-visible:border-deep';

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string | null; children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => React.ReactNode; id?: string }) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="text-sm font-semibold text-slate">
        {label}
      </label>
      {children({ id: fieldId, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) => <input {...props} className={clsx(fieldBase, className)} />;
export const Select = ({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={clsx(fieldBase, className)} />;
export const Textarea = ({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={clsx(fieldBase, 'min-h-28', className)} />;

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx('m-auto w-[calc(100%-24px)] rounded-xl p-0 shadow-2xl backdrop:bg-deep/50', wide ? 'max-w-3xl' : 'max-w-lg')}
    >
      {open && (
        <div className="max-h-[88vh] overflow-y-auto p-5 md:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-xl font-bold">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Schließen" className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-sand">
              <X size={20} aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = 'Bestätigen',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <p className="text-slate">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button variant={tone} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export function Accordion({ title, summary, defaultOpen, children, id }: { title: React.ReactNode; summary?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode; id?: string }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const panelId = useId();
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white shadow-card" id={id}>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-3 px-5 py-4 text-left">
        <span className="min-w-0 flex-1">{title}</span>
        {summary}
        <ChevronDown aria-hidden size={20} className={clsx('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <div id={panelId} hidden={!open} className="border-t border-line px-5 py-5">
        {open && children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-lg border-2 border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <div className="mb-3 grid size-14 place-items-center rounded-full bg-sand text-deep" aria-hidden>
        {icon}
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-1 max-w-md text-slate">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'ok' | 'danger'; title?: string; children: React.ReactNode }) {
  const styles = { info: 'border-blue-300 bg-blue-50 text-blue-950', warn: 'border-amber-300 bg-amber-50 text-amber-950', ok: 'border-green-300 bg-green-50 text-green-950', danger: 'border-red-300 bg-red-50 text-red-950' };
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-md border p-3 text-sm', styles[tone])}>
      <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-bold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('skeleton', className)} />;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} className="h-2 w-full overflow-hidden rounded-full bg-sand">
      <div className="h-full rounded-full bg-deep transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function Chip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx('inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors', active ? 'border-deep bg-deep text-white' : 'border-line bg-white text-slate hover:bg-sand-50')}
    >
      {children}
      {count !== undefined && <span className={clsx('rounded-full px-1.5 text-xs', active ? 'bg-white/20' : 'bg-sand')}>{count}</span>}
    </button>
  );
}
