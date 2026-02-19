
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Round, Teacher, PhysicsProblem } from '../types';
import ProblemCard from './ProblemCard';
import AnswerInput from './AnswerInput';
import LatexRenderer from './LatexRenderer';
import Whiteboard from './Whiteboard';
import { supabase } from '../services/supabaseService';
import ConfirmModal from './ConfirmModal';

interface GameEngineProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  currentTeacher?: Teacher; // Có thể undefined đối với học sinh
  matchData: {
    setId: string;
    title: string;
    rounds: Round[];
    opponentName?: string;
    joinedRoom?: any;
    startIndex?: number;
    roomCode?: string;
  };
  onExit: () => void;
}

const GameEngine: React.FC<GameEngineProps> = ({ 
  gameState, setGameState, playerName, matchData, onExit 
}) => {
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(matchData.startIndex || 0);
  const [score, setScore] = useState(0);
  const [answer, setAnswer] = useState('');
  const [timer, setTimer] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  const [isEliminatedFromCurrent, setIsEliminatedFromCurrent] = useState(false);
  const [isTeacherWhiteboardActive, setIsTeacherWhiteboardActive] = useState(false);
  const [teacherForcedExplanation, setTeacherForcedExplanation] = useState(false);
  
  const [buzzerWinner, setBuzzerWinner] = useState<string | null>(null);
  const [uniqueId] = useState(() => Math.random().toString(36).substring(7));
  const channelRef = useRef<any>(null);
  const buzzerWinnerRef = useRef<string | null>(null);

  const currentRound = matchData?.rounds?.[currentRoundIdx] || null;
  const currentProblem = currentRound?.problems?.[currentProblemIdx] || null;

  // Logic kết nối kênh Realtime
  useEffect(() => {
    const roomCode = matchData?.roomCode;
    if (!roomCode) return;
    
    const channelName = `arena_room_${roomCode}`;
    const presenceKey = `${playerName}_${uniqueId}`;
    
    const channel = supabase.channel(channelName, {
      config: { presence: { key: presenceKey } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {})
      .on('broadcast', { event: 'buzzer_pressed' }, ({ payload }) => {
        if (!buzzerWinnerRef.current) {
          buzzerWinnerRef.current = payload.winnerName;
          setBuzzerWinner(payload.winnerName);
          if (payload.winnerName !== playerName) setGameState('ANSWERING'); 
        }
      })
      .on('broadcast', { event: 'sync_result' }, ({ payload }) => {
        if (payload.playerName === playerName || buzzerWinnerRef.current === playerName) {
           setIsCorrect(payload.isCorrect);
           if (!payload.isCorrect) setIsEliminatedFromCurrent(true);
        }
        setIsAnswered(true);
        setGameState('FEEDBACK');
      })
      .on('broadcast', { event: 'teacher_show_question' }, () => {
        setGameState('STARTING_ROUND');
      })
      .on('broadcast', { event: 'teacher_next_question' }, ({ payload }) => {
        setCurrentProblemIdx(payload.nextIndex);
        setIsEliminatedFromCurrent(false);
        setIsTeacherWhiteboardActive(false);
        setTeacherForcedExplanation(false);
        setGameState('STARTING_ROUND'); 
      })
      .on('broadcast', { event: 'teacher_reset_buzzer' }, () => {
        buzzerWinnerRef.current = null;
        setBuzzerWinner(null);
        setAnswer('');
        setIsAnswered(false);
        if (!isEliminatedFromCurrent) {
          setGameState('WAITING_FOR_BUZZER');
        } else {
          setGameState('FEEDBACK'); 
        }
      })
      .on('broadcast', { event: 'teacher_show_explanation' }, () => {
        setTeacherForcedExplanation(true);
        setIsAnswered(true);
        setGameState('FEEDBACK');
      })
      .on('broadcast', { event: 'toggle_whiteboard' }, ({ payload }) => {
        setIsTeacherWhiteboardActive(payload.isActive);
      })
      .on('broadcast', { event: 'teacher_reset_room' }, () => onExit())
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ role: 'student', online_at: new Date().toISOString(), status: 'playing' });
        }
      });

    channelRef.current = channel;
    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [matchData?.roomCode, playerName, uniqueId, onExit, setGameState, isEliminatedFromCurrent]);

  useEffect(() => {
    if (gameState === 'STARTING_ROUND') {
      setAnswer('');
      setIsAnswered(false);
      setBuzzerWinner(null);
      buzzerWinnerRef.current = null;
      setIsEliminatedFromCurrent(false);
      setIsTeacherWhiteboardActive(false);
      setTeacherForcedExplanation(false);
      setTimer(currentProblem?.timeLimit || 40);
      setGameState('WAITING_FOR_BUZZER');
    }
  }, [gameState, currentProblem?.timeLimit, setGameState]);

  const handleBuzzerClick = () => {
    if (buzzerWinnerRef.current || !channelRef.current || isEliminatedFromCurrent) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'buzzer_pressed',
      payload: { winnerName: playerName }
    });
    buzzerWinnerRef.current = playerName;
    setBuzzerWinner(playerName);
    setGameState('ANSWERING');
  };

  const handleAnswerSubmit = useCallback(() => {
    if (isAnswered || !currentProblem) return;
    const correct = answer.trim().toUpperCase() === currentProblem.correctAnswer.trim().toUpperCase();
    const newScore = score + (correct ? 100 : -50);
    
    channelRef.current?.send({
      type: 'broadcast',
      event: 'sync_result',
      payload: { 
        isCorrect: correct, 
        playerName, 
        currentScore: newScore,
        answer: answer
      }
    });
    
    setIsCorrect(correct);
    if (!correct) setIsEliminatedFromCurrent(true); 
    setIsAnswered(true);
    setScore(newScore);
    setGameState('FEEDBACK');
  }, [isAnswered, currentProblem, answer, playerName, score, setGameState]);

  useEffect(() => {
    let interval: number;
    if ((gameState === 'ANSWERING' || gameState === 'WAITING_FOR_BUZZER') && timer > 0 && !isAnswered && !isTeacherWhiteboardActive) {
      interval = window.setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            if (gameState === 'ANSWERING' && buzzerWinner === playerName) handleAnswerSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState, timer, isAnswered, handleAnswerSubmit, buzzerWinner, playerName, isTeacherWhiteboardActive]);

  if (gameState === 'ROUND_INTRO') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 animate-in fade-in duration-700">
        <div className="text-9xl mb-12 animate-bounce">🚀</div>
        <h1 className="text-7xl font-black text-white italic uppercase tracking-tighter text-center leading-none mb-4">SẴN SÀNG CHƯA?</h1>
        
        {currentRound?.description && (
          <div className="max-w-2xl text-center mb-10 p-10 bg-white/5 border border-white/10 rounded-[3rem] shadow-2xl">
             <div className="text-emerald-500 font-black uppercase text-[10px] tracking-widest mb-4">Thông tin vòng đấu</div>
             <p className="text-white text-3xl font-medium italic leading-relaxed">{currentRound.description}</p>
          </div>
        )}

        <p className="text-blue-400 font-bold uppercase tracking-[0.4em] text-xl animate-pulse text-center">ĐỢI GIÁO VIÊN PHÁT ĐỀ...</p>
        
        <div className="mt-16 flex items-center gap-4 bg-white/5 px-10 py-5 rounded-full border border-white/10">
           <div className="w-4 h-4 bg-emerald-500 rounded-full animate-ping"></div>
           <span className="text-white font-bold uppercase italic text-xs">Live Arena Sync</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 flex flex-col gap-6 overflow-y-auto">
      <ConfirmModal isOpen={showExitConfirm} title="Rời Show?" message="Bạn có muốn rời khỏi Đấu Trường?" onConfirm={onExit} onCancel={() => setShowExitConfirm(false)} isDestructive={true} />

      <header className="w-full max-w-screen-2xl mx-auto bg-white p-3 px-8 rounded-[2rem] shadow-sm flex items-center justify-between shrink-0 border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 text-white px-8 py-1.5 rounded-full font-bold text-xl shadow-md">
             {score}đ
          </div>
          <div className="text-slate-300 font-medium uppercase text-[10px] tracking-widest">
            PHÒNG: {matchData?.roomCode || '---'}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <span className="text-blue-500 italic font-bold text-2xl mr-3">Time :</span>
          <span className="font-bold text-slate-800 text-5xl italic tracking-tighter">{timer}</span>
          <span className="text-slate-800 font-medium text-lg ml-1">s</span>
        </div>

        <button onClick={() => setShowExitConfirm(true)} className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all">
           <span className="text-xl">✕</span>
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-screen-2xl mx-auto w-full mb-8 h-auto overflow-hidden">
        <div className="lg:col-span-7 h-full">
            {isTeacherWhiteboardActive ? (
              <div className="bg-white rounded-[2.5rem] p-4 shadow-sm h-[600px] border border-slate-100">
                 <div className="h-full bg-slate-950 rounded-[2rem] overflow-hidden">
                    <Whiteboard isTeacher={false} channel={channelRef.current} roomCode={matchData.roomCode || '---'} />
                 </div>
              </div>
            ) : currentProblem ? (
              <ProblemCard problem={currentProblem} isPaused={gameState === 'FEEDBACK'} />
            ) : (
              <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 h-full flex items-center justify-center">
                 <p className="text-slate-300 font-bold italic uppercase animate-pulse">Đang đợi câu hỏi...</p>
              </div>
            )}
        </div>
        
        <div className="lg:col-span-5 bg-white rounded-[2.5rem] p-8 shadow-sm flex flex-col h-full border border-slate-100 overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-8 shrink-0">
                <h4 className="text-slate-400 font-bold italic uppercase text-[11px] tracking-widest">KHU VỰC PHẢN ỨNG:</h4>
            </div>

            {isTeacherWhiteboardActive ? (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                    <div className="text-7xl mb-6">👨‍🏫</div>
                    <h3 className="text-2xl font-bold text-slate-800 uppercase italic">THẦY ĐANG GIẢNG BÀI</h3>
                </div>
            ) : isEliminatedFromCurrent && gameState !== 'FEEDBACK' ? (
                 <div className="py-20 flex flex-col items-center justify-center text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-red-100">
                    <div className="text-7xl mb-6 opacity-30">🔔</div>
                    <h4 className="text-2xl font-bold text-red-500 uppercase italic text-center">BẠN ĐÃ BỊ LOẠI</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase mt-4 italic">Đợi giáo viên reset chuông hoặc chuyển câu</p>
                 </div>
            ) : gameState === 'WAITING_FOR_BUZZER' ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                    <button 
                        onClick={handleBuzzerClick}
                        disabled={isEliminatedFromCurrent}
                        className={`w-64 h-64 rounded-full text-white shadow-[0_20px_0_rgb(153,27,27),0_30px_50px_rgba(220,38,38,0.4)] active:translate-y-[10px] transition-all flex flex-col items-center justify-center ${isEliminatedFromCurrent ? 'bg-slate-300 grayscale opacity-50' : 'bg-red-600'}`}
                    >
                        <span className="text-8xl drop-shadow-md">🔔</span>
                        <span className="text-xl font-bold italic uppercase mt-2">RUNG CHUÔNG!</span>
                    </button>
                </div>
            ) : gameState === 'FEEDBACK' ? (
                <div className="flex flex-col items-center justify-center text-center h-full">
                    <div className={`text-9xl mb-4 ${isCorrect || teacherForcedExplanation ? 'text-emerald-500' : 'text-rose-500 animate-bounce'}`}>{isCorrect || teacherForcedExplanation ? '✅' : '❌'}</div>
                    <h3 className={`text-4xl font-black uppercase italic mb-6 ${isCorrect || teacherForcedExplanation ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {teacherForcedExplanation ? 'ĐÁP ÁN CHI TIẾT' : isCorrect ? 'CHÍNH XÁC!' : 'CHƯA ĐÚNG!'}
                    </h3>
                    
                    {isCorrect || teacherForcedExplanation ? (
                      <div className="bg-emerald-50 p-8 rounded-[2.5rem] w-full border-4 border-emerald-100 text-left shadow-xl shadow-emerald-500/10 animate-in slide-in-from-bottom-4">
                          <div className="text-[10px] font-black text-emerald-600 uppercase mb-3 italic tracking-[0.2em] flex items-center gap-2">
                             <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> HƯỚNG DẪN CHI TIẾT
                          </div>
                          <div className="text-xl font-medium text-slate-700 italic leading-relaxed">
                            <LatexRenderer content={currentProblem?.explanation || ''} />
                            <div className="mt-4 pt-4 border-t border-emerald-100 flex justify-between">
                               <span className="text-[10px] font-black uppercase italic text-emerald-500">ĐÁP ÁN ĐÚNG:</span>
                               <span className="text-xl font-black text-emerald-700">{currentProblem?.correctAnswer}</span>
                            </div>
                          </div>
                      </div>
                    ) : (
                      <div className="bg-rose-50 p-10 rounded-[2.5rem] w-full border-4 border-rose-100 flex flex-col items-center text-center shadow-xl shadow-rose-500/10">
                          <div className="text-rose-600 font-black uppercase italic text-lg leading-tight mb-2">BẠN ĐÃ TRẢ LỜI SAI</div>
                          <p className="text-rose-400 font-bold italic text-sm">Vui lòng chờ xem kết quả chi tiết sau khi câu hỏi kết thúc...</p>
                          <div className="mt-6 flex items-center gap-2">
                             <div className="w-2 h-2 bg-rose-400 rounded-full animate-pulse"></div>
                             <div className="w-2 h-2 bg-rose-400 rounded-full animate-pulse delay-75"></div>
                             <div className="w-2 h-2 bg-rose-400 rounded-full animate-pulse delay-150"></div>
                          </div>
                      </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col h-full">
                    {buzzerWinner && buzzerWinner !== playerName ? (
                        <div className="py-20 flex flex-col items-center justify-center text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-100">
                            <div className="text-6xl mb-6 animate-pulse">⏳</div>
                            <h4 className="text-xl font-bold text-slate-800 uppercase italic text-center">
                                <span className="text-blue-600">{buzzerWinner}</span> ĐANG TRẢ LỜI...
                            </h4>
                        </div>
                    ) : (
                        <div className="flex flex-col text-left">
                            <div className="text-[11px] font-bold text-slate-400 uppercase italic mb-6 tracking-widest">CHỌN ĐÁP ÁN ĐÚNG:</div>
                            <div className="w-full">
                                {currentProblem ? (
                                  <AnswerInput 
                                    problem={currentProblem} 
                                    value={answer} 
                                    onChange={setAnswer} 
                                    onSubmit={handleAnswerSubmit} 
                                    disabled={isAnswered} 
                                  />
                                ) : (
                                  <div className="p-10 text-center text-slate-300 italic">Chờ câu hỏi...</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default GameEngine;
