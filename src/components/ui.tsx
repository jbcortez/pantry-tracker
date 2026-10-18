import { type ButtonHTMLAttributes, type ReactNode, useEffect } from 'react'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white active:bg-brand-700 disabled:bg-stone-300',
  secondary: 'bg-white text-stone-800 border border-stone-200 active:bg-stone-100',
  ghost: 'text-stone-700 active:bg-stone-100',
  danger: 'bg-white text-red-600 border border-red-200 active:bg-red-50',
  accent: 'bg-amber-50 text-amber-900 border border-amber-300 active:bg-amber-100',
}

export function Button({
  variant = 'secondary',
  big,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'rounded-xl font-medium transition-colors disabled:opacity-60',
        big ? 'px-4 py-4 text-lg' : 'px-3.5 py-2.5 text-sm',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('flex rounded-xl bg-stone-200/70 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors',
            o.value === value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-sheet safe-bottom relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-5 pt-4 pb-2">
          <div className="text-lg font-semibold">{title}</div>
          <button type="button" onClick={onClose} className="-mr-2 rounded-full p-2 text-stone-500" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  )
}

/** A labelled input. Use `group` for button sets (segmented controls, steppers), which can't sit inside a <label>. */
export function Field({ label, children, hint, group }: { label: string; children: ReactNode; hint?: ReactNode; group?: boolean }) {
  const content = (
    <>
      <span className="mb-1 block text-xs font-semibold tracking-wide text-stone-500 uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </>
  )
  return group ? (
    <div role="group" aria-label={label} className="block">
      {content}
    </div>
  ) : (
    <label className="block">{content}</label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="flex items-center gap-3">
      <Button className="h-11 w-11 text-xl" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Fewer">
        −
      </Button>
      <span className="min-w-8 text-center text-xl font-semibold tabular-nums">{value}</span>
      <Button className="h-11 w-11 text-xl" onClick={() => onChange(value + 1)} aria-label="More">
        +
      </Button>
    </div>
  )
}
