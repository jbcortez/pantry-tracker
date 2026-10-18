import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react'
import type { Undo } from '../lib/store'

interface ToastData {
  id: number
  message: ReactNode
  undo?: Undo
  tone?: 'ok' | 'warn'
}

const ToastContext = createContext<(t: Omit<ToastData, 'id'>) => void>(() => {})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const seq = useRef(0)

  const show = useCallback((t: Omit<ToastData, 'id'>) => {
    clearTimeout(timer.current)
    const id = ++seq.current
    setToast({ ...t, id })
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), t.undo ? 6000 : 3000)
  }, [])

  const undo = async () => {
    if (!toast?.undo) return
    const fn = toast.undo
    setToast(null)
    await fn()
    show({ message: 'Undone' })
  }

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div
            key={toast.id}
            role="status"
            className={`animate-fade pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm text-white shadow-lg ${
              toast.tone === 'warn' ? 'bg-amber-700' : 'bg-stone-900'
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            {toast.undo && (
              <button type="button" onClick={undo} className="font-semibold text-brand-100 uppercase">
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
