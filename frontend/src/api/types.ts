export type Role = 'student' | 'curator' | 'admin'

export interface User {
  id: string
  display_name: string
  role: Role
}

export interface AdminUser extends User {
  username: string
  is_active: boolean
  is_deleted?: boolean
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
  unlocked: boolean
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

export interface CourseRatingChange {
  id: string
  step_id: string
  step_title: string
  attempt_number: number
  status: SubmissionStatus
  delta: number
  reason: string
  created_at: string
}

export interface CourseRatingLeader {
  place: number
  display_name: string
  rating: number
  is_current_user: boolean
}

export interface CourseRating {
  rating: number
  place: number | null
  participant_count: number
  top: CourseRatingLeader[]
  recent_changes: CourseRatingChange[]
  total_changes: number
  award_per_score_point: number
  wrong_attempt_penalty: number
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
  feedback_after_incorrect?: string
  statement?: string
  tests?: Array<{ input: string; output: string }>
  time_limit_ms?: number
  memory_limit_mb?: number
  instructions?: string
  required_evidence?: Array<'file' | 'url' | 'explanation'>
  review_criteria?: string
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

export type StudentStepSummary = Omit<Step, 'content'>

export interface StudentModuleSummary {
  id: string
  source_id: string
  position: number
  title: string
  steps: StudentStepSummary[]
}

export interface CourseModule {
  id: string
  source_id: string
  position: number
  title: string
  steps: Step[]
}

export interface StudentCourse {
  id: string
  course_id: string
  version: number
  title: string
  description: string
  grade_min?: number
  grade_max?: number
  tool?: string
  goal?: string
  volume?: string
  banner_url?: string | null
  status: 'active' | 'paused' | 'completed'
  assigned_at: string
  progress: Omit<Progress, 'steps'>
}

export interface StudentEnrollment extends StudentCourse {
  course_revision_id: string
  steps: StudentStepSummary[]
  modules?: StudentModuleSummary[]
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
  revision_version?: number
  status: SubmissionStatus
  attempt_number: number
  score: number | null
  max_score: number
  feedback: string | null
  created_at: string
  safe_diagnostics?: Record<string, unknown>
  artifact_url?: string
  download_url?: string
  image_preview_url?: string | null
  explanation?: string | null
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
  messages?: StepQuestionMessage[]
}

export interface StepQuestionMessage {
  id: string
  sender: User
  body: string
  created_at: string
}

export interface Course {
  id: string
  source_id?: string | null
  title: string
  description: string
  grade_min: number
  grade_max: number
  tool?: string
  goal?: string
  volume?: string
  banner_url?: string | null
  is_archived?: boolean
  latest_version: number | null
  draft_steps_count?: number
  draft_steps?: Step[]
  modules?: CourseModule[]
  created_at?: string
  updated_at?: string
}

export interface CoursePreview {
  id: string
  source_id?: string | null
  title: string
  description: string
  grade_min: number
  grade_max: number
  tool?: string
  goal?: string
  volume?: string
  banner_url?: string | null
  steps: Step[]
  modules?: CourseModule[]
}

export interface CourseRevision extends CoursePreview {
  version: number
  published_at: string
}

export interface StepTypeInfo {
  type_key: StepType
  schema_version: number
  title: string
  checking_mode: 'instant' | 'manual'
}

export interface AdminEnrollment {
  id: string
  revision: CourseRevision
  student: User
  curator: User
  status: string
  assigned_at: string
}

export interface LagSignal {
  reason?: string
  code?: string
  since?: string
  at?: string
}

export interface CuratorStudentProgress extends Progress {
  lag_signals?: LagSignal[]
}

export interface CuratorStudent extends User {
  lag_signals?: LagSignal[]
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
