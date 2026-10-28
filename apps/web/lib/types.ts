// TypeScript shapes of the JSON the API returns. They mirror the Pydantic
// schemas in apps/api/app/schemas (spec §10: later generated automatically
// into packages/shared from the API's OpenAPI description).

export type ApiErrorBody = {
  error: { code: string; message: string; details: unknown };
};

/** "admin": everything. "editor": content only (see apps/api/app/models/user.py). */
export type Role = "admin" | "editor";

export type User = {
  id: string;
  username: string;
  display_name: string;
  email: string;
  role: Role;
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
  ip_address: string | null;
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
  images: MediaSummary[];
  bottles_in_cabinet: number;
  bottles_total: number;
  /** Average of the published reviews (the public figure), out of 10. */
  review_rating: string | null;
  review_count: number;
  /** Average of the private tastings, out of 10. */
  tasting_rating: string | null;
  tasting_count: number;
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
  /** A readable name for the library, e.g. "Hernö Navy Strength bottle". */
  name: string | null;
  /** Where it's filed, e.g. "Gins/Hernö" ("/" separates subfolders); null = not filed. */
  folder: string | null;
  mime: string;
  width: number;
  height: number;
  size_bytes: number;
  alt: string | null;
  decorative: boolean;
  credit: string | null;
  rights: string | null;
  uploaded_by_id: string | null;
  /** Small "© site name" mark in the bottom-right corner of the version the website shows. */
  watermark: boolean;
  /** Small "AI-generated" label in the bottom-left corner. */
  ai_generated: boolean;
  version: number;
  created_at: string;
  used_by: string[];
};

export type MediaFolder = { path: string; count: number };

export type MediaBulkResult = { changed: number; skipped: { id: string; name: string | null; reason: string }[] };

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
  tonic_id: string | null;
  linked_tonic: { id: string; slug: string; display_name: string; public_visible: boolean } | null;
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
  /** Set only when the linked tonic is public (its page exists). */
  tonic_link: { slug: string; display_name: string } | null;
  garnish: string | null;
  verdict: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
};

// ---------- Cocktails ----------

export const UNITS = [
  "ml", "cl", "g", "tsp", "tbsp", "barspoon", "dash", "drop",
  "piece", "slice", "wedge", "sprig", "leaf", "top up",
] as const;
export type Unit = (typeof UNITS)[number];
export const METHODS = ["build", "shake", "stir", "blend"] as const;
export const DIFFICULTIES = ["easy", "medium", "advanced"] as const;

export type IngredientLine = {
  name: string;
  quantity: string | null; // exact decimal as text, e.g. "50" or "1.5"
  unit: Unit;
  note: string | null;
  optional: boolean;
};

export type Pairing = {
  gin: GinSummary;
  gin_public: boolean;
  priority: number;
  pairing_note: string | null;
};

export type CocktailStatus = "draft" | "published" | "archived";

export type Cocktail = {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  method: (typeof METHODS)[number];
  glassware: string | null;
  prep_minutes: number | null;
  difficulty: (typeof DIFFICULTIES)[number];
  servings_base: number;
  garnish: string | null;
  garnish_quantity: string | null;
  tags: string[];
  status: CocktailStatus;
  author: Person;
  cover_media_id: string | null;
  cover_image: MediaSummary | null;
  seo_title: string | null;
  seo_description: string | null;
  ingredients: IngredientLine[];
  steps: string[];
  gins: Pairing[];
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type PublicCocktailCard = {
  slug: string;
  title: string;
  teaser: string;
  method: string;
  difficulty: string;
  prep_minutes: number | null;
  glassware: string | null;
  tags: string[];
  cover: MediaSummary | null;
};

export type PublicCocktail = PublicCocktailCard & {
  intro: string | null;
  servings: number;
  servings_base: number;
  ingredients: IngredientLine[];
  garnish: string | null;
  garnish_quantity: string | null;
  steps: string[];
  recommended_gins: { slug: string; display_name: string; country: string | null; abv: string; pairing_note: string | null }[];
  seo_title: string | null;
  seo_description: string | null;
  published_at: string;
  updated_at: string;
};

// ---------- Public catalogue ----------

export type PublicGinCard = {
  slug: string;
  display_name: string;
  brand: string;
  style: string;
  abv: string;
  country: string | null;
  distillery: { slug: string; name: string; country: string | null } | null;
  image: MediaSummary | null;
  collection_status: "owned" | "previously_owned" | null;
  rating: string | null;
  review_count: number;
};

export type PublicGin = PublicGinCard & {
  edition: string;
  description: string | null;
  botanicals: string[];
  images: MediaSummary[];
  reviews: PublicReviewCard[];
  cocktails: PublicCocktailCard[];
  related: PublicGinCard[];
  updated_at: string;
};

export type Facets = { styles: string[]; countries: string[]; botanicals: string[] };

export type PublicDistilleryCard = {
  slug: string;
  name: string;
  country: string | null;
  region: string | null;
  gin_count: number;
};

export type PublicDistillery = PublicDistilleryCard & {
  description: string | null;
  website: string | null;
  gins: PublicGinCard[];
};

export type PublicStats = { gins: number; reviews: number; cocktails: number; countries: number };

// ---------------- Gin Journal (spec §10A) ----------------

export type PostStatus = "draft" | "scheduled" | "published" | "archived";
export type RelationKind = "gin" | "review" | "cocktail" | "post";

/** One block of an article body, as the editor stores it. */
/** Where a photo sits: across the text, or beside it with the text flowing around. */
export type ImageAlign = "full" | "left" | "right";

export type PostBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string; cite?: string | null }
  | { type: "image"; media_id: string; caption?: string | null; align?: ImageAlign }
  | { type: "card"; kind: RelationKind; id: string };

export type CategoryRef = { id: string; name: string; slug: string };
export type Category = CategoryRef & {
  description: string | null;
  display_order: number;
  post_count: number;
  version: number;
};

export type Relation = { kind: RelationKind; id: string; label: string; public: boolean };

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_blocks: PostBlock[];
  status: PostStatus;
  is_live: boolean;
  author: Person;
  edited_by: Person | null;
  category: CategoryRef | null;
  tags: string[];
  hero_media_id: string | null;
  hero_image: MediaSummary | null;
  hero_credit: string | null;
  social_media_id: string | null;
  featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  relations: Relation[];
  reading_minutes: number;
  published_at: string | null;
  scheduled_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type PublicPostCard = {
  slug: string;
  title: string;
  excerpt: string | null;
  category: { name: string; slug: string } | null;
  tags: { name: string; slug: string }[];
  author_name: string;
  published_at: string | null;
  reading_minutes: number;
  image: MediaSummary | null;
  featured: boolean;
};

/** A block ready to display: images and cards are filled in by the API. */
export type PublicBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string; cite?: string | null }
  | { type: "image"; image: MediaSummary; caption: string | null; align?: ImageAlign }
  | { type: "card"; kind: "gin"; card: PublicGinCard }
  | { type: "card"; kind: "review"; card: PublicReviewCard }
  | { type: "card"; kind: "cocktail"; card: PublicCocktailCard }
  | { type: "card"; kind: "post"; card: PublicPostCard };

export type PublicPost = PublicPostCard & {
  body: PublicBlock[];
  hero_credit: string | null;
  seo_title: string | null;
  seo_description: string | null;
  social_image: MediaSummary | null;
  updated_at: string;
  gins: PublicGinCard[];
  reviews: PublicReviewCard[];
  cocktails: PublicCocktailCard[];
  related: PublicPostCard[];
};

export type PublicCategory = { name: string; slug: string; description: string | null; post_count: number };
export type PublicTag = { name: string; slug: string; post_count: number };

// ---------------- Settings & admins (spec A10) ----------------

export type SiteSettings = {
  site_name: string;
  tagline: string | null;
  meta_description: string | null;
  contact_email: string | null;
  logo_media_id: string | null;
  logo: MediaSummary | null;
  default_gin_public: boolean;
  version: number;
  updated_at: string;
};

export type PublicSite = Omit<SiteSettings, "logo_media_id" | "default_gin_public" | "version" | "updated_at"> & {
  /** The editable page texts (Admin → Page texts), defaults filled in. */
  texts: Record<string, string>;
  /** The contact form is switched on (Cloudflare Turnstile keys set). */
  contact_form: boolean;
  has_guide: boolean;
};

export type PageText = {
  key: string;
  page: string;
  label: string;
  hint: string;
  formatted: boolean;
  max_length: number;
  default: string;
  value: string;
  customised: boolean;
  version: number;
  updated_at: string | null;
  updated_by: string | null;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

export type Profile = {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: Role;
  last_login_at: string | null;
  recovery_codes_left: number;
  mfa_setup_pending: boolean;
  notices: { action: string; by: string; at: string }[];
};

export type AdminAccount = {
  id: string;
  username: string;
  display_name: string;
  email: string;
  role: Role;
  enabled: boolean;
  last_login_at: string | null;
  invite_pending: boolean;
  invite_expires_at: string | null;
  is_you: boolean;
};

export type InviteOut = { account: AdminAccount; invite_path: string; expires_at: string };

export type InviteInfo = { username: string; display_name: string; role: Role; expires_at: string };

export type ConsentStats = {
  days: number;
  total: number;
  analytics_allowed: number;
  analytics_refused: number;
  by_action: Record<string, number>;
};

// ---------------- Tonics (a simple catalogue: no stock) ----------------

export const TONIC_STYLES = ["indian", "light", "mediterranean", "aromatic", "flavoured", "other"] as const;
export type TonicStyle = (typeof TONIC_STYLES)[number];

export type TonicReview = {
  id: string;
  author: Person;
  rating: string | null;
  notes: string | null;
  pairs_with: string | null;
  status: "draft" | "published";
  published_at: string | null;
  version: number;
  updated_at: string;
};

export type Tonic = {
  id: string;
  slug: string;
  brand: string;
  name: string;
  display_name: string;
  style: TonicStyle;
  country: string | null;
  flavour_notes: string[];
  description: string | null;
  image_media_id: string | null;
  image: MediaSummary | null;
  public_visible: boolean;
  reviews: TonicReview[];
  version: number;
  created_at: string;
  updated_at: string;
};

export type PublicTonicCard = {
  slug: string;
  brand: string;
  display_name: string;
  style: TonicStyle;
  country: string | null;
  image: MediaSummary | null;
  rating: string | null;
  review_count: number;
};

export type PublicTonic = PublicTonicCard & {
  flavour_notes: string[];
  description: string | null;
  reviews: { author_name: string; rating: string | null; notes: string | null; pairs_with: string | null; published_at: string | null }[];
  /** Published gin reviews that name this tonic as the perfect serve. */
  gin_reviews: PublicReviewCard[];
  updated_at: string;
};

// ---------------- Gin guide ----------------

/** A Gin guide page as the admin editor sees it. */
export type GuidePage = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body_blocks: PostBlock[];
  hero_media_id: string | null;
  hero_image: MediaSummary | null;
  hero_credit: string | null;
  seo_title: string | null;
  seo_description: string | null;
  position: number;
  published: boolean;
  published_at: string | null;
  edited_by: Person | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type PublicGuideCard = { slug: string; title: string; summary: string | null; image: MediaSummary | null };

export type PublicGuidePage = PublicGuideCard & {
  body: PublicBlock[];
  hero_credit: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
  previous: PublicGuideCard | null;
  next: PublicGuideCard | null;
};
