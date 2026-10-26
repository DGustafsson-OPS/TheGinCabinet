// TypeScript shapes of the JSON the API returns. They mirror the Pydantic
// schemas in apps/api/app/schemas (spec §10: later generated automatically
// into packages/shared from the API's OpenAPI description).

export type ApiErrorBody = {
  error: { code: string; message: string; details: unknown };
};

export type User = {
  id: string;
  username: string;
  display_name: string;
  email: string;
};

export type Session = {
  authenticated: boolean;
  mfa_pending: boolean;
  user: User | null;
  csrf_token: string | null;
  expires_at: string | null;
};

export type AuditEvent = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  occurred_at: string;
  summary: Record<string, unknown>;
};

export type InventoryValue = {
  currency: string;
  amount: string; // exact decimal sent as a string, e.g. "1299.00"
  bottles: number;
};

export type Dashboard = {
  unique_gins: number;
  physical_bottles: number;
  open_bottles: number;
  inventory_value: InventoryValue[];
  bottles_without_cost: number;
  public_gins: number;
  wishlist_wanted: number;
  recent_activity: AuditEvent[];
};
