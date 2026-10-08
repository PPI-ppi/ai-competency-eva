// Keep original option values for submission; only the visible label is stripped.
function labeledOptions(text) {
  const markers = [...text.matchAll(/(?:^|\s)([A-Z])[.．、:：)）]\s*/g)];
  if (markers.length < 2 || text.slice(0, markers[0].index).trim()) return null;
  if (!markers.every((marker, index) => marker[1] === String.fromCharCode(65 + index))) return null;
  return markers.map((marker, index) =>
    text.slice(marker.index, markers[index + 1]?.index ?? text.length).trim()
  );
}

export function parseQuestionOptions(value) {
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (typeof item !== "string") return [];
      const text = item.trim();
      if (!text) return [];
      return value.length === 1 ? parseQuestionOptions(text) : [text];
    });
  }
  if (typeof value !== "string" || !value.trim()) return [];
  const text = value.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) || typeof parsed === "string") return parseQuestionOptions(parsed);
    return [];
  } catch {
    return labeledOptions(text) || text.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  }
}

export function optionDisplayText(option, index) {
  const label = String.fromCharCode(65 + index);
  return option.replace(new RegExp(`^${label}[.．、:：)）]\\s*`), "");
}
