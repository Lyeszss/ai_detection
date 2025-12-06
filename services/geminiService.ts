import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeImageForObject = async (base64Image: string): Promise<{ 
  type: 'box' | 'sphere' | 'cylinder' | 'custom_glb', 
  color: string, 
  name: string,
  dimensions: [number, number, number],
  category: string
}> => {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64
            }
          },
          {
            text: `Analyze the main object. Return a JSON object with:
            1. 'category': The closest match from this list: [
               APPLE, BANANA, BURGER, SODA_CAN, TEA, PUMPKIN, 
               HAMMER, BOOK, CHAIR, PLANT, LAMP, MUG, 
               PHONE, KEYBOARD, LAPTOP, GAME_CONSOLE, HEADPHONES, CAMERA, 
               SHOE, HAT, DUCK, BALL, OTHER
            ].
            2. 'type': If category is OTHER, choose the best primitive (box, sphere, cylinder). If it matches a list item, use 'custom_glb'.
            3. 'dimensions': Estimated rough dimensions in meters [width, height, depth] (e.g., a phone is [0.08, 0.15, 0.01]).
            4. 'color': Hex code.
            5. 'name': A short display name.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["box", "sphere", "cylinder", "custom_glb"] },
            color: { type: Type.STRING },
            name: { type: Type.STRING },
            dimensions: { 
              type: Type.ARRAY, 
              items: { type: Type.NUMBER },
              minItems: 3,
              maxItems: 3
            }
          },
          required: ["category", "type", "color", "name", "dimensions"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    
    throw new Error("No response text");
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    return { 
      type: 'box', 
      color: '#ffffff', 
      name: 'Unknown Object', 
      dimensions: [0.2, 0.2, 0.2],
      category: 'OTHER'
    };
  }
};