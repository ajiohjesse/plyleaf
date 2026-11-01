// What PDF permissions mean, in words people use. Shared by Unlock and Permissions.
import { PERMISSIONS, type Permission } from "~/engine/types";

export const PERMISSION_LABELS: Record<Permission, string> = {
  print: "Printing",
  "print-hq": "Printing at full quality",
  copy: "Copying text and images",
  edit: "Changing the content",
  annotate: "Adding comments and filling in forms",
  form: "Filling in form fields",
  assemble: "Adding, removing and turning pages",
  accessibility: "Text for screen readers",
};

/** The permissions a document doesn't allow, in display order. */
export function restrictions(allowed: readonly Permission[]): Permission[] {
  return PERMISSIONS.filter((permission) => !allowed.includes(permission));
}
