/** Focus after layout / paint; avoids scroll jump on mobile. */
export function scheduleFocus(
  el: Pick<HTMLElement, "focus"> | null | undefined,
  options?: { preventScroll?: boolean },
): void {
  if (!el) return;
  const preventScroll = options?.preventScroll ?? true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.focus({ preventScroll });
    });
  });
}
