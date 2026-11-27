import { Link, Outlet, createBrowserRouter, RouterProvider, useRouteError, Navigate } from 'react-router-dom'
import { HomePage } from './pages/Home'
import { LoginPage } from './pages/Login'

// Admin Layout & Pages (shadcn-admin architecture)
import { AdminLayout } from './components/admin/AdminLayout'
import { SettingsLayout } from './components/admin/SettingsLayout'
import { AdminOverviewPage } from './pages/admin/Overview'
import { AdminCategoriesPage } from './pages/admin/Categories'
import { AdminLinksPage } from './pages/admin/Links'
import { AdminSiteSettingsPage } from './pages/admin/SiteSettings'
import { AdminFetchSettingsPage } from './pages/admin/FetchSettings'
import { AdminAccountSettingsPage } from './pages/admin/AccountSettings'
import { AdminSystemMaintenancePage } from './pages/admin/SystemMaintenance'

function Layout() {
  return <Outlet />
}

function AuthLayout() {
  return (
    <div className='min-h-svh bg-background text-foreground antialiased'>
      <Outlet />
    </div>
  )
}

function NotFound() {
  return (
    <div className='flex min-h-screen flex-col items-center justify-center p-4 text-center bg-[#f3f5f8] dark:bg-[#0f1115]'>
      <p className='text-3xl font-bold text-slate-800 dark:text-slate-100'>404</p>
      <p className='mt-2 text-sm text-slate-500 dark:text-neutral-400'>这个页面不存在。</p>
      <Link to='/' className='mt-4 inline-block rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'>
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
  // Auth layout (Login / Sign-in)
  {
    element: <AuthLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'sign-in', element: <LoginPage /> },
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
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <AdminSiteSettingsPage /> },
          { path: 'fetch', element: <AdminFetchSettingsPage /> },
          { path: 'account', element: <AdminAccountSettingsPage /> },
          { path: 'maintenance', element: <AdminSystemMaintenancePage /> },
        ],
      },
      { path: 'fetch-settings', element: <Navigate to='/admin/settings/fetch' replace /> },
      { path: 'account', element: <Navigate to='/admin/settings/account' replace /> },
      { path: 'system', element: <Navigate to='/admin/settings/maintenance' replace /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
