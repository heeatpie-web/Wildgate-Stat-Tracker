import { InsightTone } from '../../types';

type ToneClasses = {
  badgeBg: string;
  badgeText: string;
  glowBg: string;
};

const TONE_CLASSES: Record<InsightTone, ToneClasses> = {
  success: {
    badgeBg: 'bg-success',
    badgeText: 'text-on-scrim',
    glowBg: 'bg-success',
  },
  danger: {
    badgeBg: 'bg-danger',
    badgeText: 'text-on-scrim',
    glowBg: 'bg-danger',
  },
  warning: {
    badgeBg: 'bg-warning',
    badgeText: 'text-ink-strong',
    glowBg: 'bg-warning',
  },
  info: {
    badgeBg: 'bg-info',
    badgeText: 'text-ink-strong',
    glowBg: 'bg-info',
  },
  accent: {
    badgeBg: 'bg-accent',
    badgeText: 'text-on-scrim',
    glowBg: 'bg-accent',
  },
  neutral: {
    badgeBg: 'bg-md-sys-outline',
    badgeText: 'text-md-sys-onSurface',
    glowBg: 'bg-md-sys-outline',
  },
  primary: {
    badgeBg: 'bg-md-sys-primary',
    badgeText: 'text-md-sys-onPrimary',
    glowBg: 'bg-md-sys-primary',
  },
  secondary: {
    badgeBg: 'bg-md-sys-secondaryContainer',
    badgeText: 'text-md-sys-onSecondaryContainer',
    glowBg: 'bg-md-sys-secondary',
  },
};

export const getInsightToneClasses = (tone: InsightTone): ToneClasses => {
  return TONE_CLASSES[tone];
};
