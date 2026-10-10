import { useEffect, useId, useRef } from 'react';
import './ConfirmDialog.css';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel: string;
}

interface Props extends ConfirmationOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    cancelButton.current?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={messageId}>{message}</p>
      <div className="confirm-dialog-actions">
        <button type="button" className="danger-button" onClick={onConfirm}>{confirmLabel}</button>
        <button ref={cancelButton} type="button" className="secondary-button" onClick={onCancel}>No, volver</button>
      </div>
    </dialog>
  );
}
