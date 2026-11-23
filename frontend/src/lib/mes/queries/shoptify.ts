/**
 * Shopify commerce GraphQL operations.
 *
 * Documents only — the fetch/execute layer lives in `./use-api` and
 * `../client`, exactly like the other modules' query files.
 */

const SHOPTIFY_STORE_FIELDS = /* GraphQL */ `
  id
  name
  shopDomain
  currency
  scopes
  isActive
  lastSyncAt
  createdAt
  updatedAt
`;

const SHOPTIFY_FULFILLMENT_FIELDS = /* GraphQL */ `
  id
  shopifyFulfillmentId
  trackingCompany
  trackingNumber
  trackingUrl
  shipmentStatus
  createdAt
`;

const SHOPTIFY_REFUND_FIELDS = /* GraphQL */ `
  id
  shopifyRefundId
  amount
  currency
  reason
  createdAt
`;

const SHOPTIFY_ORDER_FIELDS = /* GraphQL */ `
  id
  storeId
  storeName
  shopifyOrderId
  orderNumber
  customerEmail
  customerPhone
  shippingAddress
  financialStatus
  fulfillmentStatus
  totalPrice
  currency
  tags
  note
  hasException
  exceptionReason
  netProfit
  shopifyCreatedAt
  createdAt
  updatedAt
  fulfillments {
    ${SHOPTIFY_FULFILLMENT_FIELDS}
  }
  refunds {
    ${SHOPTIFY_REFUND_FIELDS}
  }
`;

const SHOPTIFY_VARIANT_FIELDS = /* GraphQL */ `
  id
  productId
  storeId
  storeName
  shopifyVariantId
  sku
  masterSku
  price
  costOfGoods
  availableQuantity
  minStockLevel
  isLowStock
`;

const SHOPTIFY_PAGE_INFO = /* GraphQL */ `
  offset
  limit
  totalCount
  hasNextPage
`;

export const SHOPTIFY_STORES_QUERY = /* GraphQL */ `
  query ShoptifyStores {
    shoptifyStores {
      ${SHOPTIFY_STORE_FIELDS}
    }
  }
`;

export const SHOPTIFY_ORDERS_QUERY = /* GraphQL */ `
  query ShoptifyOrders($filter: ShoptifyOrderFilter, $offset: Int, $limit: Int) {
    shoptifyOrders(filter: $filter, offset: $offset, limit: $limit) {
      nodes {
        ${SHOPTIFY_ORDER_FIELDS}
      }
      pageInfo {
        ${SHOPTIFY_PAGE_INFO}
      }
    }
  }
`;

export const SHOPTIFY_ORDER_QUERY = /* GraphQL */ `
  query ShoptifyOrder($id: ID!) {
    shoptifyOrder(id: $id) {
      ${SHOPTIFY_ORDER_FIELDS}
    }
  }
`;

export const SHOPTIFY_PRODUCTS_QUERY = /* GraphQL */ `
  query ShoptifyProducts($filter: ShoptifyProductFilter, $offset: Int, $limit: Int) {
    shoptifyProducts(filter: $filter, offset: $offset, limit: $limit) {
      nodes {
        id
        storeId
        shopifyProductId
        title
        status
        updatedAt
        variants {
          ${SHOPTIFY_VARIANT_FIELDS}
        }
      }
      pageInfo {
        ${SHOPTIFY_PAGE_INFO}
      }
    }
  }
`;

export const SHOPTIFY_CUSTOMERS_QUERY = /* GraphQL */ `
  query ShoptifyCustomers($filter: ShoptifyCustomerFilter, $offset: Int, $limit: Int) {
    shoptifyCustomers(filter: $filter, offset: $offset, limit: $limit) {
      nodes {
        id
        email
        phone
        totalOrdersCount
        totalSpent
        isBlacklisted
        isHighRisk
        notes
      }
      pageInfo {
        ${SHOPTIFY_PAGE_INFO}
      }
    }
  }
`;

export const SHOPTIFY_PAYOUTS_QUERY = /* GraphQL */ `
  query ShoptifyPayouts($storeId: ID, $offset: Int, $limit: Int) {
    shoptifyPayouts(storeId: $storeId, offset: $offset, limit: $limit) {
      nodes {
        id
        storeId
        storeName
        shopifyPayoutId
        amount
        currency
        status
        payoutDate
        createdAt
      }
      pageInfo {
        ${SHOPTIFY_PAGE_INFO}
      }
    }
  }
`;

export const SHOPTIFY_RULES_QUERY = /* GraphQL */ `
  query ShoptifyAutomationRules($storeId: ID) {
    shoptifyAutomationRules(storeId: $storeId) {
      id
      name
      storeId
      storeName
      triggerEvent
      conditions
      actions
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const SHOPTIFY_BEGIN_OAUTH_MUTATION = /* GraphQL */ `
  mutation ShoptifyBeginOAuth($shopDomain: String!) {
    shoptifyBeginOAuth(shopDomain: $shopDomain) {
      redirectUrl
    }
  }
`;

export const SHOPTIFY_CONNECT_STORE_MUTATION = /* GraphQL */ `
  mutation ShoptifyConnectStore($input: ShoptifyConnectStoreInput!) {
    shoptifyConnectStore(input: $input) {
      ${SHOPTIFY_STORE_FIELDS}
    }
  }
`;

export const SHOPTIFY_DEACTIVATE_STORE_MUTATION = /* GraphQL */ `
  mutation ShoptifyDeactivateStore($storeId: ID!) {
    shoptifyDeactivateStore(storeId: $storeId) {
      ${SHOPTIFY_STORE_FIELDS}
    }
  }
`;

export const SHOPTIFY_UPDATE_ORDER_FLAGS_MUTATION = /* GraphQL */ `
  mutation ShoptifyUpdateOrderFlags($input: ShoptifyOrderFlagsInput!) {
    shoptifyUpdateOrderFlags(input: $input) {
      id
      tags
      note
      hasException
      exceptionReason
    }
  }
`;

export const SHOPTIFY_BULK_FULFILL_MUTATION = /* GraphQL */ `
  mutation ShoptifyBulkFulfill($input: ShoptifyBulkFulfillInput!) {
    shoptifyBulkFulfill(input: $input) {
      succeeded {
        ... on ShoptifyFulfillment {
          ${SHOPTIFY_FULFILLMENT_FIELDS}
        }
      }
      failed {
        orderId
        message
      }
    }
  }
`;

export const SHOPTIFY_UPDATE_VARIANT_MUTATION = /* GraphQL */ `
  mutation ShoptifyUpdateVariant($input: ShoptifyInventoryUpdateInput!) {
    shoptifyUpdateVariant(input: $input) {
      ${SHOPTIFY_VARIANT_FIELDS}
    }
  }
`;

export const SHOPTIFY_SET_CUSTOMER_FLAGS_MUTATION = /* GraphQL */ `
  mutation ShoptifySetCustomerFlags($input: ShoptifyCustomerFlagInput!) {
    shoptifySetCustomerFlags(input: $input) {
      id
      isBlacklisted
      isHighRisk
      notes
    }
  }
`;

export const SHOPTIFY_SET_ORDER_EXPENSES_MUTATION = /* GraphQL */ `
  mutation ShoptifySetOrderExpenses($input: ShoptifyOrderExpensesInput!) {
    shoptifySetOrderExpenses(input: $input) {
      id
      netProfit
    }
  }
`;

export const SHOPTIFY_RECORD_PAYOUT_MUTATION = /* GraphQL */ `
  mutation ShoptifyRecordPayout($input: ShoptifyPayoutInput!) {
    shoptifyRecordPayout(input: $input) {
      id
      status
      amount
      currency
      payoutDate
    }
  }
`;

export const SHOPTIFY_SAVE_RULE_MUTATION = /* GraphQL */ `
  mutation ShoptifySaveRule($input: ShoptifySaveRuleInput!) {
    shoptifySaveRule(input: $input) {
      id
      name
      storeId
      triggerEvent
      conditions
      actions
      isActive
    }
  }
`;

export const SHOPTIFY_DELETE_RULE_MUTATION = /* GraphQL */ `
  mutation ShoptifyDeleteRule($ruleId: ID!) {
    shoptifyDeleteRule(ruleId: $ruleId)
  }
`;

export const SHOPTIFY_EXPORT_ORDERS_MUTATION = /* GraphQL */ `
  mutation ShoptifyExportOrders($filter: ShoptifyOrderFilter, $format: ExportFormat) {
    shoptifyExportOrders(filter: $filter, format: $format) {
      id
      fileName
      mimeType
      format
      url
    }
  }
`;

export const SHOPTIFY_EXPORT_PRODUCTS_MUTATION = /* GraphQL */ `
  mutation ShoptifyExportProducts($filter: ShoptifyProductFilter, $format: ExportFormat) {
    shoptifyExportProducts(filter: $filter, format: $format) {
      id
      fileName
      mimeType
      format
      url
    }
  }
`;
