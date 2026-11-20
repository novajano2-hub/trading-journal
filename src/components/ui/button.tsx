'use client';

// Adapted from HorizonX animated-button-press, commercial licence.
import { useState, type ComponentProps, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASING_POINTS, press } from '@/lib/motion';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

const SIZE: Record<ButtonSize, string> = {
  md: 'h-11',
  sm: 'h-[38px]',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-surface-1 text-text border border-line-2 hover:border-faint',
  ghost: 'bg-transparent text-text hover:bg-sunken',
};

type Props = Omit<ComponentProps<typeof motion.button>, 'ref' | 'children'> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** 40px button (44 on touch), 10px radius, pressed state with a soft ripple. */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  disabled,
  onClick,
  onPointerDown,
  children,
  ...props
}: Props) {
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [burst, setBurst] = useState(0);
  const release = () => setPressed(false);

  return (
    <motion.button
      {...props}
      type={type}
      disabled={disabled}
      className={`relative inline-flex ${SIZE[size]} select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-control px-[18px] text-[15px] font-medium transition-colors duration-120 disabled:opacity-50 ${VARIANT[variant]} ${className}`}
      animate={{ scale: pressed && !reduced ? press.scale : 1 }}
      transition={{
        duration: reduced ? 0 : pressed ? press.down : press.up,
        ease: [...EASING_POINTS.out],
      }}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        if (e.button !== 0 || disabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        setOrigin({
          x: ((e.clientX - r.left) / r.width) * 100,
          y: ((e.clientY - r.top) / r.height) * 100,
        });
        setPressed(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onBlur={release}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
          setOrigin({ x: 50, y: 50 });
          setPressed(true);
        }
      }}
      onKeyUp={release}
      onClick={(e) => {
        setBurst((n) => n + 1);
        onClick?.(e);
      }}
    >
      {burst > 0 && !reduced && (
        <motion.span
          key={burst}
          aria-hidden="true"
          className="pointer-events-none absolute h-40 w-40 rounded-full bg-current"
          style={{
            left: `${origin.x}%`,
            top: `${origin.y}%`,
            marginLeft: -80,
            marginTop: -80,
          }}
          initial={{ scale: 0, opacity: 0.16 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 0.22, ease: [...EASING_POINTS.out] }}
        />
      )}
      <span className="relative inline-flex items-center gap-2">
        {children}
      </span>
    </motion.button>
  );
}
