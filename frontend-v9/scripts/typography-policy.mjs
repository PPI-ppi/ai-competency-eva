// Property names only. Visual values live exclusively in src/typography.css.
export function isTypographyProperty(property) {
  const normalized = property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
  return /^(font($|-)|line-height$|letter-spacing$|word-spacing$|text-transform$|text-decoration($|-))/.test(normalized)
    || /^--(?:font|type|typography)(?:-|$)/.test(normalized);
}
