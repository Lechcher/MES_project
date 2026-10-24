/**
 * Settings & IAM GraphQL operations (`API_CONTACT_SPECIFICATION.md` §6.4).
 */

import { DEPARTMENT_BRIEF, USER_BRIEF, USER_REF } from "./common";

export const USERS_QUERY = /* GraphQL */ `
  query Users($filter: UserFilter, $offset: Int, $limit: Int) {
    users(filter: $filter, offset: $offset, limit: $limit) {
      nodes {
        ${USER_REF}
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

export const ROLES_QUERY = /* GraphQL */ `
  query Roles {
    roles {
      id
      code
      name
      description
      permissions {
        id
        code
        moduleCode
        description
      }
    }
  }
`;

export const PERMISSIONS_QUERY = /* GraphQL */ `
  query Permissions {
    permissions {
      id
      code
      moduleCode
      description
    }
  }
`;

export const SYSTEM_AUDIT_LOGS_QUERY = /* GraphQL */ `
  query SystemAuditLogs($filter: AuditLogFilter, $offset: Int, $limit: Int) {
    systemAuditLogs(filter: $filter, offset: $offset, limit: $limit) {
      nodes {
        id
        action
        resourceType
        resourceId
        oldData
        newData
        ipAddress
        userAgent
        createdAt
        user {
          ${USER_BRIEF}
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

export const TELEGRAM_WEBHOOK_QUERY = /* GraphQL */ `
  query TelegramWebhookConfig {
    telegramWebhookConfig {
      botToken
      alertGroupChatId
      webhookUrl
      isEnabled
    }
  }
`;

/* ──────────────────────────── Mutations ─────────────────────────── */

export const CREATE_USER_MUTATION = /* GraphQL */ `
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      ${USER_REF}
    }
  }
`;

export const UPDATE_USER_MUTATION = /* GraphQL */ `
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      ${USER_REF}
    }
  }
`;

export const RESET_USER_PASSWORD_MUTATION = /* GraphQL */ `
  mutation ResetUserPassword($userId: ID!, $newPassword: String!) {
    resetUserPassword(userId: $userId, newPassword: $newPassword)
  }
`;

export const DEACTIVATE_USER_MUTATION = /* GraphQL */ `
  mutation DeactivateUser($userId: ID!) {
    deactivateUser(userId: $userId) {
      ${USER_REF}
    }
  }
`;

export const CREATE_DEPARTMENT_MUTATION = /* GraphQL */ `
  mutation CreateDepartment($input: CreateDepartmentInput!) {
    createDepartment(input: $input) {
      id
      code
      name
      departmentType
      autoForkingEnabled
      isActive
      parent {
        ${DEPARTMENT_BRIEF}
      }
    }
  }
`;

export const UPDATE_DEPARTMENT_MUTATION = /* GraphQL */ `
  mutation UpdateDepartment($input: UpdateDepartmentInput!) {
    updateDepartment(input: $input) {
      id
      code
      name
      departmentType
      autoForkingEnabled
      isActive
      parent {
        ${DEPARTMENT_BRIEF}
      }
    }
  }
`;

export const UPDATE_ROLE_PERMISSIONS_MUTATION = /* GraphQL */ `
  mutation UpdateRolePermissions($input: UpdateRolePermissionsInput!) {
    updateRolePermissions(input: $input) {
      id
      code
      name
      permissions {
        id
        code
        moduleCode
        description
      }
    }
  }
`;

export const UPDATE_TELEGRAM_WEBHOOK_MUTATION = /* GraphQL */ `
  mutation UpdateTelegramWebhookConfig(
    $input: UpdateTelegramWebhookConfigInput!
  ) {
    updateTelegramWebhookConfig(input: $input) {
      botToken
      alertGroupChatId
      webhookUrl
      isEnabled
    }
  }
`;
