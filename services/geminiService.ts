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

  if (isRefinement) {
    // === MODE 2: MATERIAL SWAP (Locks Geometry) ===
    // Use the existing 3D image as the base and only repaint surfaces.
    prompt = `
      Task: PHOTO EDITING / RETEXTURING.
      Input: A realistic 3D render of a kitchen.
      
      OBJECTIVE: Change the material finishes EXACTLY as specified below.
      
      CRITICAL CONSTRAINTS:
      1. DO NOT CHANGE THE GEOMETRY.
      2. DO NOT MOVE THE CAMERA.
      3. DO NOT MOVE OBJECTS.
      4. DO NOT CHANGE LIGHTING.
      5. ONLY change the colors/textures of the specified surfaces.

      TARGET UPDATES:
      - CABINET FINISH: Change to ${COLOR_PROMPT_MAP[settings.cabinetColor]}. (Apply to all cabinet doors, drawers, and panels).
      - WALL COLOR: Change to ${settings.wallColor}.
      - DOOR STYLE: ${settings.doorStyle} (${settings.doorStyle === 'Shaker' ? 'Recessed panel details' : 'Flat slab modern'}).
      - COUNTERTOP: ${settings.countertop}.

      Output: A high-resolution photorealistic image with the EXACT SAME COMPOSITION as the input.
    `;
  } else {
    // === MODE 1: INITIAL CONSTRUCTION (Strict Layout) ===
    // Build the room from the 2D Floor Plan.
    prompt = `
      Role: Senior Architectural Visualizer.
      Task: Create a PHOTOREALISTIC 3D render from this 2D FLOOR PLAN.

      [STRICT LAYOUT RULES - READ CAREFULLY]
      1. IDENTIFY THE ISLAND: Look for the isolated rectangular block in the center. It MUST be free-standing. Do not attach it to walls.
      2. IDENTIFY THE PERIMETER: Trace the cabinetry runs against the walls (L-shape, U-shape, or Galley).
      3. PLACE APPLIANCES: Locate 'REF' (Fridge), 'RANGE' (Stove), 'SINK', 'DW' relative to the corners.
      4. PRESERVE GEOMETRY: If a wall is 45-degrees, render it 45-degrees. If there is a window, put a window.

      [CAMERA SETUP]
      - Perspective: Eye-level (1.6m).
      - Lens: 16mm Wide Angle.
      - Angle: Shot from the open side of the room looking inward to show the relationship between the Island and Perimeter.

      [DESIGN SPECS]
      - Cabinet Color: ${COLOR_PROMPT_MAP[settings.cabinetColor]}.
      - Style: ${settings.doorStyle} (${settings.doorStyle === 'Shaker' ? 'Classic Shaker' : 'Minimalist Flat'}).
      - Walls: ${settings.wallColor}.
      - Countertop: ${settings.countertop}.
      - Floor: Natural Oak Wood.
      - Lighting: Bright Day + Warm Interior (4000K).

      Output: A 100% structurally accurate photo of this specific kitchen plan.
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
        // Lower temperature for refinements to stick closer to input
        temperature: isRefinement ? 0.3 : 0.7, 
        imageConfig: {
            aspectRatio: '4:3',
        }
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
    }
    
    throw new Error("No image generated.");
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
}