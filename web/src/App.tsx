import { Link, Outlet, createBrowserRouter, RouterProvider, useRouteError, Navigate } from 'react-router-dom'
import { Header } from './components/Header'
import { useHome, useSetupStatus } from './lib/query'
import { HomePage } from './pages/Home'
import { LoginPage } from './pages/Login'
import { SetupPage } from './pages/Setup'

// Admin Layout & Pages (shadcn-admin architecture)
import { AdminLayout } from './components/admin/AdminLayout'
import { AdminOverviewPage } from './pages/admin/Overview'
import { AdminCategoriesPage } from './pages/admin/Categories'
import { AdminLinksPage } from './pages/admin/Links'
import { AdminSiteSettingsPage } from './pages/admin/SiteSettings'
import { AdminAccountSettingsPage } from './pages/admin/AccountSettings'
import { AdminSystemMaintenancePage } from './pages/admin/SystemMaintenance'

function Layout() {
  const { data: setup } = useSetupStatus()
  const { data } = useHome()

  if (setup && !setup.installed) {
    return <Navigate to='/setup' replace />
  }

  return (
    <div className='min-h-dvh' style={{ background: data?.site.background || undefined }}>
      <Header siteName={data?.site.name ?? 'NextNav'} />
      <main className='mx-auto max-w-[1280px] px-4 pb-16 pt-6'>
        <Outlet />
      </main>
    </div>
  )
}

function AuthLayout() {
  const { data } = useHome()
  return (
    <div className='min-h-dvh'>
      <Header siteName={data?.site.name ?? 'NextNav'} />
      <main className='mx-auto flex max-w-md flex-col px-4 py-12'>
        <Outlet />
      </main>
    </div>
  )
}

function NotFound() {
  return (
    <div className='py-16 text-center'>
      <p className='text-2xl font-semibold'>404</p>
      <p className='mt-2 text-muted-foreground'>这个页面不存在。</p>
      <Link to='/' className='mt-4 inline-block text-primary hover:underline'>
        回到首页
      </Link>
    </div>
  )
}

function ErrorBoundary() {
  const err = useRouteError()
  return (
    <div className='mx-auto max-w-md py-16 text-center'>
      <p className='text-lg font-semibold'>页面出错了</p>
      <pre className='mt-3 overflow-auto rounded-md border border-border bg-card p-3 text-left text-xs text-muted-foreground'>
        {err instanceof Error ? err.message : String(err)}
      </pre>
      <button
        type='button'
        onClick={() => window.location.reload()}
        className='mt-4 text-primary hover:underline'
      >
        重新加载
      </button>
    </div>
  )
}

const router = createBrowserRouter([
  // Public front-end layout
  {
    element: <Layout />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      // Redirect legacy /settings to /admin/settings
      { path: 'settings', element: <Navigate to='/admin/settings' replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  // Auth layout (Login & Setup)
  {
    element: <AuthLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'setup', element: <SetupPage /> },
    ],
  },
  // shadcn-admin Management Portal
  {
    path: 'admin',
    element: <AdminLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <AdminOverviewPage /> },
      { path: 'categories', element: <AdminCategoriesPage /> },
      { path: 'links', element: <AdminLinksPage /> },
      { path: 'settings', element: <AdminSiteSettingsPage /> },
      { path: 'account', element: <AdminAccountSettingsPage /> },
      { path: 'system', element: <AdminSystemMaintenancePage /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
