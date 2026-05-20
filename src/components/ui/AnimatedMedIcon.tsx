// Floating animated medical icon — shown in page hero sections when hospital/vet theme is active.

import type { LucideIcon } from 'lucide-react';
import { useAppTheme } from '@/hooks/useAppTheme';

export type MedAnimation =
  | 'heartbeat'   // scale pulse
  | 'float'       // gentle up-down
  | 'spin-slow'   // slow clockwise
  | 'ping'        // expanding ring
  | 'bounce';     // vertical bounce

interface AnimatedMedIconProps {
  /** Icon to display in hospital theme */
  hospitalIcon: LucideIcon;
  /** Icon to display in vet theme (optional, falls back to hospitalIcon) */
  vetIcon?: LucideIcon;
  animation?: MedAnimation;
  /** Tailwind color class applied to the icon wrapper, e.g. "text-rose-400" */
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE: Record<NonNullable<AnimatedMedIconProps['size']>, string> = {
  sm: 'h-8 w-8 p-1.5',
  md: 'h-12 w-12 p-2.5',
  lg: 'h-16 w-16 p-3.5',
};

const ICON_SIZE: Record<NonNullable<AnimatedMedIconProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function AnimatedMedIcon({
  hospitalIcon: HospitalIcon,
  vetIcon: VetIcon,
  animation = 'float',
  color = 'text-blue-400',
  size = 'md',
  className = '',
}: AnimatedMedIconProps) {
  const [theme] = useAppTheme();
  const Icon = theme === 'vet' && VetIcon ? VetIcon : HospitalIcon;

  return (
    <>
      <style>{`
        @keyframes med-heartbeat {
          0%, 100% { transform: scale(1); }
          14%       { transform: scale(1.25); }
          28%       { transform: scale(1); }
          42%       { transform: scale(1.2); }
          56%       { transform: scale(1); }
        }
        @keyframes med-float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes med-spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes med-ping {
          0%   { transform: scale(1); opacity: 1; }
          75%, 100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes med-bounce {
          0%, 100% { transform: translateY(0); animation-timing-function: cubic-bezier(0.8,0,1,1); }
          50%       { transform: translateY(-8px); animation-timing-function: cubic-bezier(0,0,0.2,1); }
        }

        .med-anim-heartbeat { animation: med-heartbeat 1.4s ease-in-out infinite; }
        .med-anim-float     { animation: med-float 3s ease-in-out infinite; }
        .med-anim-spin-slow { animation: med-spin-slow 6s linear infinite; }
        .med-anim-ping      { animation: med-ping 1.5s cubic-bezier(0,0,0.2,1) infinite; }
        .med-anim-bounce    { animation: med-bounce 1.2s infinite; }
      `}</style>

      <div className={`relative inline-flex items-center justify-center ${className}`}>
        {/* Soft glow ring for ping animation */}
        {animation === 'ping' && (
          <span
            aria-hidden="true"
            className={`med-anim-ping absolute inset-0 rounded-full bg-current opacity-20`}
          />
        )}
        <span
          className={`
            inline-flex items-center justify-center rounded-full
            bg-current/10 ${SIZE[size]} ${color}
            med-anim-${animation}
          `}
        >
          <Icon className={`${ICON_SIZE[size]} text-current`} />
        </span>
      </div>
    </>
  );
}
