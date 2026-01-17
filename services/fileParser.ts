
// Declare global variables loaded via CDN in index.html
declare const window: any;

export const fileParser = {
  /**
   * Extracts text from all pages of a PDF.
   * This allows the AI to "read" cabinet codes and notes.
   */
  async pdfToText(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `[PAGE ${i}]: ${pageText}\n`;
      }
      return fullText;
    } catch (e) {
      console.error("PDF Parse Error", e);
      return "Error reading PDF text. Please ensure it is a valid PDF.";
    }
  },

  /**
   * Parses Excel file to a structured string (CSV-like or JSON-like)
   * for the AI to understand pricing and catalog data.
   */
  async excelToString(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = window.XLSX.read(data, { type: 'array' });
          
          let result = '';
          workbook.SheetNames.forEach((sheetName: string) => {
            const worksheet = workbook.Sheets[sheetName];
            const json = window.XLSX.utils.sheet_to_json(worksheet);
            result += `[SHEET: ${sheetName}]\n${JSON.stringify(json, null, 2)}\n`;
          });
          
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }
};
