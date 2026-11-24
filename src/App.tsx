import { useCallback, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Splash } from './components/Splash'
import { StoreProvider, useStore } from './lib/store'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { AuthProviders } from './pages/AuthProviders'
import { AuthCallback } from './components/AuthCallback'
import { clearAuthQuery, isAuthCallback } from './lib/auth'
import { Dashboard } from './pages/Dashboard'
import { Timetable } from './pages/Timetable'
import { Grades } from './pages/Grades'
import { Homework } from './pages/HomeworkPage'
import { Life } from './pages/Life'
import { Messages } from './pages/Messages'
import { Resources } from './pages/Resources'
import { Settings } from './pages/Settings'

function AppRoutes() {
  const { state } = useStore()

  return (
    <Routes>
      <Route path="/connexion" element={<AuthProviders />} />
      <Route element={state.session ? <Layout /> : <Login />}>
        <Route index element={<Dashboard />} />
        <Route path="/emploi-du-temps" element={<Timetable />} />
        <Route path="/notes" element={<Grades />} />
        <Route path="/devoirs" element={<Homework />} />
        <Route path="/vie-scolaire" element={<Life />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/ressources" element={<Resources />} />
        <Route path="/reglages" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false)
  const [callbackActive, setCallbackActive] = useState(() => isAuthCallback())
  const finishSplash = useCallback(() => setSplashDone(true), [])

  const finishCallback = useCallback((destination?: string) => {
    clearAuthQuery()
    if (destination) window.location.hash = destination.replace(/^#/, '')
    setCallbackActive(false)
  }, [])

  return (
    <StoreProvider>
      {!splashDone ? (
        <Splash onFinish={finishSplash} />
      ) : callbackActive ? (
        <AuthCallback onFinish={finishCallback} />
      ) : (
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </HashRouter>
      )}
    </StoreProvider>
  )
}
