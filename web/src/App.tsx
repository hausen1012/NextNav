import { Link, Outlet, createBrowserRouter, RouterProvider, useRouteError } from 'react-router-dom'
import { Header } from './components/Header'
import { useHome } from './lib/query'
import { HomePage } from './pages/Home'
import { LoginPage } from './pages/Login'
import { SetupPage } from './pages/Setup'
import { SettingsPage } from './pages/Settings'

function Layout() {
  const { data } = useHome()
  return (
    <div className="min-h-dvh" style={{ background: data?.site.background || undefined }}>
      <Header siteName={data?.site.name ?? 'NextNav'} />
      <main className="mx-auto max-w-page px-4 pb-16 pt-6">
        <Outlet />
      </main>
    </div>
  )
}

// The header sits above the outlet, so auth pages keep it too.
function AuthLayout() {
  const { data } = useHome()
  return (
    <div className="min-h-dvh">
      <Header siteName={data?.site.name ?? 'NextNav'} />
      <main className="mx-auto flex max-w-md flex-col px-4 py-12">
        <Outlet />
      </main>
    </div>
  )
}

function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-2xl font-semibold">404</p>
      <p className="mt-2 text-muted">这个页面不存在。</p>
      <Link to="/" className="mt-4 inline-block text-accent hover:underline">
        回到首页
      </Link>
    </div>
  )
}

function ErrorBoundary() {
  const err = useRouteError()
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-lg font-semibold">页面出错了</p>
      <pre className="mt-3 overflow-auto rounded-md border border-border bg-surface p-3 text-left text-xs text-muted">
        {err instanceof Error ? err.message : String(err)}
      </pre>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 text-accent hover:underline"
      >
        重新加载
      </button>
    </div>
  )
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    element: <AuthLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'setup', element: <SetupPage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}