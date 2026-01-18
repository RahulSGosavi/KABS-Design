
// Declare global variables loaded via CDN in index.html
declare const window: any;

export const fileParser = {
  /**
   * Renders the first 6 pages of a PDF into a single vertical composite image.
   * This is critical for kitchen packets where the Floor Plan might be on Page 1,
   * but the 3D Perspectives (showing the Island/Style) are on Page 5 or 6.
   */
  async pdfToImage(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      // We scan up to 6 pages to catch the relevant design details typically found in design packets.
      const maxPages = Math.min(pdf.numPages, 6);
      
      const pageCanvases: { canvas: HTMLCanvasElement; width: number; height: number }[] = [];
      let totalHeight = 0;
      let maxWidth = 0;

      // Moderate scale to ensure the 6-page strip doesn't exceed browser canvas limits or AI payload limits.
      // 1.5 is roughly 110 DPI, sufficient for reading dimensions and recognizing 3D shapes.
      const scale = 1.5; 

      // 1. Render each page to a temporary canvas
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        if (!tempCtx) continue;

        tempCanvas.width = viewport.width;
        tempCanvas.height = viewport.height;

        await page.render({
          canvasContext: tempCtx,
          viewport: viewport
        }).promise;

        pageCanvases.push({ canvas: tempCanvas, width: viewport.width, height: viewport.height });
        
        maxWidth = Math.max(maxWidth, viewport.width);
        totalHeight += viewport.height;
      }

      // 2. Stitch them onto one long vertical canvas
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = maxWidth;
      compositeCanvas.height = totalHeight;
      const ctx = compositeCanvas.getContext('2d');
      
      if (!ctx) throw new Error("Could not create composite canvas context");

      // Fill background with white (PDFs are transparent by default sometimes)
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, maxWidth, totalHeight);

      let currentY = 0;
      for (const item of pageCanvases) {
        // Center page horizontally if it varies in width
        const xOffset = (maxWidth - item.width) / 2;
        ctx.drawImage(item.canvas, xOffset, currentY);
        
        // Add a small divider line between pages
        ctx.beginPath();
        ctx.moveTo(0, currentY + item.height);
        ctx.lineTo(maxWidth, currentY + item.height);
        ctx.strokeStyle = "#E2E8F0"; // Slate-200
        ctx.lineWidth = 2;
        ctx.stroke();

        currentY += item.height;
      }

      // Return JPEG to save size (PNG for 6 pages is too huge)
      return compositeCanvas.toDataURL('image/jpeg', 0.85);

    } catch (e) {
      console.error("PDF to Image Conversion Failed", e);
      throw new Error("Could not convert PDF to Image. Please try a JPG/PNG instead.");
    }
  },

  /**
   * Extracts text from all pages of a PDF using Spatial Sorting.
   * This reconstructs the visual layout (Top-to-Bottom, Left-to-Right)
   * rather than the internal stream order, which is critical for blueprints.
   */
  async pdfToText(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      let inventorySummary = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // 1. SPATIAL SORTING
        // PDF text items have a transform matrix: [scaleX, skewY, skewX, scaleY, x, y]
        // (0,0) is usually bottom-left in PDFs.
        const items = textContent.items.map((item: any) => ({
            str: item.str,
            x: item.transform[4], 
            y: item.transform[5],
            // width isn't always reliable in raw extraction but x/y are
        }));

        // Sort: Primary by Y (descending, top to bottom), Secondary by X (ascending, left to right)
        items.sort((a: any, b: any) => {
            const yDiff = Math.abs(a.y - b.y);
            // If items are within 8 units of Y, consider them on the same line
            if (yDiff < 8) {
                return a.x - b.x; 
            }
            return b.y - a.y; 
        });

        // 2. RECONSTRUCT LAYOUT
        let pageText = '';
        let lastY = -1;
        let lastX = -1;
        
        items.forEach((item: any) => {
            // New line detection
            if (lastY !== -1 && (lastY - item.y) > 12) {
                pageText += '\n';
            } else if (lastX !== -1 && (item.x - lastX) > 20) {
               // Add extra spacing for large horizontal gaps (columns)
               pageText += '   '; 
            } else {
               pageText += ' ';
            }
            
            pageText += item.str;
            lastY = item.y;
            lastX = item.x + (item.str.length * 5); // Approximate end X
        });

        fullText += `--- [PAGE ${i} SPATIAL EXTRACT] ---\n${pageText}\n\n`;
        
        // 3. AUTO-DETECT INVENTORY
        const pageInventory = this.extractInventoryFromText(pageText);
        if (pageInventory.length > 0) {
            inventorySummary += `[PAGE ${i} DETECTED ITEMS]:\n${pageInventory.join(', ')}\n`;
        }
      }

      // Prepend the "Cheat Sheet" inventory to the raw text
      return `=== DETECTED INVENTORY CHEAT SHEET ===\n${inventorySummary}\n\n=== RAW SPATIAL FILE CONTENT ===\n${fullText}`;
    } catch (e) {
      console.error("PDF Parse Error", e);
      return "Error reading PDF text. Please ensure it is a valid PDF.";
    }
  },

  /**
   * Helper to identify standard Kitchen Codes in text using Regex.
   */
  extractInventoryFromText(text: string): string[] {
    const findings: string[] = [];
    
    const patterns = [
        // Added ISLAND detection to specific regex
        { type: "Island/Feature", regex: /\b(ISLAND|ISL|BAR|PENINSULA|KNEE WALL)\b/gi },
        { type: "Appliance", regex: /\b(REF|FRIDGE|REFRIGERATOR|DW|DISHWASHER|RANGE|STOVE|OVEN|MW|MICROWAVE|HOOD)\b/gi },
        { type: "Sink", regex: /\b(SB|SINK|FARM SINK)\d*\b/gi },
        { type: "Base Cab", regex: /\b(B|DB|LS)\d{2,}[A-Z0-9\/-]*\b/gi }, // Matches B30, DB36, LS36
        { type: "Wall Cab", regex: /\bW\d{2,}[A-Z0-9\/-]*\b/gi },         // Matches W3030
        { type: "Tall Cab", regex: /\b(U|T|TP)\d{2,}[A-Z0-9\/-]*\b/gi }   // Matches U18, T30
    ];

    patterns.forEach(p => {
        const matches = text.match(p.regex);
        if (matches) {
            matches.forEach(m => findings.push(m.trim()));
        }
    });

    return [...new Set(findings)]; // Remove duplicates
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
