"use client";
import { SectionTabs } from "../ui";

/**
 * Thin wrapper over the kit's section tabs. Settings pages get their tabs from
 * `PageHeader` automatically, so this only exists for anything that still
 * imports it; it renders nothing while Settings has a single page.
 */
export default function SettingsNav() {
  return <SectionTabs />;
}
