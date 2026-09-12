export const HERDR_TAB_TITLE_OWNED = "herdr-tab-title-owned";
export interface HerdrTabTitleOwnedEvent { title: string; explicit: boolean }

export function claimHerdrTabTitle(pi: { events?: { emit(name: string, data: unknown): void } }, title: string, explicit: boolean): void {
  pi.events?.emit(HERDR_TAB_TITLE_OWNED, { title, explicit } satisfies HerdrTabTitleOwnedEvent);
}
