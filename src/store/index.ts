import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, NavSection, Achievement } from '../types'

// ─────────────────────────────────────────────
// AUTH STORE
// ─────────────────────────────────────────────

interface AuthStore {
  user: User | null
  token: string | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setLoading: (loading: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: true,
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: 'dericbi-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
)

// ─────────────────────────────────────────────
// UI STORE
// ─────────────────────────────────────────────

interface UIStore {
  activeSection: NavSection
  sidebarCollapsed: boolean
  instructorOpen: boolean
  setActiveSection: (section: NavSection) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleInstructor: () => void
  setInstructorOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>()((set) => ({
  activeSection: 'dashboard',
  sidebarCollapsed: false,
  instructorOpen: false,
  setActiveSection: (activeSection) => set({ activeSection }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleInstructor: () => set((s) => ({ instructorOpen: !s.instructorOpen })),
  setInstructorOpen: (instructorOpen) => set({ instructorOpen }),
}))

// ─────────────────────────────────────────────
// NOTIFICATION STORE
// ─────────────────────────────────────────────

export interface Notification {
  id: string
  type: 'success' | 'error' | 'info' | 'warning' | 'achievement'
  title: string
  message?: string
  duration?: number
  achievement?: Achievement
}

interface NotificationStore {
  notifications: Notification[]
  add: (notif: Omit<Notification, 'id'>) => void
  remove: (id: string) => void
  clear: () => void
}

export const useNotificationStore = create<NotificationStore>()((set) => ({
  notifications: [],
  add: (notif) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ notifications: [...s.notifications, { ...notif, id }] }))

    // Auto-remove after duration
    const duration = notif.duration ?? (notif.type === 'achievement' ? 5000 : 3500)
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter(n => n.id !== id) }))
    }, duration)
  },
  remove: (id) => set((s) => ({ notifications: s.notifications.filter(n => n.id !== id) })),
  clear: () => set({ notifications: [] }),
}))

// Convenience helpers
export const notify = {
  success: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'success', title, message }),
  error: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'error', title, message, duration: 5000 }),
  info: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'info', title, message }),
  warning: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'warning', title, message }),
  achievement: (achievement: Achievement) =>
    useNotificationStore.getState().add({ type: 'achievement', title: 'Achievement Unlocked!', achievement, duration: 5000 }),
}
