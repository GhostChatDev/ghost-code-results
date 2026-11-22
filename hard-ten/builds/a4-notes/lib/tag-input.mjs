// Keep the input's raw text while someone types. Reformatting it on every
// keystroke would restore a trailing comma or space as soon as it is deleted.
export function parseTags(text) {
  return [...new Set(text.split(',').map(tag => tag.trim()).filter(Boolean))];
}

export function displayTags(rawText, tags) {
  return rawText ?? tags.join(', ');
}

export function editTags(text) {
  return { rawText: text, tags: parseTags(text) };
}
