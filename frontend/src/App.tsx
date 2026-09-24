import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, homeForRole } from './auth/AuthContext'
import { ErrorNotice, Loading } from './components/Feedback'
import { Layout } from './components/Layout'
import { LoginPage } from './LoginPage'
import type { Role } from './api/types'
import { StudentCoursesPage } from './features/student/StudentCoursesPage'
import { StudentCoursePage } from './features/student/StudentCoursePage'
import { StudentStepPage } from './features/student/StudentStepPage'
import { AdminCoursesPage } from './features/admin/AdminCoursesPage'
import { AdminCoursePage } from './features/admin/AdminCoursePage'
import { AdminAssignmentsPage } from './features/admin/AdminAssignmentsPage'
import { AdminUsersPage } from './features/admin/AdminUsersPage'
import { CuratorStudentsPage } from './features/curator/CuratorStudentsPage'
import { CuratorReviewsPage } from './features/curator/CuratorReviewsPage'
import { CuratorReviewPage } from './features/curator/CuratorReviewPage'
import { CuratorQuestionsPage } from './features/curator/CuratorQuestionsPage'

function Home() {
  const { user } = useAuth()
  return <Navigate to={user ? homeForRole(user.role) : '/login'} replace />
}

function RequireRole({ role }: { role: Role }) {
  const { user, loading, error, retry } = useAuth()
  if (loading) return <Loading />
  if (error) return <ErrorNotice error={error} onRetry={retry} />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={homeForRole(user.role)} replace />
  return <Layout />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Home />} />
      <Route element={<RequireRole role="student" />}>
        <Route path="/student/courses" element={<StudentCoursesPage />} />
        <Route path="/student/courses/:enrollmentId" element={<StudentCoursePage />} />
        <Route path="/student/courses/:enrollmentId/steps/:stepId" element={<StudentStepPage />} />
      </Route>
      <Route element={<RequireRole role="admin" />}>
        <Route path="/admin/courses" element={<AdminCoursesPage />} />
        <Route path="/admin/courses/:courseId/edit" element={<AdminCoursePage />} />
        <Route path="/admin/assignments" element={<AdminAssignmentsPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
      </Route>
      <Route element={<RequireRole role="curator" />}>
        <Route path="/curator" element={<Navigate to="/curator/reviews" replace />} />
        <Route path="/curator/students" element={<CuratorStudentsPage />} />
        <Route path="/curator/reviews" element={<CuratorReviewsPage />} />
        <Route path="/curator/submissions/:submissionId" element={<CuratorReviewPage />} />
        <Route path="/curator/questions" element={<CuratorQuestionsPage />} />
      </Route>
      <Route path="*" element={<p>Страница не найдена. <a href="/">На главную</a></p>} />
    </Routes>
  )
}
