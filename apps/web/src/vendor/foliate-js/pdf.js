// Papyrus: PDFs are stored but never read in the browser (map: Out of scope), so the
// vendored pdf.js (~13 MB) is left out and this stub stands in for foliate-js's pdf.js.
export const makePDF = async () => {
  throw new Error('PDF files are not readable in Papyrus')
}
