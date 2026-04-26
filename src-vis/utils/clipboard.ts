/** Copy text to clipboard. Falls back to execCommand for HTTP (non-secure) contexts. */
export function copyToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for non-secure contexts (HTTP)
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}
