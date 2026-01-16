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
    ? 'Solid Wood Shaker style (Recessed Panel). OPAQUE PAINTED FINISH. ABSOLUTELY NO GLASS INSERTS. NO MULLIONS.' 
    : 'Minimalist Flat Slab (Plane) style. SOLID OPAQUE SURFACE. ABSOLUTELY NO GLASS.';

  if (settings.viewMode === '2D Architectural Plan') {
    // === MODE 3: 2D ARCHITECTURAL COLORING (Strict adherence to prompt rules) ===
    prompt = `
      You are "KABS Design AI", a professional, production-grade Interior Design AI specialized in converting 2D Kitchen floor plans.

      GOAL:
      Convert the uploaded 2D floor plan into a consistent, correct, fully colored architectural plan.
      
      COMMAND RULES (STRICTLY FOLLOW):
      1. DO NOT CREATE NEW WALLS OR CABINETS. Only colorize existing elements.
      2. NEVER ALTER LAYOUT, DIMENSIONS or SCALE.
      3. NO PARTIAL OR INCOMPLETE RENDERING.
      4. KEEP ORIGINAL TEXT / SYMBOLS.
      5. COLORING LOGIC:
         - Cabinet Color: ${COLOR_PROMPT_MAP[settings.cabinetColor]}
         - Wall Color: ${settings.wallColor}
         - Countertop: ${settings.countertop}
         - Appliances: Stainless Steel
      6. VIEW ANGLE: TOP-DOWN ARCHITECTURAL VIEW (2D Plan View).

      Output: A high-resolution architectural colored plan.
    `;
  } else if (isRefinement) {
    // === MODE 2: 3D MATERIAL SWAP (Locks Geometry) ===
    prompt = `
      Task: TECHNICAL RETEXTURING / MATERIAL SWAP.
      Input: A realistic 3D render of a kitchen.
      
      [ABSOLUTE GEOMETRY LOCK]
      1. DO NOT CHANGE THE GEOMETRY.
      2. DO NOT MOVE THE CAMERA.
      3. **KEEP ALL DOORS SOLID.** Do not turn solid cabinets into glass.
      4. REMOVE any accidentally generated glass if present; make it solid.

      [TARGET UPDATES]
      - CABINET FINISH: ${COLOR_PROMPT_MAP[settings.cabinetColor]}
      - WALL COLOR: ${settings.wallColor}
      - DOOR STYLE: ${doorDescription}
      - COUNTERTOP: ${settings.countertop}
      - FLOORING: Subtle wood

      Output: A high-resolution photorealistic image with the EXACT SAME COMPOSITION as the input.
    `;
  } else {
    // === MODE 1: 3D INITIAL CONSTRUCTION (REALISTIC BUT CONTROLLED) ===
    prompt = `
      You are a professional Interior Visualization AI.

      TASK TYPE:
      Realistic interior rendering using LOCKED geometry from the uploaded PDF.
      This is NOT a redesign task.

      [SOURCE OF TRUTH]
      The uploaded PDF drawing is the ONLY source for:
      - Kitchen layout
      - Wall positions
      - Cabinet count and placement
      - Island size and location
      - Appliance locations
      - Window and door positions
      
      Do NOT add, remove, or resize any architectural or cabinet element.

      [GEOMETRY LOCK (STRICT)]
      - Preserve the exact layout from the PDF
      - Maintain L / U / Galley / One-wall layout as-is
      - Each cabinet must remain separate (no merging)
      - Island dimensions must remain unchanged
      - Do NOT center, balance, or symmetrize the kitchen

      [CAMERA & VIEW (REALISTIC BUT CONTROLLED)]
      - **Camera Type**: Interior realistic perspective
      - **Position**: Standing in living / dining area
      - **Direction**: Facing the main sink + range wall
      - **Island**: Must be fully visible in foreground
      - **Background**: Main cabinets must be visible
      - **Height**: 5 feet (human eye level)
      - **Field of View**: 28–32° (NO wide angle)
      - **Constraint**: Slight perspective only (avoid distortion)
      - **Constraint**: Camera must remain FIXED.

      [REALISM & LIGHTING]
      - Soft natural daylight from windows
      - Neutral white artificial ceiling lights
      - No dramatic shadows
      - Even exposure for cabinet visibility

      [MATERIAL & COLOR RULES]
      - **Cabinet Color**: ${COLOR_PROMPT_MAP[settings.cabinetColor]}
      - **Door Style**: ${doorDescription}
      - **Wall Color**: ${settings.wallColor}
      - **Countertop**: ${settings.countertop}
      - **Appliances**: Stainless Steel
      - **Flooring**: Subtle wood (do not dominate scene)

      [DETAIL CONTROL]
      - Allowed: Handles, hinges (simple & minimal), soft cabinet shadows.
      - **FORBIDDEN**: Decorative items, plants, stools, rugs, extra lighting fixtures.

      [ANTI-HALLUCINATION]
      - If an element is unclear in the PDF, leave it plain. Do NOT guess.

      Output: A clean, realistic interior kitchen image matching the PDF layout.
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
        // Lower temperature for technical accuracy/consistency
        temperature: isRefinement ? 0.2 : 0.4, 
        imageConfig: {
            aspectRatio: '4:3',
        },
        // Relax safety settings to prevent blocking legitimate architectural drawings
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
      
      // 1. Look for Image
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }

      // 2. If no image, look for Text (Error/Refusal explanation)
      let textResponse = '';
      for (const part of parts) {
        if (part.text) {
          textResponse += part.text + ' ';
        }
      }
      
      if (textResponse) {
        console.warn("Gemini returned text instead of image:", textResponse);
        // Throw the text response so the user sees why it failed (e.g. "I cannot process PDF")
        throw new Error(`The AI returned text instead of an image: "${textResponse.trim().substring(0, 150)}..."`);
      }
    }
    
    throw new Error("No image generated. The AI response was empty.");
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
}