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

  // Licence (works before activation)
  licence: {
    state: () => ipcRenderer.invoke('licence:state'),
    activate: (token: string) => ipcRenderer.invoke('licence:activate', token),
    claimOwner: (pastedKey?: string) => ipcRenderer.invoke('licence:claim-owner', pastedKey),
    openLink: (url: string) => ipcRenderer.invoke('licence:open-link', url),
  },

  // Owner Console (the main process refuses these unless this computer was claimed with the owner key)
  owner: {
    overview: () => ipcRenderer.invoke('owner:overview'),
    unlockFile: () => ipcRenderer.invoke('owner:unlock-file'),
    unlockSaved: () => ipcRenderer.invoke('owner:unlock-saved'),
    unlockPasted: (keyText: string) => ipcRenderer.invoke('owner:unlock-pasted', keyText),
    lock: () => ipcRenderer.invoke('owner:lock'),
    issueNew: (input: unknown) => ipcRenderer.invoke('owner:issue-new', input),
    renew: (id: string, lifetime?: boolean) => ipcRenderer.invoke('owner:renew', id, lifetime),
    setPayment: (id: string, month: string, paid: boolean) => ipcRenderer.invoke('owner:set-payment', id, month, paid),
    updateCustomer: (id: string, patch: unknown) => ipcRenderer.invoke('owner:update-customer', id, patch),
    deleteCustomer: (id: string) => ipcRenderer.invoke('owner:delete-customer', id),
    updateSettings: (patch: unknown) => ipcRenderer.invoke('owner:update-settings', patch),
    export: (format: 'xlsx' | 'csv') => ipcRenderer.invoke('owner:export', format),
    backup: () => ipcRenderer.invoke('owner:backup'),
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
    skillMap: (userId: string) => ipcRenderer.invoke('progress:skill-map', userId),
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

  // Explain it back
  explain: {
    get: (userId: string, lessonId: string) => ipcRenderer.invoke('explain:get', { userId, lessonId }),
    submit: (userId: string, lessonId: string, text: string) => ipcRenderer.invoke('explain:submit', { userId, lessonId, text }),
    confirm: (userId: string, lessonId: string) => ipcRenderer.invoke('explain:confirm', { userId, lessonId }),
    selfTest: (userId: string) => ipcRenderer.invoke('explain:selftest', userId),
  },

  // Real-world tasks
  fieldwork: {
    get: (userId: string, lessonId: string) => ipcRenderer.invoke('fieldwork:get', { userId, lessonId }),
    list: (userId: string) => ipcRenderer.invoke('fieldwork:list', userId),
    save: (userId: string, lessonId: string, did: string, learned: string) => ipcRenderer.invoke('fieldwork:save', { userId, lessonId, did, learned }),
    delete: (userId: string, lessonId: string) => ipcRenderer.invoke('fieldwork:delete', { userId, lessonId }),
  },

  // Spaced review
  review: {
    due: (userId: string) => ipcRenderer.invoke('review:due', userId),
    answer: (userId: string, questionId: string, answer: number) => ipcRenderer.invoke('review:answer', { userId, questionId, answer }),
  },

  // Placement check (Start Here)
  placement: {
    get: (userId: string) => ipcRenderer.invoke('placement:get', userId),
    submit: (userId: string, answers: Record<string, number>) => ipcRenderer.invoke('placement:submit', { userId, answers }),
  },

  // Quizzes
  quizzes: {
    submit: (userId: string, lessonId: string, answers: number[]) =>
      ipcRenderer.invoke('quizzes:submit', { userId, lessonId, answers }),
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
    schema: (sandboxId: string, userId: string) => ipcRenderer.invoke('sql:schema', { sandboxId, userId }),
    closeSandbox: (sandboxId: string) => ipcRenderer.invoke('sql:close-sandbox', sandboxId),
  },

  // My Databases: databases the learner builds from scratch
  userdb: {
    list: (userId: string) => ipcRenderer.invoke('userdb:list', userId),
    create: (userId: string, name: string) => ipcRenderer.invoke('userdb:create', { userId, name }),
    rename: (userId: string, dbId: string, name: string) => ipcRenderer.invoke('userdb:rename', { userId, dbId, name }),
    delete: (userId: string, dbId: string) => ipcRenderer.invoke('userdb:delete', { userId, dbId }),
    describe: (userId: string, dbId: string) => ipcRenderer.invoke('userdb:describe', { userId, dbId }),
    export: (userId: string, dbId: string) => ipcRenderer.invoke('userdb:export', { userId, dbId }),
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
    listModels: (userId: string, provider: string) => ipcRenderer.invoke('ai:list-models', { userId, provider }),
    usage: (userId: string) => ipcRenderer.invoke('ai:usage', userId),
  },

  // Progress backup
  progress_backup: {
    export: (userId: string) => ipcRenderer.invoke('progress:export', { userId }),
    import: (userId: string) => ipcRenderer.invoke('progress:import', { userId }),
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
