/** سلوك تطبيق لا صفحة ويب: لا قائمة سياقية للمتصفح (نسخ/مشاركة) إلا داخل حقول الكتابة. */
export function preventNativeMenu(): void {
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
  });
}
