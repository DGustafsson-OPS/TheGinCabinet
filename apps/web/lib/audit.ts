// Readable wording for audit log actions, shared by the dashboard and the
// audit log page. Unknown actions fall back to their raw code.
import type { AuditEvent } from "./types";

export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "signed in",
  "auth.logout": "signed out",
  "gin.create": "added a gin",
  "gin.update": "edited a gin",
  "distillery.create": "added a distillery",
  "distillery.update": "edited a distillery",
  "bottle.create": "added bottles",
  "bottle.update": "updated a bottle",
  "bottle.status": "changed a bottle's status",
  "purchase.create": "recorded a purchase",
  "purchase.update": "edited a purchase",
  "wishlist.create": "added to the wishlist",
  "wishlist.update": "edited the wishlist",
  "wishlist.convert": "bought a wishlist item",
  "import.gins": "imported gins",
  "export.full": "exported all data",
  "export.gins_csv": "exported the gin list",
  "user.create": "created an admin account",
  "user.profile_update": "updated their profile",
  "user.password_change": "changed their password",
  "user.password_reset": "had their password reset on the server",
  "user.password_reset_by_admin": "reset the other admin's password",
  "user.mfa_change": "moved their sign-in codes to a new app",
  "user.mfa_reset": "had their MFA reset on the server",
  "user.recovery_codes": "made new recovery codes",
  "settings.update": "changed the website settings",
  "review.create": "started a review",
  "review.update": "edited a review",
  "review.published": "published a review",
  "cocktail.create": "started a recipe",
  "cocktail.update": "edited a recipe",
  "blog.create": "started an article",
  "blog.update": "edited an article",
  "blog.published": "published an article",
  "blog.scheduled": "scheduled an article",
  "blog.draft": "unpublished an article",
  "blog.archived": "archived an article",
  "blog.publish_scheduled": "published a scheduled article",
  "media.upload": "uploaded an image",
  "tonic.create": "added a tonic",
  "tonic.update": "edited a tonic",
  "tonic.delete": "deleted a tonic",
  "tonic_review.create": "started a tonic review",
  "tonic_review.update": "edited a tonic review",
  "tonic_review.published": "published a tonic review",
  "tonic_review.unpublished": "unpublished a tonic review",
  "tonic_review.delete": "deleted a tonic review",
};

/** "Anna signed in", "Failed sign-in attempt (anna)", "The scheduler published …". */
export function describeEvent(event: AuditEvent): string {
  if (event.action === "auth.login_failed") {
    const username = event.summary.username;
    return typeof username === "string" ? `Failed sign-in attempt (${username})` : "Failed sign-in attempt";
  }
  const who = event.actor_name ?? (event.action.startsWith("blog.") ? "The scheduler" : "Someone");
  const title = typeof event.summary.title === "string" ? `: ${event.summary.title}` : "";
  return `${who} ${ACTION_LABELS[event.action] ?? event.action}${title}`;
}
