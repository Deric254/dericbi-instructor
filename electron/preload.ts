import { contextBridge, ipcRenderer } from 'electron'

// ─────────────────────────────────────────────
// TYPED IPC BRIDGE
// All renderer-to-main communication goes through here
// ─────────────────────────────────────────────

const api = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },

  // License
  license: {
    status: () => ipcRenderer.invoke('license:status'),
    activate: (licenseKey: string) => ipcRenderer.invoke('license:activate', licenseKey),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
  },

  // Auth
  auth: {
    register: (params: any) => ipcRenderer.invoke('auth:register', params),
    login: (params: any) => ipcRenderer.invoke('auth:login', params),
    validateSession: (token: string) => ipcRenderer.invoke('auth:validate-session', token),
    logout: (token: string) => ipcRenderer.invoke('auth:logout', token),
    updateProfile: (userId: string, updates: any) => ipcRenderer.invoke('auth:update-profile', { userId, updates }),
    changePassword: (userId: string, currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:change-password', { userId, currentPassword, newPassword }),
    setSecurityQuestion: (userId: string, question: string, answer: string) =>
      ipcRenderer.invoke('auth:set-security-question', { userId, question, answer }),
    getSecurityQuestion: (email: string) =>
      ipcRenderer.invoke('auth:get-security-question', email),
    resetPassword: (email: string, answer: string, newPassword: string) =>
      ipcRenderer.invoke('auth:reset-password', { email, answer, newPassword }),
  },

  // Progress
  progress: {
    dashboard: (userId: string) => ipcRenderer.invoke('progress:dashboard', userId),
    skills: (userId: string) => ipcRenderer.invoke('progress:skills', userId),
    rank: (userId: string) => ipcRenderer.invoke('progress:rank', userId),
    memory: (userId: string, options?: any) => ipcRenderer.invoke('progress:memory', { userId, options }),
    achievements: (userId: string) => ipcRenderer.invoke('progress:achievements', userId),
  },

  // Lessons
  lessons: {
    list: (userId: string, module?: string) => ipcRenderer.invoke('lessons:list', { userId, module }),
    get: (userId: string, lessonId: string) => ipcRenderer.invoke('lessons:get', { userId, lessonId }),
    start: (userId: string, lessonId: string) => ipcRenderer.invoke('lessons:start', { userId, lessonId }),
    complete: (userId: string, lessonId: string, timeSpentS?: number) =>
      ipcRenderer.invoke('lessons:complete', { userId, lessonId, timeSpentS }),
  },

  // Exercises
  exercises: {
    get: (exerciseId: string) => ipcRenderer.invoke('exercises:get', exerciseId),
    submit: (params: any) => ipcRenderer.invoke('exercises:submit', params),
    hint: (exerciseId: string, hintLevel: number) => ipcRenderer.invoke('exercises:hint', { exerciseId, hintLevel }),
  },

  // SQL
  sql: {
    execute: (sandboxId: string, query: string, userId: string) =>
      ipcRenderer.invoke('sql:execute', { sandboxId, query, userId }),
    loadDataset: (sandboxId: string, datasetId: string, type: 'bundled' | 'imported', userId: string) =>
      ipcRenderer.invoke('sql:load-dataset', { sandboxId, datasetId, type, userId }),
    history: (userId: string, limit?: number) => ipcRenderer.invoke('sql:history', { userId, limit }),
    datasets: (userId: string) => ipcRenderer.invoke('sql:datasets', userId),
    closeSandbox: (sandboxId: string) => ipcRenderer.invoke('sql:close-sandbox', sandboxId),
  },

  // Files
  files: {
    pick: () => ipcRenderer.invoke('files:pick'),
    import: (userId: string, filePath: string, fileName: string) =>
      ipcRenderer.invoke('files:import', { userId, filePath, fileName }),
    profile: (userId: string, datasetId: string) => ipcRenderer.invoke('files:profile', { userId, datasetId }),
    delete: (userId: string, datasetId: string) => ipcRenderer.invoke('files:delete', { userId, datasetId }),
  },

  // AI
  ai: {
    chat: (params: any) => ipcRenderer.invoke('ai:chat', params),
    exerciseFeedback: (params: any) => ipcRenderer.invoke('ai:exercise-feedback', params),
    saveKey: (userId: string, provider: string, key: string) =>
      ipcRenderer.invoke('ai:save-key', { userId, provider, key }),
    hasKey: (userId: string, provider: string) => ipcRenderer.invoke('ai:has-key', { userId, provider }),
    getProvider: (userId: string) => ipcRenderer.invoke('ai:get-provider', userId),
    setProvider: (provider: string) => ipcRenderer.invoke('ai:set-provider', { provider }),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', { key, value }),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },

  // Projects
  projects: {
    list: (userId: string) => ipcRenderer.invoke('projects:list', userId),
    get: (userId: string, projectId: string) => ipcRenderer.invoke('projects:get', { userId, projectId }),
    create: (params: any) => ipcRenderer.invoke('projects:create', params),
    update: (params: any) => ipcRenderer.invoke('projects:update', params),
    delete: (userId: string, projectId: string) => ipcRenderer.invoke('projects:delete', { userId, projectId }),
  },

  // Portfolio
  portfolio: {
    list: (userId: string) => ipcRenderer.invoke('portfolio:list', userId),
    create: (params: any) => ipcRenderer.invoke('portfolio:create', params),
    delete: (userId: string, itemId: string) => ipcRenderer.invoke('portfolio:delete', { userId, itemId }),
    export: (userId: string, projectId: string, format: 'pdf' | 'docx' | 'pptx') =>
      ipcRenderer.invoke('portfolio:export', { userId, projectId, format }),
    openFile: (filePath: string) => ipcRenderer.invoke('portfolio:open-file', filePath),
  },

  // Updater
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    onChecking: (cb: () => void) => ipcRenderer.on('updater:checking', cb),
    onProgress: (cb: (progress: any) => void) => ipcRenderer.on('updater:progress', (_, p) => cb(p)),
  },

  // Admin
  admin: {
    check: (userId: string) => ipcRenderer.invoke('admin:check', userId),
    usersList: (requesterId: string) => ipcRenderer.invoke('admin:users-list', { requesterId }),
    userDetail: (requesterId: string, targetUserId: string) =>
      ipcRenderer.invoke('admin:user-detail', { requesterId, targetUserId }),
    resetUserProgress: (requesterId: string, targetUserId: string) =>
      ipcRenderer.invoke('admin:reset-user-progress', { requesterId, targetUserId }),
    setAdmin: (requesterId: string, targetUserId: string, isAdmin: boolean) =>
      ipcRenderer.invoke('admin:set-admin', { requesterId, targetUserId, isAdmin }),
    deleteUser: (requesterId: string, targetUserId: string) =>
      ipcRenderer.invoke('admin:delete-user', { requesterId, targetUserId }),
    contentStats: (requesterId: string) => ipcRenderer.invoke('admin:content-stats', { requesterId }),
    systemInfo: (requesterId: string) => ipcRenderer.invoke('admin:system-info', { requesterId }),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
