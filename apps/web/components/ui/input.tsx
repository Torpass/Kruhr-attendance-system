import { useId, type InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Input({ label, className = "", ...props }: InputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="rotulo text-gris">
        {label}
      </label>
      <input
        id={id}
        className={`rounded-lg border border-borde-fuerte bg-white px-3.5 py-2.5 text-sm text-grafito outline-none transition-colors placeholder:text-gris-claro focus:border-kru-500 focus:ring-4 focus:ring-kru-100 ${className}`}
        {...props}
      />
    </div>
  );
}
