import { list, listAll, request, withPage } from './client'
import type {
  AdminEnrollment,
  Course,
  CoursePreview,
  CourseRevision,
  CuratorReviewItem,
  CuratorStudent,
  Progress,
  Step,
  StepQuestion,
  StepTypeInfo,
  StudentCourse,
  StudentEnrollment,
  Submission,
  User,
} from './types'
import type { PythonChallenge } from '../features/student/pythonRunner'

const id = encodeURIComponent

export const api = {
  auth: {
    me: () => request<User>('/auth/me'),
    login: (username: string, password: string) =>
      request<User>('/auth/login', { method: 'POST', body: { username, password } }),
    logout: () => request<{ logged_out: boolean }>('/auth/logout', { method: 'POST' }),
  },
  student: {
    courses: (page = 1) => list<StudentCourse>(withPage('/student/courses', page)),
    enrollment: (enrollmentId: string) => request<StudentEnrollment>(`/student/enrollments/${id(enrollmentId)}`),
    progress: (enrollmentId: string) => request<Progress>(`/student/enrollments/${id(enrollmentId)}/progress`),
    step: (enrollmentId: string, stepId: string) =>
      request<Step>(`/student/enrollments/${id(enrollmentId)}/steps/${id(stepId)}`),
    submissions: (enrollmentId: string, stepId: string, page = 1) =>
      list<Submission>(withPage(`/student/enrollments/${id(enrollmentId)}/steps/${id(stepId)}/submissions`, page)),
    pythonChallenge: (enrollmentId: string, stepId: string, code: string) =>
      request<PythonChallenge>(`/student/enrollments/${id(enrollmentId)}/steps/${id(stepId)}/python-challenge`, {
        method: 'POST', body: { code },
      }),
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
  },
  admin: {
    courses: (page = 1) => list<Course>(withPage('/admin/courses', page)),
    allCourses: () => listAll<Course>('/admin/courses'),
    createCourse: (body: Pick<Course, 'title' | 'description' | 'grade_min' | 'grade_max'>) =>
      request<Course>('/admin/courses', { method: 'POST', body }),
    course: (courseId: string) => request<Course>(`/admin/courses/${id(courseId)}`),
    updateCourse: (courseId: string, body: Partial<Pick<Course, 'title' | 'description' | 'grade_min' | 'grade_max'>>) =>
      request<Course>(`/admin/courses/${id(courseId)}`, { method: 'PATCH', body }),
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
    enrollments: (page = 1) => list<AdminEnrollment>(withPage('/admin/enrollments', page)),
    assign: (courseId: string, studentId: string, curatorId: string) =>
      request<AdminEnrollment>('/admin/enrollments', {
        method: 'POST', body: { course_id: courseId, student_id: studentId, curator_id: curatorId },
      }),
    updateEnrollment: (enrollmentId: string, body: { curator_id?: string; status?: string }) =>
      request<AdminEnrollment>(`/admin/enrollments/${id(enrollmentId)}`, { method: 'PATCH', body }),
  },
  curator: {
    students: (page = 1) => list<CuratorStudent>(withPage('/curator/students', page)),
    studentProgress: (studentId: string, enrollmentId: string) =>
      request<Progress>(`/curator/students/${id(studentId)}/enrollments/${id(enrollmentId)}/progress`),
    reviews: (page = 1) => list<CuratorReviewItem>(withPage('/curator/reviews?status=pending_review', page)),
    submission: (submissionId: string) => request<Submission>(`/curator/submissions/${id(submissionId)}`),
    review: (submissionId: string, decision: 'accepted' | 'returned', comment: string) =>
      request<Submission>(`/curator/submissions/${id(submissionId)}/review`, {
        method: 'POST', body: { decision, comment },
      }),
    questions: (page = 1) => list<StepQuestion>(withPage('/curator/questions?status=unanswered', page)),
    answer: (questionId: string, answer: string) =>
      request<StepQuestion>(`/curator/questions/${id(questionId)}/answer`, {
        method: 'POST', body: { answer },
      }),
  },
}
