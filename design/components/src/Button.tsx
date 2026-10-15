import * as React from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  icon?: IconName;
  trailingIcon?: IconName;
  /** Square/round button showing only `icon`. Pass `aria-label`. */
  iconOnly?: boolean;
}

/** Pill-shaped buttons in four tones; one primary per view. */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  iconOnly = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconSize = size === 'sm' ? 15 : 17;
  return (
    <button
      {...rest}
      type={type}
      className={cx('lt-btn', `lt-btn-${variant}`, size === 'sm' && 'lt-btn-sm', iconOnly && 'lt-btn-icon', className)}
    >
      {icon && <Icon name={icon} size={iconSize} strokeWidth={variant === 'primary' ? 2.4 : 2.2} />}
      {!iconOnly && children}
      {trailingIcon && !iconOnly && <Icon name={trailingIcon} size={15} strokeWidth={2.2} />}
    </button>
  );
}
