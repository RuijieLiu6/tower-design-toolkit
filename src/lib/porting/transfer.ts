// The transfer centre's open state (Result B, 9 Nov): one Import and one Export entry in the project bar open the same
// dialog on the matching tab (components/porting/TransferDialog.tsx); the phase panel, the Project menu and a file
// dropped on the app open it too, with the purpose (and the file or phase) already chosen. The opener is kept so focus
// returns to it.
import { create } from 'zustand'
import type { PhaseId } from '../phases'

export interface TransferInit { purpose?: string; file?: File; phase?: PhaseId }
interface TransferState {
  tab: 'import' | 'export' | null
  init: TransferInit
  opener: HTMLElement | null
  open: (tab: 'import' | 'export', opener?: HTMLElement | null, init?: TransferInit) => void
  close: () => void
}
export const useTransfer = create<TransferState>((set) => ({
  tab: null, init: {}, opener: null,
  open: (tab, opener = document.activeElement as HTMLElement | null, init = {}) => set({ tab, opener, init }),
  close: () => set((s) => { requestAnimationFrame(() => s.opener?.focus()); return { tab: null, opener: null, init: {} } }),
}))
