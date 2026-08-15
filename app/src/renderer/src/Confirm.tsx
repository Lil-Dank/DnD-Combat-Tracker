import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

type ConfirmFn = (message: string, confirmLabel?: string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

/** In-app replacement for window.confirm(), styled like the other modals. */
export function ConfirmProvider({
  children,
  cancelLabel = 'Cancel',
}: {
  children: ReactNode;
  /** Supplied by App so the dialog follows the chosen language. */
  cancelLabel?: string;
}) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const requestRef = useRef<ConfirmRequest | null>(null);

  const confirm = useCallback<ConfirmFn>((message, confirmLabel = 'Confirm') => {
    return new Promise<boolean>((resolve) => {
      // If something asks while a dialog is already open, cancel the old one.
      requestRef.current?.resolve(false);
      const req = { message, confirmLabel, resolve };
      requestRef.current = req;
      setRequest(req);
    });
  }, []);

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    requestRef.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div className="modal-backdrop" onClick={() => answer(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-message">{request.message}</p>
            <div className="modal-actions">
              <button className="btn" autoFocus onClick={() => answer(false)}>
                {cancelLabel}
              </button>
              <button className="btn danger" onClick={() => answer(true)}>
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}
