import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import Modal from '../components/Modal'

type DialogKind = 'alert' | 'confirm' | 'prompt'

type DialogRequest = {
  kind: DialogKind
  title: string
  message: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
}

type DialogResult = boolean | string | null

type DialogController = {
  alert: (message: string, options?: { title?: string; confirmLabel?: string }) => Promise<void>
  confirm: (message: string, options?: { title?: string; confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>
  prompt: (
    message: string,
    options?: { title?: string; defaultValue?: string; confirmLabel?: string; cancelLabel?: string }
  ) => Promise<string | null>
}

const AppDialogContext = createContext<DialogController | null>(null)

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const resolverRef = useRef<((value: DialogResult) => void) | null>(null)

  const closeWith = useCallback((value: DialogResult) => {
    const resolver = resolverRef.current
    resolverRef.current = null
    setRequest(null)
    if (resolver) resolver(value)
  }, [])

  const openDialog = useCallback(
    (next: DialogRequest): Promise<DialogResult> =>
      new Promise((resolve) => {
        resolverRef.current = resolve
        setPromptValue(next.defaultValue ?? '')
        setRequest(next)
      }),
    []
  )

  const api = useMemo<DialogController>(
    () => ({
      alert: async (message, options) => {
        await openDialog({
          kind: 'alert',
          title: options?.title || 'Information',
          message,
          confirmLabel: options?.confirmLabel || 'OK',
        })
      },
      confirm: async (message, options) => {
        const result = await openDialog({
          kind: 'confirm',
          title: options?.title || 'Confirmation',
          message,
          confirmLabel: options?.confirmLabel || 'Confirmer',
          cancelLabel: options?.cancelLabel || 'Annuler',
        })
        return result === true
      },
      prompt: async (message, options) => {
        const result = await openDialog({
          kind: 'prompt',
          title: options?.title || 'Saisie requise',
          message,
          defaultValue: options?.defaultValue,
          confirmLabel: options?.confirmLabel || 'Valider',
          cancelLabel: options?.cancelLabel || 'Annuler',
        })
        return typeof result === 'string' ? result : null
      },
    }),
    [openDialog]
  )

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      <Modal
        isOpen={!!request}
        onClose={() => closeWith(request?.kind === 'alert' ? true : null)}
        title={request?.title || ''}
        maxWidthClassName="max-w-lg"
      >
        {request && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{request.message}</p>
            {request.kind === 'prompt' && (
              <input
                autoFocus
                type="text"
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    closeWith(promptValue)
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
              />
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
              {request.kind !== 'alert' && (
                <button
                  type="button"
                  onClick={() => closeWith(null)}
                  className="px-3 py-2 text-sm bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                >
                  {request.cancelLabel || 'Annuler'}
                </button>
              )}
              <button
                type="button"
                onClick={() => closeWith(request.kind === 'prompt' ? promptValue : true)}
                className="px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                {request.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppDialogContext.Provider>
  )
}

export function useAppDialog(): DialogController {
  const ctx = useContext(AppDialogContext)
  if (!ctx) throw new Error('useAppDialog must be used within AppDialogProvider')
  return ctx
}
