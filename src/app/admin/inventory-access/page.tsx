import { redirect } from "next/navigation";

/**
 * Canonical short path for the "Inventory Access" menu item
 * (key: inventory_access). The real Super-Admin-gated implementation lives
 * at /admin/super-admin/inventory-access; kept there to match this app's
 * existing super-admin route grouping, so this just forwards.
 */
export default function InventoryAccessRedirectPage() {
  redirect("/admin/super-admin/inventory-access");
}
