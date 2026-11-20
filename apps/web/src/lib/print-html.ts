/** Open branded HTML in a print window — "Save as PDF" in the dialog
 *  produces the file. Throws on pop-up block. */
export function openPrintWindow(html: string): void {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) throw new Error('Pop-up blocked — allow pop-ups for this site to open the PDF.');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
