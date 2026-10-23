/**
 * Jobs & Projects GraphQL operations (`API_CONTACT_SPECIFICATION.md` §6.1 and
 * the print/export operations in §7.2).
 */

import { DEPARTMENT_BRIEF, EXPORT_RESULT_FIELDS, USER_BRIEF } from "./common";

export const TASK_SUMMARY_FIELDS = /* GraphQL */ `
  id
  taskCode
  title
  description
  taskType
  priority
  state
  progressPercentage
  plannedStageCount
  isUrgentHourly
  isExtensionRequested
  isOverdue
  badges
  startDate
  endDate
  extendedDeadline
  approvedAt
  reviewedAt
  createdAt
  updatedAt
  project {
    id
    code
    name
  }
  assignedTo {
    ${USER_BRIEF}
  }
  createdBy {
    ${USER_BRIEF}
  }
  department {
    ${DEPARTMENT_BRIEF}
  }
`;

export const TASKS_QUERY = /* GraphQL */ `
  query Tasks($filter: TaskFilter, $orderBy: TaskOrderBy, $offset: Int, $limit: Int) {
    tasks(filter: $filter, orderBy: $orderBy, offset: $offset, limit: $limit) {
      nodes {
        ${TASK_SUMMARY_FIELDS}
      }
      pageInfo {
        offset
        limit
        totalCount
        hasNextPage
      }
    }
  }
`;

export const TASK_QUERY = /* GraphQL */ `
  query Task($id: ID!) {
    task(id: $id) {
      ${TASK_SUMMARY_FIELDS}
      approvedBy {
        ${USER_BRIEF}
      }
      reviewedBy {
        ${USER_BRIEF}
      }
      progressLogs {
        id
        previousPercentage
        newPercentage
        logComment
        isVerifiedByManager
        createdAt
        user {
          ${USER_BRIEF}
        }
      }
      stateTransitions {
        id
        fromState
        toState
        reason
        createdAt
        actor {
          ${USER_BRIEF}
        }
      }
      requests {
        id
        requestType
        requestedDeadline
        reason
        status
        reviewComment
        reviewedAt
        createdAt
        user {
          ${USER_BRIEF}
        }
        reviewedBy {
          ${USER_BRIEF}
        }
      }
      journey {
        id
        scope
        title
        description
        declaredProgress
        plannedStageCount
        state
        reviewComment
        reviewedAt
        createdAt
        updatedAt
        user {
          ${USER_BRIEF}
        }
        reviewedBy {
          ${USER_BRIEF}
        }
        attachments {
          id
          url
          fileName
          mimeType
          sizeBytes
          createdAt
        }
        decisionAttachments {
          id
          url
          fileName
          mimeType
          sizeBytes
          createdAt
        }
      }
      attachments {
        id
        url
        fileName
        mimeType
        sizeBytes
        createdAt
      }
    }
  }
`;

export const PROJECTS_QUERY = /* GraphQL */ `
  query Projects($filter: ProjectFilter) {
    projects(filter: $filter, orderBy: NAME_ASC, limit: 100) {
      nodes {
        id
        code
        name
        description
        isActive
        department {
          ${DEPARTMENT_BRIEF}
        }
      }
      pageInfo {
        offset
        limit
        totalCount
        hasNextPage
      }
    }
  }
`;

/**
 * Task list including nested requests — used by the Planning Approval Board to
 * surface pending extension and late-submission requests (the contract has no
 * standalone request-list query).
 */
export const TASKS_WITH_REQUESTS_QUERY = /* GraphQL */ `
  query TasksWithRequests($filter: TaskFilter, $offset: Int, $limit: Int) {
    tasks(filter: $filter, offset: $offset, limit: $limit) {
      nodes {
        id
        taskCode
        title
        state
        priority
        isOverdue
        endDate
        extendedDeadline
        assignedTo {
          ${USER_BRIEF}
        }
        department {
          ${DEPARTMENT_BRIEF}
        }
        requests {
          id
          requestType
          requestedDeadline
          reason
          status
          createdAt
          updatedAt
          user {
            ${USER_BRIEF}
          }
          reviewedBy {
            ${USER_BRIEF}
          }
        }
      }
      pageInfo {
        offset
        limit
        totalCount
        hasNextPage
      }
    }
  }
`;

/* ──────────────────────────── Mutations ─────────────────────────── */

export const CREATE_TASK_MUTATION = /* GraphQL */ `
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const ACCEPT_TASK_MUTATION = /* GraphQL */ `
  mutation AcceptTask($taskId: ID!) {
    acceptTask(taskId: $taskId) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const LOG_TASK_PROGRESS_MUTATION = /* GraphQL */ `
  mutation LogTaskProgress($input: LogTaskProgressInput!) {
    logTaskProgress(input: $input) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const SUBMIT_TASK_REPORT_MUTATION = /* GraphQL */ `
  mutation SubmitTaskReport($input: SubmitTaskReportInput!) {
    submitTaskReport(input: $input) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const APPROVE_TASK_MUTATION = /* GraphQL */ `
  mutation ApproveTask($taskId: ID!) {
    approveTask(taskId: $taskId) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const RETURN_TASK_MUTATION = /* GraphQL */ `
  mutation ReturnTask($taskId: ID!, $reason: String!) {
    returnTask(taskId: $taskId, reason: $reason) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const CANCEL_TASK_MUTATION = /* GraphQL */ `
  mutation CancelTask($input: CancelTaskInput!) {
    cancelTask(input: $input) {
      ${TASK_SUMMARY_FIELDS}
    }
  }
`;

export const REQUEST_EXTENSION_MUTATION = /* GraphQL */ `
  mutation RequestExtension($input: RequestExtensionInput!) {
    requestExtension(input: $input) {
      id
      requestType
      requestedDeadline
      reason
      status
      createdAt
    }
  }
`;

export const EXPLAIN_LATE_SUBMISSION_MUTATION = /* GraphQL */ `
  mutation ExplainLateSubmission($input: ExplainLateSubmissionInput!) {
    explainLateSubmission(input: $input) {
      id
      requestType
      reason
      status
      createdAt
    }
  }
`;

export const REVIEW_TASK_REQUEST_MUTATION = /* GraphQL */ `
  mutation ReviewTaskRequest($input: ReviewTaskRequestInput!) {
    reviewTaskRequest(input: $input) {
      id
      requestType
      requestedDeadline
      reason
      status
      reviewComment
      reviewedAt
      task {
        id
        taskCode
        state
      }
      user {
        ${USER_BRIEF}
      }
    }
  }
`;

export const SUBMIT_TASK_COMPLETION_REQUEST_MUTATION = /* GraphQL */ `
  mutation SubmitTaskCompletionRequest(
    $input: SubmitTaskCompletionRequestInput!
  ) {
    submitTaskCompletionRequest(input: $input) {
      id
      scope
      title
      description
      declaredProgress
      plannedStageCount
      state
      createdAt
      updatedAt
      user {
        ${USER_BRIEF}
      }
      task {
        id
        taskCode
        state
        progressPercentage
        plannedStageCount
      }
    }
  }
`;

export const REVIEW_TASK_COMPLETION_REQUEST_MUTATION = /* GraphQL */ `
  mutation ReviewTaskCompletionRequest(
    $input: ReviewTaskCompletionRequestInput!
  ) {
    reviewTaskCompletionRequest(input: $input) {
      id
      scope
      title
      state
      reviewComment
      reviewedAt
      task {
        id
        taskCode
        state
        progressPercentage
      }
      user {
        ${USER_BRIEF}
      }
      reviewedBy {
        ${USER_BRIEF}
      }
    }
  }
`;

/* ───────────────────────── Print / export ───────────────────────── */

export const PRINT_TASK_SLIP_MUTATION = /* GraphQL */ `
  mutation PrintTaskSlip($taskId: ID!) {
    printTaskSlip(taskId: $taskId) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;

export const EXPORT_TASKS_MUTATION = /* GraphQL */ `
  mutation ExportTasks($filter: TaskFilter, $format: ExportFormat) {
    exportTasks(filter: $filter, format: $format) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;
