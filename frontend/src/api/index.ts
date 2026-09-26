import { list, listAll, request, withPage } from './client'
import type {
  AdminEnrollment,
  AdminUser,
  Course,
  CoursePreview,
  CourseRevision,
  CourseRating,
  CuratorReviewItem,
  CuratorStudent,
  CuratorStudentProgress,
  Progress,
  Step,
  StepQuestion,
  StepTypeInfo,
  StudentCourse,
  StudentEnrollment,
  Submission,
  User,
} from './types'
import type { PythonSample } from '../features/student/pythonRunner'

const id = encodeURIComponent

export const api = {
  auth: {
    me: () => request<User>('/auth/me'),
    login: (username: string, password: string) =>
      request<User>('/auth/login', { method: 'POST', body: { username, password } }),
    logout: () => request<{ logged_out: boolean }>('/auth/logout', { method: 'POST' }),
    setPassword: (uid: string, token: string, password: string) =>
      request<{ password_set: boolean }>('/auth/set-password', { method: 'POST', body: { uid, token, password } }),
  },
  student: {
    courses: (page = 1) => list<StudentCourse>(withPage('/student/courses', page)),
    allCourses: () => listAll<StudentCourse>('/student/courses'),
    enrollment: (enrollmentId: string) => request<StudentEnrollment>(`/student/enrollments/${id(enrollmentId)}`),
    progress: (enrollmentId: string) => request<Progress>(`/student/enrollments/${id(enrollmentId)}/progress`),
    rating: (enrollmentId: string) => request<CourseRating>(`/student/enrollments/${id(enrollmentId)}/rating`),
    step: (enrollmentId: string, stepId: string) =>
      request<Step>(`/student/enrollments/${id(enrollmentId)}/steps/${id(stepId)}`),
    submissions: (enrollmentId: string, stepId: string, page = 1) =>
      list<Submission>(withPage(`/student/enrollments/${id(enrollmentId)}/steps/${id(stepId)}/submissions`, page)),
    pythonSample: (enrollmentId: string, stepId: string) =>
      request<PythonSample>(`/student/enrollments/${id(enrollmentId)}/steps/${id(stepId)}/python-sample`),
    submit: (enrollmentId: string, stepId: string, body: object | FormData, idempotencyKey: string) =>
      request<Submission>(`/student/enrollments/${id(enrollmentId)}/steps/${id(stepId)}/submissions`, {
        method: 'POST', body, idempotencyKey,
      }),
    submission: (submissionId: string) => request<Submission>(`/student/submissions/${id(submissionId)}`),
    questions: (enrollmentId: string, stepId: string, page = 1) =>
      list<StepQuestion>(withPage(`/student/enrollments/${id(enrollmentId)}/steps/${id(stepId)}/questions`, page)),
    ask: (enrollmentId: string, stepId: string, question: string) =>
      request<StepQuestion>(`/student/enrollments/${id(enrollmentId)}/steps/${id(stepId)}/questions`, {
        method: 'POST', body: { question },
      }),
    reply: (questionId: string, body: string) =>
      request<StepQuestion>(`/student/questions/${id(questionId)}/messages`, { method: 'POST', body: { body } }),
  },
  admin: {
    courses: (page = 1) => list<Course>(withPage('/admin/courses', page)),
    allCourses: () => listAll<Course>('/admin/courses'),
    createCourse: (body: Pick<Course, 'title' | 'description' | 'grade_min' | 'grade_max'>) =>
      request<Course>('/admin/courses', { method: 'POST', body }),
    course: (courseId: string) => request<Course>(`/admin/courses/${id(courseId)}`),
    updateCourse: (courseId: string, body: Partial<Pick<Course, 'title' | 'description' | 'grade_min' | 'grade_max' | 'is_archived'>> & { banner_image?: File; clear_banner?: boolean }) => {
      const hasBannerChange = Boolean(body.banner_image || body.clear_banner)
      const payload: object | FormData = hasBannerChange
        ? (() => {
            const form = new FormData()
            Object.entries(body).forEach(([key, value]) => {
              if (value === undefined || value === null) return
              if (value instanceof File) form.append(key, value)
              else form.append(key, String(value))
            })
            return form
          })()
        : body
      return request<Course>(`/admin/courses/${id(courseId)}`, { method: 'PATCH', body: payload })
    },
    deleteCourse: (courseId: string) => request<{ deleted: boolean; archived: boolean }>(`/admin/courses/${id(courseId)}`, { method: 'DELETE' }),
    preview: (courseId: string) => request<CoursePreview>(`/admin/courses/${id(courseId)}/preview`),
    types: () => request<StepTypeInfo[]>('/admin/course-types'),
    createStep: (courseId: string, body: Omit<Step, 'id'>) =>
      request<Step>(`/admin/courses/${id(courseId)}/steps`, { method: 'POST', body }),
    updateStep: (courseId: string, stepId: string, body: Partial<Omit<Step, 'id'>>) =>
      request<Step>(`/admin/courses/${id(courseId)}/steps/${id(stepId)}`, { method: 'PATCH', body }),
    deleteStep: (courseId: string, stepId: string) =>
      request<{ deleted: boolean }>(`/admin/courses/${id(courseId)}/steps/${id(stepId)}`, { method: 'DELETE' }),
    publish: (courseId: string) =>
      request<CourseRevision>(`/admin/courses/${id(courseId)}/publish`, { method: 'POST' }),
    users: (role: 'student' | 'curator') => listAll<User>(`/admin/users?role=${role}`),
    manageUsers: (role: 'student' | 'curator', page = 1) =>
      list<AdminUser>(withPage(`/admin/users?role=${role}&include_inactive=1`, page)),
    createUser: (body: { username: string; display_name: string; role: 'student' | 'curator' }) =>
      request<AdminUser & { setup_url: string }>('/admin/users', { method: 'POST', body }),
    passwordLink: (userId: string) =>
      request<{ setup_url: string }>(`/admin/users/${id(userId)}/password-link`, { method: 'POST' }),
    deleteUser: (userId: string) => request<{ deleted: boolean }>(`/admin/users/${id(userId)}`, { method: 'DELETE' }),
    setUserActive: (userId: string, isActive: boolean) =>
      request<AdminUser>(`/admin/users/${id(userId)}`, { method: 'PATCH', body: { is_active: isActive } }),
    enrollments: (page = 1) => list<AdminEnrollment>(withPage('/admin/enrollments', page)),
    allEnrollments: () => listAll<AdminEnrollment>('/admin/enrollments'),
    assign: (courseId: string, studentId: string, curatorId: string) =>
      request<AdminEnrollment>('/admin/enrollments', {
        method: 'POST', body: { course_id: courseId, student_id: studentId, curator_id: curatorId, status: 'active' },
      }),
    updateEnrollment: (enrollmentId: string, body: { curator_id?: string; status?: 'active' | 'paused' | 'completed' | 'removed' }) =>
      request<AdminEnrollment>(`/admin/enrollments/${id(enrollmentId)}`, { method: 'PATCH', body }),
  },
  curator: {
    students: (page = 1, search = '') => list<CuratorStudent>(withPage(
      `/curator/students${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`, page,
    )),
    studentProgress: (studentId: string, enrollmentId: string) =>
      request<CuratorStudentProgress>(`/curator/students/${id(studentId)}/enrollments/${id(enrollmentId)}/progress`),
    reviews: (page = 1) => list<CuratorReviewItem>(withPage('/curator/reviews?status=pending_review', page)),
    submission: (submissionId: string) => request<Submission>(`/curator/submissions/${id(submissionId)}`),
    review: (submissionId: string, decision: 'accepted' | 'returned', comment: string) =>
      request<Submission>(`/curator/submissions/${id(submissionId)}/review`, {
        method: 'POST', body: { decision, comment },
      }),
    questions: (page = 1) => list<StepQuestion>(withPage('/curator/questions?status=all', page)),
    answer: (questionId: string, answer: string) =>
      request<StepQuestion>(`/curator/questions/${id(questionId)}/answer`, {
        method: 'POST', body: { answer },
      }),
  },
}
