import { CheckSquare, Compass, ShieldAlert, Zap, type LucideIcon } from 'lucide-react-native';

import type { SeatId } from '../types';

export interface SeatMeta {
  name: string;
  role: string;
  accent: string;
  Icon: LucideIcon;
}

export const SEAT_ORDER: SeatId[] = ['first_principles', 'contrarian', 'expansionist', 'executor'];

export const SEATS: Record<SeatId, SeatMeta> = {
  first_principles: { name: 'First-Principles Thinker', role: 'Known vs assumed', accent: '#06B6D4', Icon: Compass },
  contrarian: { name: 'Contrarian / Risk Auditor', role: 'Failure modes', accent: '#EF4444', Icon: ShieldAlert },
  expansionist: { name: 'Expansionist / Asymmetry Finder', role: 'Hidden leverage', accent: '#F59E0B', Icon: Zap },
  executor: { name: 'The Executor', role: '24-hour protocol', accent: '#10B981', Icon: CheckSquare },
};
