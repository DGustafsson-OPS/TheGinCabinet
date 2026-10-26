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

// ---------- Editorial ----------

export type Media = {
  id: string;
  url: string;
  original_filename: string | null;
  mime: string;
  width: number;
  height: number;
  size_bytes: number;
  alt: string | null;
  decorative: boolean;
  credit: string | null;
  rights: string | null;
  uploaded_by_id: string | null;
  version: number;
  created_at: string;
  used_by: string[];
};

export type MediaSummary = { id: string; url: string; alt: string | null; width: number; height: number };

export const FLAVOURS = ["juniper", "citrus", "floral", "spice", "herbal", "sweetness"] as const;
export type Flavour = (typeof FLAVOURS)[number];

export type Person = { id: string; display_name: string };

export type Tasting = {
  id: string;
  gin: GinSummary;
  author: Person;
  bottle_id: string | null;
  tasted_on: string;
  context: string | null;
  nose: string | null;
  palate: string | null;
  finish: string | null;
  flavours: Partial<Record<Flavour, number>>;
  rating: string | null;
  tonic: string | null;
  garnish: string | null;
  private_notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ReviewStatus = "draft" | "ready" | "published" | "archived";

export type Review = {
  id: string;
  gin: GinSummary;
  gin_public: boolean;
  author: Person;
  tasting_id: string | null;
  slug: string;
  status: ReviewStatus;
  title: string;
  rating: string | null;
  intro: string | null;
  nose: string | null;
  palate: string | null;
  finish: string | null;
  tonic: string | null;
  garnish: string | null;
  verdict: string | null;
  cover_media_id: string | null;
  cover_image: MediaSummary | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type Revision = {
  id: string;
  revision_number: number;
  actor_id: string | null;
  status: ReviewStatus;
  note: string | null;
  saved_at: string;
  snapshot: Record<string, unknown>;
};

export type PublicGinRef = { slug: string; display_name: string; country: string | null; abv: string };

export type PublicReviewCard = {
  slug: string;
  title: string;
  author_name: string;
  published_at: string;
  rating: string | null;
  teaser: string;
  cover: MediaSummary | null;
  gin: PublicGinRef;
};

export type PublicReview = PublicReviewCard & {
  intro: string | null;
  nose: string | null;
  palate: string | null;
  finish: string | null;
  tonic: string | null;
  garnish: string | null;
  verdict: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
};
