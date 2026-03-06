import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import styles from "./button.module.scss";

type ButtonVariant = "primary" | "ghost";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    isActive?: boolean;
  }
>;

export default function Button({
  children,
  variant = "primary",
  isActive = false,
  ...props
}: ButtonProps) {
  const className = [
    styles.button,
    styles[variant],
    isActive ? styles.active : "",
    props.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button {...props} className={className}>
      {children}
    </button>
  );
}
