import {
  BookOpenText,
  ChartLineUp,
  ClockCounterClockwise,
  Notebook,
  PlayCircle,
  Sparkle,
  ShieldCheck,
  Strategy,
  UsersThree,
  type Icon,
} from '@phosphor-icons/react';
import type { ModuleInfo } from '@/content/modules';

export const MODULE_ICONS: Record<ModuleInfo['slug'], Icon> = {
  journal: BookOpenText,
  analytics: ChartLineUp,
  strategies: Strategy,
  notebook: Notebook,
  'prop-firms': ShieldCheck,
  backtesting: ClockCounterClockwise,
  replay: PlayCircle,
  mentors: UsersThree,
  assistant: Sparkle,
};
