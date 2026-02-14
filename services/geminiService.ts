
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

// Hàm khởi tạo AI an toàn, chỉ chạy khi thực sự cần dùng đến AI
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    throw new Error("API Key chưa được cấu hình. Vui lòng sử dụng bộ đề mẫu hoặc thiết lập Key.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateQuestions = async (topic: string, count: number = 10): Promise<Question[]> => {
  try {
    const ai = getAiClient();
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

    const data = JSON.parse(response.text);
    return data;
  } catch (error) {
    console.error("Lỗi khởi tạo hoặc gọi AI:", error);
    alert("Không thể sử dụng AI lúc này: " + (error instanceof Error ? error.message : "Lỗi không xác định"));
    return [];
  }
};

export const getDeepExplanation = async (question: Question): Promise<string> => {
  try {
    const ai = getAiClient();
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
  } catch (error) {
    console.error("Lỗi giải thích bằng AI:", error);
    return "Lỗi: Cần cấu hình API Key để sử dụng tính năng giải thích bằng AI.";
  }
};
