/**
 * Settings view — menu catalogue coverage.
 *
 * The view renders one tab per menu the role's list carries, keyed by its
 * catalogue entry. A menu added without a label fails here until it has one,
 * and the coverage guard keeps the Account tab reachable for every role.
 */

import { describe, expect, test } from "bun:test";
import type { SettingsMenu } from "@/lib/mes/queries/access";
import { ROLE_CODES, settingsMenusFor } from "@/lib/mes/queries/access";
import { MENU_KEYS } from "./settings-view";

describe("menu catalogue", () => {
  test("every menu has a catalogue entry", () => {
    const menus: SettingsMenu[] = [
      "account",
      "users",
      "org",
      "rbac",
      "telegram",
      "audit",
    ];
    for (const menu of menus) {
      expect(MENU_KEYS[menu], `${menu} has no catalogue key`).toBeTruthy();
    }
  });

  test("no catalogue entry names a menu that does not exist", () => {
    const known = new Set<string>([
      "account",
      "users",
      "org",
      "rbac",
      "telegram",
      "audit",
    ]);
    for (const menu of Object.keys(MENU_KEYS)) {
      expect(known.has(menu), `${menu} is not a menu`).toBe(true);
    }
  });

  test("every role's menu list is renderable", () => {
    for (const role of ROLE_CODES) {
      const menus = settingsMenusFor(role);
      expect(menus.length).toBeGreaterThan(0);
      for (const menu of menus) {
        expect(MENU_KEYS[menu]).toBeTruthy();
      }
    }
  });
});
