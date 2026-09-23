/* BUILD.md §2.5 — yedi kesin MatchCard ölçüsü.
 * Component ve QA tezgâhı aynı tabloyu tüketir; ara preset üretilemez.
 */
export const MATCH_CARD_PRESETS = Object.freeze({
  mobileHero: Object.freeze({ id: "mobile-hero", label: "Mobile hero", wrapper: 334, crestSize: 62, artHeight: 150, scoreSize: 52, compact: false }),
  mobileSheet: Object.freeze({ id: "mobile-sheet", label: "Mobile sheet", wrapper: 291, crestSize: 56, artHeight: 118, scoreSize: 44, compact: false }),
  webWall: Object.freeze({ id: "web-wall", label: "Web wall", wrapper: 305, crestSize: 56, artHeight: 132, scoreSize: 46, compact: false }),
  webInspector: Object.freeze({ id: "web-inspector", label: "Web Inspector", wrapper: 281, crestSize: 52, artHeight: 108, scoreSize: 40, compact: false }),
  collectibleOverlay: Object.freeze({ id: "collectible-overlay", label: "Collectible overlay", wrapper: 440, crestSize: 76, artHeight: 196, scoreSize: 66, compact: false }),
  webShelf: Object.freeze({ id: "web-shelf", label: "Web shelf", wrapper: 174, crestSize: 34, artHeight: 56, scoreSize: 21, compact: true }),
  mobileShelf: Object.freeze({ id: "mobile-shelf", label: "Mobile shelf", wrapper: 167, crestSize: 30, artHeight: 42, scoreSize: 19, compact: true }),
});
