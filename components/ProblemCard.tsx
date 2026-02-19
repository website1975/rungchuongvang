
import React, { useState, useEffect, useMemo } from 'react';
import { PhysicsProblem, Difficulty, QuestionType, DisplayChallenge } from '../types';
import LatexRenderer from './LatexRenderer';

interface ProblemCardProps {
  problem: PhysicsProblem;
  isPaused?: boolean;
  forceShowContent?: boolean;
}

const ProblemCard: React.FC<ProblemCardProps> = ({ problem, isPaused, forceShowContent }) => {
  const [elapsed, setElapsed] = useState(0);
  const [isImgLoading, setIsImgLoading] = useState(true);
  const MEMORY_LIMIT = 10;
  const FOGGY_DURATION = 30;

  useEffect(() => {
    let interval: number;
    if (!isPaused) {
      interval = window.setInterval(() => setElapsed(prev => prev + 0.5), 500);
    }
    return () => clearInterval(interval);
  }, [isPaused, problem.id]);

  useEffect(() => {
    setElapsed(0);
    setIsImgLoading(true);
  }, [problem.id]);

  const difficultyColor = {
    [Difficulty.EASY]: 'bg-[#4caf50]',
    [Difficulty.MEDIUM]: 'bg-[#ffb300]',
    [Difficulty.HARD]: 'bg-[#f44336]',
  };

  const isMemoryHidden = !forceShowContent && problem.challenge === DisplayChallenge.MEMORY && elapsed >= MEMORY_LIMIT;
  const blurAmount = useMemo(() => {
    if (forceShowContent || problem.challenge !== DisplayChallenge.FOGGY) return 0;
    return Math.min(10, (elapsed / FOGGY_DURATION) * 10);
  }, [problem.challenge, elapsed, forceShowContent]);

  return (
    <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 relative h-full flex flex-col animate-in fade-in duration-500 min-h-[500px]">
      <div className="relative z-10 flex flex-col h-full text-left">
        {/* Tags nhỏ ở góc trên */}
        <div className="flex items-center gap-2 mb-6 shrink-0">
          <span className={`text-[9px] font-black px-3 py-1 rounded-md text-white uppercase tracking-widest ${difficultyColor[problem.difficulty]}`}>
            {problem.difficulty.toUpperCase()}
          </span>
          <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 border border-blue-100 px-3 py-1 rounded-md">
            {problem.type}
          </span>
        </div>
        
        {/* Tiêu đề câu hỏi - Nhẹ nhàng */}
        <h2 className="text-xl font-bold text-slate-400 mb-6 uppercase italic tracking-tighter leading-none">
          {problem.title}
        </h2>
        
        {/* Vùng nội dung câu hỏi - CANH GIỮA TUYỆT ĐỐI */}
        <div className="relative flex-1 bg-[#f8fafc] rounded-[2rem] p-12 flex flex-col items-center justify-center shadow-inner overflow-hidden">
          {problem.imageUrl && !isMemoryHidden && (
             <div className="w-full flex flex-col items-center justify-center mb-8 shrink-0">
                <img 
                  src={problem.imageUrl} 
                  onLoad={() => setIsImgLoading(false)}
                  className={`max-h-[250px] w-auto rounded-xl shadow-sm object-contain transition-all duration-500 ${isImgLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`} 
                  alt="Diagram" 
                />
             </div>
          )}

          {/* Nội dung chữ - Căn giữa, nhỏ gọn và chuyên nghiệp */}
          <div className={`transition-all duration-700 w-full text-center flex items-center justify-center ${isMemoryHidden ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}`} style={{ filter: `blur(${blurAmount}px)` }}>
             <LatexRenderer 
                content={problem.content} 
                className="text-2xl md:text-3xl lg:text-4xl text-slate-800 leading-relaxed font-medium italic tracking-tight max-w-[90%]" 
             />
          </div>
          
          {isMemoryHidden && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
              <div className="text-6xl mb-2 opacity-20">🧠</div>
              <span className="font-bold uppercase tracking-widest text-[10px]">Ghi nhớ nhanh!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProblemCard;
