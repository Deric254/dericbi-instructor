// Extends the global Window interface with the IPC bridge
// exposed by Electron's preload script

declare global {
  interface Window {
    api: {
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
        isMaximized: () => Promise<boolean>
      }
      license: {
        status: () => Promise<{ activated: boolean; ref?: string }>
        activate: (licenseKey: string) => Promise<{ success: boolean; error?: string }>
        deactivate: () => Promise<{ success: boolean }>
      }
      auth: {
        register: (params: any) => Promise<any>
        login: (params: any) => Promise<any>
        validateSession: (token: string) => Promise<{ valid: boolean; user: any }>
        logout: (token: string) => Promise<any>
        updateProfile: (userId: string, updates: any) => Promise<any>
        changePassword: (userId: string, currentPassword: string, newPassword: string) => Promise<any>
        setSecurityQuestion: (userId: string, question: string, answer: string) => Promise<any>
        getSecurityQuestion: (email: string) => Promise<any>
        resetPassword: (email: string, answer: string, newPassword: string) => Promise<any>
      }
      progress: {
        dashboard: (userId: string) => Promise<any>
        skills: (userId: string) => Promise<any>
        rank: (userId: string) => Promise<any>
        memory: (userId: string, options?: any) => Promise<any>
        achievements: (userId: string) => Promise<any>
      }
      lessons: {
        list: (userId: string, module?: string) => Promise<any[]>
        get: (userId: string, lessonId: string) => Promise<any>
        start: (userId: string, lessonId: string) => Promise<any>
        complete: (userId: string, lessonId: string, timeSpentS?: number) => Promise<any>
      }
      exercises: {
        get: (exerciseId: string) => Promise<any>
        submit: (params: any) => Promise<any>
        hint: (exerciseId: string, hintLevel: number) => Promise<any>
      }
      sql: {
        execute: (sandboxId: string, query: string, userId: string) => Promise<any>
        loadDataset: (sandboxId: string, datasetId: string, type: 'bundled' | 'imported', userId: string) => Promise<any>
        history: (userId: string, limit?: number) => Promise<any[]>
        datasets: (userId: string) => Promise<any>
        closeSandbox: (sandboxId: string) => Promise<any>
      }
      files: {
        pick: () => Promise<{ canceled: boolean; path?: string }>
        import: (userId: string, filePath: string, fileName: string) => Promise<any>
        profile: (userId: string, datasetId: string) => Promise<any>
        delete: (userId: string, datasetId: string) => Promise<any>
      }
      ai: {
        chat: (params: any) => Promise<any>
        exerciseFeedback: (params: any) => Promise<any>
        saveKey: (userId: string, provider: string, key: string) => Promise<any>
        hasKey: (userId: string, provider: string) => Promise<{ has_key: boolean }>
        getProvider: (userId: string) => Promise<{ provider: string }>
        setProvider: (provider: string) => Promise<any>
      }
      settings: {
        get: (key: string) => Promise<{ value: string | null }>
        set: (key: string, value: string) => Promise<any>
        getAll: () => Promise<Record<string, string>>
        getVersion: () => Promise<{ version: string }>
      }
      projects: {
        list: (userId: string) => Promise<any[]>
        get: (userId: string, projectId: string) => Promise<any>
        create: (params: any) => Promise<any>
        update: (params: any) => Promise<any>
        delete: (userId: string, projectId: string) => Promise<any>
      }
      portfolio: {
        list: (userId: string) => Promise<any[]>
        create: (params: any) => Promise<any>
        delete: (userId: string, itemId: string) => Promise<any>
        export: (userId: string, projectId: string, format: 'pdf' | 'docx' | 'pptx') => Promise<any>
        openFile: (filePath: string) => Promise<any>
      }
      updater: {
        check: () => Promise<any>
        onChecking: (cb: () => void) => void
        onProgress: (cb: (progress: any) => void) => void
      }
      admin: {
        check: (userId: string) => Promise<{ is_admin: boolean }>
        usersList: (requesterId: string) => Promise<{ users: any[] }>
        userDetail: (requesterId: string, targetUserId: string) => Promise<any>
        resetUserProgress: (requesterId: string, targetUserId: string) => Promise<{ success: boolean; error?: string }>
        setAdmin: (requesterId: string, targetUserId: string, isAdmin: boolean) => Promise<{ success: boolean; error?: string }>
        deleteUser: (requesterId: string, targetUserId: string) => Promise<{ success: boolean; error?: string }>
        contentStats: (requesterId: string) => Promise<any>
        systemInfo: (requesterId: string) => Promise<any>
      }
    }
  }
}

export {}
