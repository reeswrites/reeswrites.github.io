// @ts-check

/**
 * Open a Bootstrap modal and wait until it has finished opening.
 *
 * A modal is visible (and has class "show") from the start of its fade-in,
 * but Bootstrap ignores hide() until the transition ends: a close clicked
 * in that window is dropped and the modal stays open. Tests that open and
 * then close a modal must wait for the public `shown.bs.modal` event first,
 * or they flake under load.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} modal  Selector of the .modal element, e.g. "#dataModal"
 * @param {() => Promise<unknown>} open  The action that opens it
 */
async function openModal(page, modal, open) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`openModal: ${sel} not found`);
    window.__modalShown = false;
    el.addEventListener("shown.bs.modal", () => (window.__modalShown = true), { once: true });
  }, modal);
  await open();
  await page.waitForFunction(() => window.__modalShown === true);
}

module.exports = { openModal };
