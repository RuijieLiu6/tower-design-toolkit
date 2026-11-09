// The transfer centre's open state (Result B, 9 Nov): one Import and one Export entry in the project bar open the same
// dialog on the matching tab (components/porting/TransferDialog.tsx). The opener is kept so focus returns to it.
import { create } from 'zustand'

interface TransferState {
  tab: 'import' | 'export' | null
  opener: HTMLElement | null
  open: (tab: 'import' | 'export', opener?: HTMLElement | null) => void
  close: () => void
}
export const useTransfer = create<TransferState>((set) => ({
  tab: null, opener: null,
  open: (tab, opener = document.activeElement as HTMLElement | null) => set({ tab, opener }),
  close: () => set((s) => { requestAnimationFrame(() => s.opener?.focus()); return { tab: null, opener: null } }),
}))
