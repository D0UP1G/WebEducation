export type Role = 'student' | 'curator' | 'admin'

export interface User {
  id: string
  display_name: string
  role: Role
}

export interface AdminUser extends User {
  username: string
  is_active: boolean
}

export interface ApiMeta {
  request_id?: string
  page?: number
  page_size?: number
  total?: number
}

export interface ApiEnvelope<T> {
  data: T
  meta?: ApiMeta
}

export interface Paginated<T> extends ApiEnvelope<T[]> {
  meta: ApiMeta & { page: number; page_size: number; total: number }
}

export interface ProgressStep {
  step_id: string
  title: string
  status: SubmissionStatus | 'not_started'
  earned_points: number
  max_points: number
}

export interface Progress {
  completed_steps: number
  total_steps: number
  earned_points: number
  available_points: number
  completion_percent: number
  rating_percent: number
  next_step_id: string | null
  next_action: 'complete_step' | 'revise_submission' | 'await_review' | 'course_complete'
  steps: ProgressStep[]
}

export type StepType =
  | 'theory'
  | 'quiz.single_choice'
  | 'quiz.multiple_choice'
  | 'answer.exact'
  | 'scratch.numeric_answer'
  | 'algorithm.python'
  | 'artifact.scratch'
  | 'artifact.minecraft'
  | 'artifact.project'

export interface Choice {
  id: string
  text: string
}

export type StepContent = Record<string, unknown> & {
  body?: string
  question?: string
  choices?: Choice[]
  correct_option_id?: string
  correct_option_ids?: string[]
  prompt?: string
  accepted_answers?: string[]
  statement?: string
  tests?: Array<{ input: string; output: string }>
  time_limit_ms?: number
  memory_limit_mb?: number
  instructions?: string
}

export interface Step {
  id: string
  type_key: StepType
  schema_version: number
  position: number
  title: string
  content: StepContent
  max_score: number
}

export interface StudentCourse {
  id: string
  course_id: string
  version: number
  title: string
  description: string
  status: 'active' | 'paused' | 'completed'
  assigned_at: string
  progress: Omit<Progress, 'steps'>
}

export interface StudentEnrollment extends StudentCourse {
  course_revision_id: string
  steps: Step[]
  progress: Progress
}

export type SubmissionStatus =
  | 'queued'
  | 'checking'
  | 'pending_review'
  | 'accepted'
  | 'incorrect'
  | 'returned'
  | 'error'

export interface Submission {
  id: string
  step_id: string
  status: SubmissionStatus
  attempt_number: number
  score: number | null
  max_score: number
  feedback: string | null
  created_at: string
  safe_diagnostics?: Record<string, unknown>
  artifact_url?: string
  download_url?: string
  url?: string
  student?: User
  step?: Step
  course_title?: string
  attempts?: Submission[]
}

export interface StepQuestion {
  id: string
  question: string
  answer: string
  created_at: string
  answered_at?: string | null
  student?: User
  step?: Step
  course_title?: string
  enrollment_id?: string
}

export interface Course {
  id: string
  title: string
  description: string
  grade_min: number
  grade_max: number
  latest_version: number | null
  draft_steps_count?: number
  draft_steps?: Step[]
  created_at?: string
  updated_at?: string
}

export interface CoursePreview {
  id: string
  title: string
  description: string
  grade_min: number
  grade_max: number
  steps: Step[]
}

export interface CourseRevision extends CoursePreview {
  version: number
  published_at: string
}

export interface StepTypeInfo {
  type_key: StepType
  schema_version: number
  title: string
  checking_mode: 'instant' | 'browser' | 'manual'
}

export interface AdminEnrollment {
  id: string
  revision: CourseRevision
  student: User
  curator: User
  status: string
  assigned_at: string
}

export interface CuratorStudent extends User {
  lag_signals?: Array<{ reason?: string; code?: string; since?: string; at?: string }>
  progress?: Progress
  enrollments?: Array<{ id: string; title?: string; progress?: Progress }>
}

export interface CuratorReviewItem {
  id?: string
  submission_id?: string
  student?: User
  step?: Step
  course_title?: string
  status?: SubmissionStatus
  created_at?: string
}
