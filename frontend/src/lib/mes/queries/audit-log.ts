/**
 * Audit Log GraphQL operations (`API_CONTACT_SPECIFICATION.md` §6.5).
 *
 * The store is append-only: these operations only read the stream/summaries or
 * export the currently filtered events. No operation edits or deletes events.
 */

import { EXPORT_RESULT_FIELDS, USER_BRIEF } from "./common";

export const AUDIT_LOGS_QUERY = /* GraphQL */ `
  query AuditLogs($filter: ModuleAuditFilter, $offset: Int, $limit: Int) {
    auditLogs(filter: $filter, offset: $offset, limit: $limit) {
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

export const MODULE_ACTIVITY_QUERY = /* GraphQL */ `
  query ModuleActivity($filter: ModuleAuditFilter) {
    moduleActivity(filter: $filter) {
      moduleCode
      moduleName
      eventCount
      lastActivityAt
    }
  }
`;

export const EXPORT_AUDIT_LOGS_MUTATION = /* GraphQL */ `
  mutation ExportAuditLogs($filter: ModuleAuditFilter, $format: ExportFormat) {
    exportAuditLogs(filter: $filter, format: $format) {
      ${EXPORT_RESULT_FIELDS}
    }
  }
`;
