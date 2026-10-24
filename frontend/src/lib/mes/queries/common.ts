/**
 * Shared GraphQL field selections and documents consumed by more than one app.
 */

export const USER_BRIEF = /* GraphQL */ `
  id
  userCode
  fullName
  email
  department {
    id
    code
    name
  }
`;

export const USER_REF = /* GraphQL */ `
  id
  userCode
  fullName
  email
  isActive
  department {
    id
    code
    name
  }
  roles {
    id
    code
    name
  }
`;

export const DEPARTMENT_BRIEF = /* GraphQL */ `
  id
  code
  name
  departmentType
`;

export const EXPORT_RESULT_FIELDS = /* GraphQL */ `
  id
  fileName
  mimeType
  format
  url
  createdAt
`;

export const DEPARTMENTS_QUERY = /* GraphQL */ `
  query Departments {
    departments {
      id
      code
      name
      departmentType
      parent {
        id
        code
        name
      }
      manager {
        ${USER_BRIEF}
      }
      autoForkingEnabled
      isActive
    }
  }
`;

export const TICKET_STATES_QUERY = /* GraphQL */ `
  query TicketStates {
    ticketStates {
      code
      name
      color
      description
      isTerminal
      sortOrder
    }
  }
`;

export const LEAVE_CODES_QUERY = /* GraphQL */ `
  query LeaveCodes {
    leaveCodes {
      code
      name
      category
      isPaid
      payrollRule
      deductsWage
      isPenalty
      isBalanceTracked
      sortOrder
    }
  }
`;
