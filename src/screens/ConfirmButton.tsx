import { useState } from 'react';

interface Props {
  label: string;
  /** The question shown in place of the button, e.g. "Lose your progress?" */
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}

/** A button that asks once, in place, before doing something that cannot be undone. */
export function ConfirmButton({ label, question, confirmLabel, onConfirm, className = 'ghost-button' }: Props) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm" role="group" aria-label={question}>
      <span className="confirm-question">{question}</span>
      <button type="button" className="danger-button" onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button type="button" className="ghost-button" onClick={() => setAsking(false)} autoFocus>
        Cancel
      </button>
    </span>
  );
}
