import { GoogleGenAI } from "@google/genai";
import { DesignSettings, COLOR_PROMPT_MAP } from "../types";

// Switching to gemini-2.5-flash-image (standard model)
const MODEL_NAME = 'gemini-2.5-flash-image'; 

export async function generateKitchenRender(
  inputImageBase64: string, // Can be Floor Plan (Initial) or Previous Render (Update)
  mimeType: string,
  settings: DesignSettings,
  seed: number,
  isRefinement: boolean = false // True if we are just changing colors on an existing render
): Promise<string> {
  // Vite exposes env variables prefixed with VITE_ on import.meta.env
  // However, guidelines strictly require using process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  let prompt = '';

  // DYNAMIC DOOR STYLE DESCRIPTION - STRICTLY ENFORCING SOLID MATERIALS
  const doorDescription = settings.doorStyle === 'Shaker' 
    ? 'Solid Wood Shaker style (Recessed Panel with flat center). OPAQUE PAINTED FINISH. SOLID DOORS ONLY. ABSOLUTELY NO GLASS INSERTS on wall cabinets unless explicitly labeled "Glass".' 
    : 'Modern Minimalist Flat Slab. SOLID OPAQUE FINISH. SOLID DOORS ONLY. ABSOLUTELY NO GLASS INSERTS.';

  const commonRules = `
    [MATERIAL CONSISTENCY RULES]
    1. **UNIFORM COLOR**: All cabinets (Perimeter AND Island) must be "${COLOR_PROMPT_MAP[settings.cabinetColor]}" unless the floor plan has a text label explicitly naming a different color for the island.
       - Do NOT make the island a random accent color.
       - Do NOT make upper cabinets a different color from base cabinets.
    2. **COUNTERTOPS**: All surfaces must be "${settings.countertop}".
    3. **DOOR STYLE**: ${doorDescription}.
  `;

  if (settings.viewMode === '2D Architectural Plan') {
    // === MODE 3: 2D ARCHITECTURAL COLORING ===
    prompt = `
      You are "KABS Design AI". 
      TASK: Colorize this 2D floor plan layout.
      
      [STRICT ADHERENCE]
      1. KEEP ALL ORIGINAL TEXT LABELS (Cabinet Codes like B30, W3030). Do not obscure them.
      2. FILL COLORS inside the existing lines only.
      3. Cabinet Fill: ${COLOR_PROMPT_MAP[settings.cabinetColor]}
      4. Flooring: Subtle grid or wood texture.
      5. Do not change the geometry.

      Output: High-quality colored architectural plan.
    `;
  } else if (isRefinement) {
    // === MODE 2: 3D MATERIAL SWAP (Locks Geometry) ===
    prompt = `
      TASK: Retexture this 3D render.
      
      [GEOMETRY LOCK]
      - DO NOT CHANGE THE LAYOUT.
      - DO NOT ADD OR REMOVE CABINETS.
      - KEEP THE EXACT CAMERA ANGLE.
      
      [UPDATES]
      - Change Cabinet Color to: ${COLOR_PROMPT_MAP[settings.cabinetColor]} (Apply to ALL cabinets including Island).
      - Change Wall Color to: ${settings.wallColor}
      - Change Countertop to: ${settings.countertop}
      
      ${commonRules}
      
      Output: Photorealistic image with identical geometry to input.
    `;
  } else {
    // === MODE 1: 3D INITIAL CONSTRUCTION FROM PDF/IMAGE ===
    prompt = `
      You are an expert Architectural Visualization AI. 
      TASK: Convert this 2D Floor Plan into a 3D Photorealistic Kitchen.

      [STRICT CONSTRAINTS - DO NOT IGNORE]
      1. **NO EXTRA CABINETS**: You must ONLY render the cabinets drawn in the plan. 
         - If the drawing shows a blank wall space, LEAVE IT BLANK (painted wall). 
         - DO NOT fill empty spaces with extra cabinets.
      2. **NO GLASS DOORS**: Unless the text label on the plan specifically says "Glass", "Mullion", or "Prep for Glass", ALL wall cabinets must have SOLID DOORS matching the cabinet color. 
         - Standard "W3030" or "W3618" are ALWAYS SOLID DOORS.
      3. **READ THE CODES & LABELS**: 
         - "DB" or "Drawers" -> Render a stack of 3 or 4 drawers.
         - "SB" or "Sink" -> Render a sink base (false front top, doors below).
         - "B" (e.g., B30) -> Standard Base cabinet with top drawer and door below.
         - "W" (e.g., W3030) -> Standard Wall cabinet.
         - "Ref" -> Space for Refrigerator.
         - "DW" -> Stainless Steel Dishwasher panel.
      4. **DOOR SWINGS**:
         - Single curved line = Single Door.
         - Double curved lines (meeting in middle) = Double Doors.

      [GEOMETRY & LAYOUT]
      - Follow the exact L-shape, U-shape, or Galley layout shown.
      - Place the Island exactly where drawn.
      - Windows and Doors must match the plan.

      ${commonRules}

      [SCENE SETTINGS]
      - View: Eye-level perspective looking at the main kitchen area.
      - Lighting: Bright, neutral, photorealistic.
      - Style: High-end residential.

      Output: A 3D render strictly matching the drawing's specifications.
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: inputImageBase64,
            },
          },
        ],
      },
      config: {
        seed: seed,
        // Low temperature for adherence to the plan
        temperature: 0.1, 
        imageConfig: {
            aspectRatio: '4:3',
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content.parts;
      
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }

      let textResponse = '';
      for (const part of parts) {
        if (part.text) {
          textResponse += part.text + ' ';
        }
      }
      
      if (textResponse) {
        console.warn("Gemini returned text instead of image:", textResponse);
        throw new Error(`AI processing note: "${textResponse.trim().substring(0, 150)}..."`);
      }
    }
    
    throw new Error("No image generated.");
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
}