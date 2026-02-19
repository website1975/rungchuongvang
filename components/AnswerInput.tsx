
import React, { useState, useEffect } from 'react';
import { QuestionType, PhysicsProblem } from '../types';
import LatexRenderer from './LatexRenderer';

interface AnswerInputProps {
  problem: PhysicsProblem;
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  isHelpActive?: boolean;
}

const AnswerInput: React.FC<AnswerInputProps> = ({ problem, value, onChange, onSubmit, disabled, isHelpActive }) => {
  const [dsAnswers, setDsAnswers] = useState<string[]>(['', '', '', '']);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);

  useEffect(() => {
    if (isHelpActive && problem.type === QuestionType.MULTIPLE_CHOICE) {
      const correctIdx = (problem.correctAnswer || 'A').charCodeAt(0) - 65;
      const allIndices = [0, 1, 2, 3].filter(idx => idx !== correctIdx);
      const toHide = allIndices.sort(() => Math.random() - 0.5).slice(0, 2);
      setHiddenOptions(toHide);
    } else {
      setHiddenOptions([]);
    }
  }, [isHelpActive, problem.id, problem.type, problem.correctAnswer]);

  const handleNumClick = (num: string) => {
    if (disabled) return;
    onChange(value + num);
  };

  const handleBackspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    if (disabled) return;
    onChange('');
  };

  if (problem.type === QuestionType.MULTIPLE_CHOICE) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          {(problem.options || []).map((opt, i) => {
            const label = String.fromCharCode(65 + i);
            const isSelected = value === label;
            if (hiddenOptions.includes(i)) return null;

            return (
              <button 
                key={i} 
                disabled={disabled} 
                onClick={() => onChange(label)} 
                className={`group min-h-[70px] h-auto px-5 py-4 rounded-[1.5rem] border-2 transition-all flex items-center gap-5 w-full ${isSelected ? 'border-blue-500 bg-blue-50/20' : 'border-slate-100 bg-white hover:border-blue-200 shadow-sm'}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl shrink-0 transition-all ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'bg-[#f1f5f9] text-slate-400 group-hover:bg-blue-50'}`}>
                  {label}
                </div>
                <div className="flex-1 font-medium text-xl italic text-slate-800 text-left leading-snug">
                  <LatexRenderer content={opt} />
                </div>
              </button>
            );
          })}
        </div>
        
        <button 
          onClick={onSubmit} 
          disabled={disabled || !value} 
          className={`w-full py-5 mt-4 rounded-[2rem] font-bold uppercase italic shadow-md text-lg transition-all active:scale-95 shrink-0 ${!value ? 'bg-slate-100 text-slate-300' : 'bg-blue-600 text-white shadow-blue-500/20 hover:bg-blue-500'}`}
        >
          XÁC NHẬN ĐÁP ÁN 🎯
        </button>
      </div>
    );
  }

  if (problem.type === QuestionType.TRUE_FALSE) {
    const handleToggleDS = (idx: number, val: string) => {
      setDsAnswers(prev => {
        const next = [...prev];
        next[idx] = val;
        onChange(next.map(a => a || ' ').join(''));
        return next;
      });
    };
    return (
      <div className="flex flex-col gap-4">
        <div className="space-y-3">
          {['a', 'b', 'c', 'd'].map((l, i) => (
            <div key={l} className="flex gap-4 items-center bg-[#f8fafc] p-4 rounded-[1.5rem] border-2 border-slate-50 shadow-sm h-auto">
              <span className="font-bold text-blue-600 w-8 italic text-lg">{l})</span>
              <div className="flex-1 font-medium text-slate-800 text-sm italic leading-tight"><LatexRenderer content={problem.options?.[i] || '...'} /></div>
              <div className="flex gap-2">
                {(['Đ', 'S'] as const).map(v => (
                  <button key={v} disabled={disabled} onClick={() => handleToggleDS(i, v)} className={`w-11 h-11 rounded-lg font-bold transition-all text-sm ${dsAnswers[i] === v ? (v === 'Đ' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white') : 'bg-white text-slate-300 border border-slate-100'}`}>{v}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={onSubmit} disabled={disabled || value.replace(/\s/g, '').length < 4} className={`w-full py-5 mt-4 rounded-[2rem] font-bold uppercase italic shadow-md text-lg ${value.replace(/\s/g, '').length < 4 ? 'bg-slate-100 text-slate-300' : 'bg-emerald-600 text-white'}`}>XÁC NHẬN ✅</button>
      </div>
    );
  }

  // SHORT ANSWER (TL) - HIỂN THỊ BÀN PHÍM SỐ
  return (
    <div className="flex flex-col gap-4">
      {/* Màn hình hiển thị số đang nhập */}
      <div className="bg-slate-900 p-6 rounded-[2rem] shadow-lg border-b-4 border-slate-800">
         <div className="text-[10px] font-black text-slate-500 uppercase italic mb-2 tracking-widest">ĐÁP ÁN CỦA BẠN:</div>
         <div className="min-h-[80px] flex items-center justify-center bg-slate-800 rounded-2xl border-2 border-slate-700">
            <span className="text-4xl font-black text-yellow-400 italic tracking-widest">
               {value || <span className="text-slate-600 animate-pulse">|</span>}
            </span>
         </div>
      </div>

      {/* Bàn phím số */}
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '.'].map((key) => (
          <button
            key={key}
            disabled={disabled}
            onClick={() => handleNumClick(key)}
            className="h-16 bg-white border-2 border-slate-100 rounded-2xl font-black text-2xl text-slate-700 shadow-sm hover:bg-blue-50 hover:border-blue-200 active:scale-95 transition-all"
          >
            {key}
          </button>
        ))}
        <button
          disabled={disabled}
          onClick={handleClear}
          className="col-span-1 h-16 bg-rose-50 text-rose-500 border-2 border-rose-100 rounded-2xl font-black uppercase italic text-xs shadow-sm hover:bg-rose-500 hover:text-white transition-all"
        >
          Xóa hết
        </button>
        <button
          disabled={disabled}
          onClick={handleBackspace}
          className="col-span-2 h-16 bg-slate-100 text-slate-600 border-2 border-slate-200 rounded-2xl font-black text-2xl shadow-sm hover:bg-slate-200 transition-all"
        >
          ⌫
        </button>
      </div>

      <button 
        onClick={onSubmit} 
        disabled={disabled || !value} 
        className={`w-full py-5 rounded-[2rem] font-bold text-xl uppercase italic transition-all shadow-lg active:scale-95 ${!value ? 'bg-slate-100 text-slate-300' : 'bg-emerald-600 text-white shadow-emerald-500/20 hover:bg-emerald-500'}`}
      >
        GỬI KẾT QUẢ 🚀
      </button>
    </div>
  );
};

export default React.memo(AnswerInput);
