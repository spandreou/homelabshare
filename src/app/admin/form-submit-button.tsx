"use client";

import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
};

export function FormSubmitButton({ idleLabel, pendingLabel, className, disabled = false }: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`${className} transition duration-200 active:scale-[0.98]`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
