
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateQuestions = async (topic: string, count: number = 10): Promise<Question[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Hãy tạo bộ đề thi gồm ${count} câu hỏi trắc nghiệm về chủ đề: ${topic}. Câu hỏi phải phù hợp cho trò chơi "Rung Chuông Vàng".`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.INTEGER },
            content: { type: Type.STRING, description: "Nội dung câu hỏi" },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Danh sách 4 lựa chọn"
            },
            correctAnswer: { type: Type.INTEGER, description: "Chỉ số của câu trả lời đúng (0-3)" },
            explanation: { type: Type.STRING, description: "Giải thích ngắn gọn tại sao câu này đúng" },
            difficulty: { type: Type.STRING, description: "Độ khó: Easy, Medium, Hard" }
          },
          required: ["id", "content", "options", "correctAnswer", "explanation", "difficulty"]
        }
      }
    }
  });

  try {
    const data = JSON.parse(response.text);
    return data;
  } catch (error) {
    console.error("Lỗi parse JSON:", error);
    return [];
  }
};

export const getDeepExplanation = async (question: Question): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Giải thích chi tiết và mở rộng kiến thức cho câu hỏi sau để giáo viên giảng giải cho học sinh: 
    Câu hỏi: ${question.content}
    Đáp án đúng: ${question.options[question.correctAnswer]}
    Bối cảnh: Cuộc thi Rung Chuông Vàng. Hãy viết phong cách giáo dục, hấp dẫn, dễ hiểu.`,
    config: {
      temperature: 0.7,
    }
  });
  
  return response.text || "Không thể tải giải thích chi tiết lúc này.";
};
