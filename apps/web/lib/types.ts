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

// ---------- Lists ----------

export type PageMeta = { page: number; page_size: number; total: number; pages: number };
export type Page<T> = { items: T[]; meta: PageMeta };

// ---------- Catalogue ----------

export const GIN_STYLES = [
  "london_dry",
  "distilled",
  "plymouth",
  "old_tom",
  "navy_strength",
  "new_western",
  "genever",
  "sloe",
  "flavoured",
  "barrel_aged",
  "other",
] as const;
export type GinStyle = (typeof GIN_STYLES)[number];

export type DistillerySummary = { id: string; slug: string; name: string };

export type Distillery = DistillerySummary & {
  country: string | null;
  region: string | null;
  description: string | null;
  website: string | null;
  gin_count: number;
  version: number;
};

export type GinSummary = { id: string; slug: string; display_name: string };

export type Gin = GinSummary & {
  brand: string;
  name: string;
  edition: string;
  style: GinStyle;
  abv: string;
  country: string | null;
  distillery: DistillerySummary | null;
  description: string | null;
  public_visible: boolean;
  botanicals: string[];
  bottles_in_cabinet: number;
  bottles_total: number;
  version: number;
  created_at: string;
  updated_at: string;
};

// ---------- Inventory ----------

export type BottleStatus = "sealed" | "open" | "empty" | "gifted" | "disposed";

export type BottleEvent = {
  id: string;
  from_status: BottleStatus | null;
  to_status: BottleStatus;
  remaining_ml: number | null;
  note: string | null;
  actor_id: string | null;
  occurred_at: string;
};

export type Bottle = {
  id: string;
  gin: GinSummary;
  size_ml: number;
  status: BottleStatus;
  remaining_ml: number | null;
  shelf: string | null;
  purchase_line_id: string | null;
  source: string | null;
  acquired_on: string | null;
  opened_at: string | null;
  finished_at: string | null;
  comments: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type BottleDetail = Bottle & { events: BottleEvent[] };

export type PurchaseLine = {
  id: string;
  gin: GinSummary;
  size_ml: number;
  quantity: number;
  unit_price: string | null;
  line_total: string | null;
};

export type Purchase = {
  id: string;
  purchased_on: string;
  retailer: string;
  currency: string;
  reference: string | null;
  notes: string | null;
  lines: PurchaseLine[];
  total: string;
  bottles_without_price: number;
  created_by_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type WishlistItem = {
  id: string;
  gin: GinSummary | null;
  text: string;
  priority: number;
  target_price: string | null;
  currency: string | null;
  notes: string | null;
  status: "wanted" | "purchased" | "dropped";
  added_by_id: string | null;
  purchase_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

/** The body of a 409 version_conflict error (see apps/api/app/services/versioning.py). */
export type ConflictDetails<T> = {
  current: T;
  diff: Record<string, { yours: unknown; current: unknown }>;
};

export type AdminName = { id: string; display_name: string };
