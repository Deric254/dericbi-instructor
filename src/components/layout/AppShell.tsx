import React, { useEffect } from 'react'
import { useAuthStore, useUIStore } from '../../store'
import Titlebar from './Titlebar'
import Sidebar from './Sidebar'
import NotificationStack from '../ui/NotificationStack'
import GlobalInstructor from '../ui/GlobalInstructor'

// Pages — all fully implemented
import Dashboard from '../../pages/Dashboard'
import SqlAcademy from '../../pages/SqlAcademy'
import PythonAcademy from '../../pages/PythonAcademy'
import ExcelAcademy from '../../pages/ExcelAcademy'
import PowerBIAcademy from '../../pages/PowerBIAcademy'
import StatisticsAcademy from '../../pages/StatisticsAcademy'
import BusinessAcademy from '../../pages/BusinessAcademy'
import Simulations from '../../pages/Simulations'
import DataPlayground from '../../pages/DataPlayground'
import Datasets from '../../pages/Datasets'
import Projects from '../../pages/Projects'
import Portfolio from '../../pages/Portfolio'
import Achievements from '../../pages/Achievements'
import Settings from '../../pages/Settings'
import type { NavSection } from '../../types'

const PAGES: Record<NavSection, React.ReactNode> = {
  dashboard:    <Dashboard />,
  sql:          <SqlAcademy />,
  python:       <PythonAcademy />,
  excel:        <ExcelAcademy />,
  powerbi:      <PowerBIAcademy />,
  statistics:   <StatisticsAcademy />,
  business:     <BusinessAcademy />,
  simulations:  <Simulations />,
  playground:   <DataPlayground />,
  datasets:     <Datasets />,
  projects:     <Projects />,
  portfolio:    <Portfolio />,
  achievements: <Achievements />,
  settings:     <Settings />,
}

export default function AppShell() {
  const { activeSection, setActiveSection } = useUIStore()

  // Handle navigate events from child components (e.g. InstructorPanel)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as NavSection
      if (detail) setActiveSection(detail)
    }
    window.addEventListener('navigate', handler)
    return () => window.removeEventListener('navigate', handler)
  }, [setActiveSection])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <Titlebar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {PAGES[activeSection]}
        </main>
      </div>
      <NotificationStack />
      <GlobalInstructor />
    </div>
  )
}
