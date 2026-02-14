import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'icon';
export type ButtonIconPosition = 'start' | 'end';
export type ButtonState = 'default' | 'hover' | 'active' | 'focus' | 'disabled' | 'loading';

const RIPPLE_DURATION_MS = 300;

interface ButtonBaseProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: ButtonIconPosition;
  ripple?: boolean;
}

type StandardButtonProps = ButtonBaseProps & {
  variant?: Exclude<ButtonVariant, 'icon'>;
  children: React.ReactNode;
};

type IconButtonProps = ButtonBaseProps & {
  variant: 'icon';
  children?: React.ReactNode;
  'aria-label': string;
};

interface RippleData {
  id: number;
  x: number;
  y: number;
  size: number;
}

export type ButtonProps = StandardButtonProps | IconButtonProps;

function classList(values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function useReducedMotionPreference(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const onChange = (event: MediaQueryListEvent): void => {
      setPrefersReducedMotion(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
      return () => mediaQuery.removeEventListener('change', onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  return prefersReducedMotion;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    loading = false,
    ripple = true,
    icon,
    iconPosition = 'start',
    children,
    className,
    disabled,
    type = 'button',
    onClick,
    ...rest
  },
  ref,
) {
  const isDisabled = Boolean(disabled || loading);
  const hasText = React.Children.count(children) > 0;
  const prefersReducedMotion = useReducedMotionPreference();
  const [ripples, setRipples] = React.useState<RippleData[]>([]);
  const nextRippleIdRef = React.useRef(1);
  const cleanupTimersRef = React.useRef<number[]>([]);
  const variantClass = `wg-btn--${variant}`;

  React.useEffect(
    () => () => {
      cleanupTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      cleanupTimersRef.current = [];
    },
    [],
  );

  const createRipple = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!ripple || isDisabled || prefersReducedMotion) {
        return;
      }

      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const fallbackX = rect.width / 2;
      const fallbackY = rect.height / 2;
      const isKeyboardClick = event.detail === 0;
      const x = isKeyboardClick ? fallbackX : event.clientX - rect.left;
      const y = isKeyboardClick ? fallbackY : event.clientY - rect.top;
      const size = Math.max(rect.width, rect.height) * 2;
      const rippleId = nextRippleIdRef.current++;

      setRipples((currentRipples) => [...currentRipples, { id: rippleId, x, y, size }]);

      const timerId = window.setTimeout(() => {
        setRipples((currentRipples) => currentRipples.filter((entry) => entry.id !== rippleId));
      }, RIPPLE_DURATION_MS);
      cleanupTimersRef.current.push(timerId);
    },
    [isDisabled, prefersReducedMotion, ripple],
  );

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      createRipple(event);
      onClick?.(event);
    },
    [createRipple, onClick],
  );

  const body = loading ? (
    <>
      <span className="wg-btn__spinner" aria-hidden="true" />
      {hasText ? <span className="sr-only">{children}</span> : null}
    </>
  ) : (
    <span className="wg-btn__content">
      {icon && iconPosition === 'start' ? icon : null}
      {hasText ? <span>{children}</span> : null}
      {icon && iconPosition === 'end' ? icon : null}
    </span>
  );

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classList(['wg-btn', variantClass, loading && 'wg-btn--loading', className])}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      onClick={handleClick}
    >
      {ripples.map((rippleData) => (
        <span
          key={rippleData.id}
          className="wg-btn__ripple"
          style={
            {
              '--wg-ripple-x': `${rippleData.x}px`,
              '--wg-ripple-y': `${rippleData.y}px`,
              '--wg-ripple-size': `${rippleData.size}px`,
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
      ))}
      {body}
    </button>
  );
});

export default Button;
