import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "bg-kru-600 text-white hover:bg-kru-800 disabled:bg-kru-300 shadow-kru",
  secondary:
    "border border-borde-fuerte bg-white text-grafito hover:border-kru-300 hover:text-kru-700",
} as const;

const sizes = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-4 text-base",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
