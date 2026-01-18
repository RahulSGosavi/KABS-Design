import { GoogleGenAI } from "@google/genai";
import { DesignSettings, COLOR_PROMPT_MAP } from "../types";

// Reverting to Flash Image model as Pro is returning 403 Permission Denied for some API keys.
// Flash Image is still very capable of following the strict geometry instructions.
const MODEL_NAME = 'gemini-2.5-flash-image'; 

export async function generateKitchenRender(
  inputImageBase64: string, // Can be Floor Plan (Initial) or Previous Render (Update)
  mimeType: string,
  settings: DesignSettings,
  seed: number,
  contextText: string = '', // Extracted PDF text to help detect "Island" labels
  isRefinement: boolean = false // True if we are just changing colors on an existing render
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  let prompt = '';

  // DYNAMIC DOOR STYLE DESCRIPTION
  const doorDescription = settings.doorStyle === 'Shaker' 
    ? 'Solid Wood Shaker style (Recessed Panel with flat center). OPAQUE PAINTED FINISH. SOLID DOORS ONLY.' 
    : 'Modern Minimalist Flat Slab. SOLID OPAQUE FINISH. SOLID DOORS ONLY.';

  const commonRules = `
    [MATERIAL PALETTE]
    - Cabinets: "${COLOR_PROMPT_MAP[settings.cabinetColor]}"
    - Countertops: "${settings.countertop}"
    - Door Style: ${doorDescription}
    - Walls: "${settings.wallColor}"
    - Flooring: Neutral Hardwood or Porcelain Tile.
  `;

  if (settings.viewMode === '2D Architectural Plan') {
    // === MODE 3: 2D ARCHITECTURAL COLORING ===
    prompt = `
      SYSTEM ROLE: Architectural Drafter / Colorist.
      TASK: Colorize this floor plan.
      
      RULES:
      1. PRESERVE ALL LINES AND TEXT. Do not remove any measurements.
      2. Fill the cabinet interiors with: ${COLOR_PROMPT_MAP[settings.cabinetColor]}.
      3. Fill the counters with: ${settings.countertop} texture.
      4. Do not alter the geometry.
    `;
  } else if (isRefinement) {
    // === MODE 2: 3D MATERIAL SWAP (Locks Geometry) ===
    prompt = `
      SYSTEM ROLE: 3D Visualizer - Material Update.
      TASK: Update the materials of this kitchen render without changing the furniture layout.
      
      INSTRUCTIONS:
      - Keep the exact same camera angle and furniture placement.
      - Apply ${COLOR_PROMPT_MAP[settings.cabinetColor]} to all cabinets.
      - Apply ${settings.wallColor} to the walls.
      - Apply ${settings.countertop} to the countertops.
    `;
  } else {
    // === MODE 1: SKETCH-TO-REALITY (STRICT GEOMETRY) ===
    prompt = `
      SYSTEM ROLE: 3D Construction Engine.
      INPUT ANALYSIS: The input image is a COMPOSITE of multiple PDF pages. 
      It contains 2D Floor Plans AND existing 3D Perspective/Elevation views.

      [CRITICAL: VISUAL & TEXT CROSS-CHECK]
      1. **SCAN THE 3D VIEWS**: Look at the bottom/middle of the input image. If there are 3D wireframes or sketches, USE THEM as the blueprint.
      2. **ISLAND DETECTION (MANDATORY)**: 
         - **VISUAL**: Do you see a rectangle in the middle of the floor plan? -> RENDER ISLAND.
         - **VISUAL**: Do you see an island in the 3D perspective views? -> RENDER ISLAND.
         - **TEXT**: Read this context: "${contextText}". Does it mention "Island", "Bar", or "Peninsula"? -> RENDER ISLAND.
         - **RULE**: If ANY of the above are true, you MUST render the island in the center.

      [RENDERING INSTRUCTIONS]
      - **View**: Generate a stunning, photorealistic 3D Perspective of the kitchen.
      - **Geometry**: Follow the wall layout and cabinet placement exactly.
      - **Style**: High-End Residential.
      
      ${commonRules}

      [FINAL VERIFICATION]
      - Did you check the Context Text for "Island"?
      - Did you check the 3D Reference images in the input?
      - Ensure the Island is present if detected.
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
              mimeType: mimeType, // This will be image/jpeg for the composite
              data: inputImageBase64,
            },
          },
        ],
      },
      config: {
        seed: seed,
        temperature: 0.0, // Strict adherence to prompt/image
        imageConfig: {
          // 'imageSize' is NOT supported by gemini-2.5-flash-image, only aspectRatio
          aspectRatio: "4:3",
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
      // 1. Try to find inline image data
      for (const part of candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      
      // 2. Fallback check if text was returned explaining a refusal
      let textResponse = '';
      for (const part of candidates[0].content.parts) {
        if (part.text) textResponse += part.text;
      }
      if (textResponse) {
        console.warn("Gemini returned text:", textResponse);
        throw new Error(`AI Note: ${textResponse.substring(0, 100)}`);
      }
    }
    
    throw new Error("No image generated.");
  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    if (error.toString().includes("403") || error.message?.includes("PERMISSION_DENIED")) {
        throw new Error("API Key Permission Denied. Your API Key may not support Image Generation models.");
    }
    throw error;
  }
}