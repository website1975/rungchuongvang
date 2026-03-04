
import React, { useState, useEffect, useRef } from 'react';
import { PhysicsProblem, Round, Difficulty, QuestionType, DisplayChallenge, GameState, GameSettings, InteractiveMechanic, Player } from '../types';
import LatexRenderer from './LatexRenderer';
import { supabase } from '../services/supabaseService';
import ConfirmModal from './ConfirmModal';

interface AdminPanelProps {
  rounds: Round[];
  setRounds: (rounds: Round[]) => void;
  settings: GameSettings;
  setSettings: (s: GameSettings) => void;
  onStartGame: (roomCode?: string) => void;
  currentGameState: GameState;
  onNextQuestion: () => void;
  currentProblemIdx: number;
  totalProblems: number;
  players?: Player[];
  myPlayerId?: string;
  teacherId: string;
  examSets: any[];
  onSaveSet: (title: string, asNew: boolean, topic: string, grade: string) => Promise<void>; 
  adminTab: 'EDITOR' | 'CONTROL' | 'CLOUD' | 'LAB';
  setAdminTab: (tab: 'EDITOR' | 'CONTROL' | 'CLOUD' | 'LAB') => void;
  loadedSetTitle: string | null;
  loadedSetId: string | null;
  loadedSetTopic?: string | null;
  categories: string[];
  fullView?: boolean;
  onResetToNew: () => void;
  onLoadSet: (setId: string, title: string) => Promise<boolean>;
  liveSessionKey?: number;
}

interface StudentStat {
  name: string;
  score: number;
  status: 'Waiting' | 'Answering' | 'Correct' | 'Incorrect';
  answers: Record<number, string>;
  isOnline: boolean;
}

const AdminPanel: React.FC<AdminPanelProps> = (props) => {
  const { rounds = [], onSaveSet, loadedSetTitle, loadedSetId, adminTab, liveSessionKey } = props;

  const [activeRoundIdx, setActiveRoundIdx] = useState(0);
  const [status, setStatus] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [currentSessionCode, setCurrentSessionCode] = useState('');
  const [studentStats, setStudentStats] = useState<Record<string, StudentStat>>({});
  const [isLiveGameActive, setIsLiveGameActive] = useState(false);
  const [isShowingIntro, setIsShowingIntro] = useState(false);
  const [liveProblemIdx, setLiveProblemIdx] = useState(0); 
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const controlChannelRef = useRef<any>(null);

  useEffect(() => {
    if (adminTab === 'CONTROL') {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setCurrentSessionCode(code);
      setIsLiveGameActive(false);
      setIsShowingIntro(false);
      setLiveProblemIdx(0);
      setActiveRoundIdx(0); // Reset round index
      setStudentStats({});
    }
  }, [liveSessionKey, adminTab]);

  // Logic kết nối kênh Realtime - Ổn định hóa dependencies
  useEffect(() => {
    if (adminTab === 'CONTROL' && currentSessionCode) {
      const channelName = `arena_room_${currentSessionCode}`;
      const channel = supabase.channel(channelName, {
        config: { presence: { key: 'teacher' } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const players = Object.keys(state)
            .filter(key => !key.includes('teacher'))
            .map(key => key.split('_')[0]);
          
          setStudentStats(prev => {
            const next = { ...prev };
            // Mark everyone as offline first
            Object.keys(next).forEach(name => {
              next[name].isOnline = false;
            });
            // Mark current players as online and add new ones
            players.forEach(p => {
              if (!next[p]) {
                next[p] = { name: p, score: 0, status: 'Waiting', answers: {}, isOnline: true };
              } else {
                next[p].isOnline = true;
              }
            });
            return next;
          });
        })
        .on('broadcast', { event: 'buzzer_pressed' }, ({ payload }) => {
          setStudentStats(prev => ({
            ...prev,
            [payload.winnerName]: { ...prev[payload.winnerName], status: 'Answering' }
          }));
        })
        .on('broadcast', { event: 'sync_result' }, ({ payload }) => {
          setStudentStats(prev => ({
            ...prev,
            [payload.playerName]: { 
              ...prev[payload.playerName], 
              status: payload.isCorrect ? 'Correct' : 'Incorrect',
              score: payload.currentScore || 0,
              answers: { ...prev[payload.playerName]?.answers, [payload.problemIdx ?? 0]: payload.answer }
            }
          }));
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ role: 'teacher', online_at: new Date().toISOString() });
          }
        });

      controlChannelRef.current = channel;
      return () => { supabase.removeChannel(channel); };
    }
  }, [adminTab, currentSessionCode]); // Chỉ phụ thuộc vào tab và mã phòng

  // Heartbeat để đồng bộ hóa trạng thái cho các máy bị kẹt
  useEffect(() => {
    if (!isLiveGameActive || !controlChannelRef.current) return;
    
    const interval = setInterval(() => {
      controlChannelRef.current.send({
        type: 'broadcast',
        event: 'room_heartbeat',
        payload: {
          currentRoundIndex: activeRoundIdx,
          currentQuestionIndex: liveProblemIdx,
          isShowingIntro: isShowingIntro,
          isLiveGameActive: isLiveGameActive
        }
      });
    }, 3000); // Mỗi 3 giây phát 1 lần

    return () => clearInterval(interval);
  }, [isLiveGameActive, liveProblemIdx, isShowingIntro]);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setStatus({ text, type });
    setTimeout(() => setStatus(null), 3000);
  };

  const handleStartLiveMatch = () => {
    if (Object.keys(studentStats).length === 0) {
      notify("Cần ít nhất 1 thí sinh!", "error");
      return;
    }
    setIsLiveGameActive(true);
    setIsShowingIntro(true); 
    setLiveProblemIdx(0);
    
    controlChannelRef.current?.send({
      type: 'broadcast',
      event: 'teacher_start_game',
      payload: { 
        setId: loadedSetId, 
        title: loadedSetTitle, 
        rounds: rounds, 
        currentRoundIndex: activeRoundIdx,
        currentQuestionIndex: 0,
        roomCode: currentSessionCode 
      }
    });
  };

  const handleShowQuestion = () => {
    setIsShowingIntro(false);
    controlChannelRef.current?.send({
      type: 'broadcast',
      event: 'teacher_show_question',
      payload: { index: liveProblemIdx }
    });
  };

  const handleNextLiveQuestion = () => {
    const totalInRound = rounds[activeRoundIdx]?.problems?.length || 0;
    const nextIdx = liveProblemIdx + 1;
    
    if (nextIdx >= totalInRound) { 
      // Check if there's a next round
      if (activeRoundIdx + 1 < rounds.length) {
        const nextRoundIdx = activeRoundIdx + 1;
        setActiveRoundIdx(nextRoundIdx);
        setLiveProblemIdx(0);
        setIsShowingIntro(true); // Show intro for the new round

        setStudentStats(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => { next[k].status = 'Waiting'; });
            return next;
        });

        controlChannelRef.current?.send({ 
          type: 'broadcast', 
          event: 'teacher_next_round',
          payload: { nextRoundIndex: nextRoundIdx }
        });
        notify(`Bắt đầu Vòng ${nextRoundIdx + 1}!`);
      } else {
        notify("Đã hết tất cả câu hỏi và vòng đấu!", "error"); 
      }
      return; 
    }
    
    setLiveProblemIdx(nextIdx);
    setIsShowingIntro(false); 
    
    setStudentStats(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { next[k].status = 'Waiting'; });
        return next;
    });

    controlChannelRef.current?.send({ 
      type: 'broadcast', 
      event: 'teacher_next_question',
      payload: { nextIndex: nextIdx }
    });
  };

  const handleResetBuzzer = () => {
    controlChannelRef.current?.send({ type: 'broadcast', event: 'teacher_reset_buzzer' });
    setStudentStats(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => { if (next[k].status === 'Answering') next[k].status = 'Waiting'; });
        return next;
    });
    notify("Đã reset chuông!");
  };

  const handleShowExplanation = () => {
    controlChannelRef.current?.send({ type: 'broadcast', event: 'teacher_show_explanation' });
    notify("Đã hiển thị đáp án cho cả lớp!");
  };

  const currentRound = rounds?.[activeRoundIdx] || null;
  const studentsArr: StudentStat[] = Object.values(studentStats || {});
  const currentBuzzerWinner = studentsArr.find(s => s.status === 'Answering')?.name;
  const currentProblem = currentRound?.problems?.[liveProblemIdx] || null;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 text-left h-full">
         {showHistoryModal && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6">
               <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setShowHistoryModal(false)}></div>
               <div className="bg-white rounded-[3rem] w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col relative z-10 border-4 border-slate-100 shadow-2xl">
                  <div className="p-8 border-b-2 border-slate-50 flex justify-between items-center bg-slate-50/50">
                     <h3 className="text-2xl font-black uppercase italic text-slate-800">Lịch sử trả lời chi tiết</h3>
                     <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-rose-500 text-3xl">✕</button>
                  </div>
                  <div className="flex-1 overflow-auto p-8">
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr className="bg-slate-900 text-white">
                              <th className="p-4 font-black italic uppercase text-[10px] border border-slate-800 rounded-tl-2xl">STT</th>
                              <th className="p-4 font-black italic uppercase text-[10px] border border-slate-800">Họ và tên</th>
                              {Array.from({ length: currentRound?.problems?.length || 0 }).map((_, i) => (
                                 <th key={i} className="p-4 font-black italic uppercase text-[10px] border border-slate-800 text-center">Câu {i+1}</th>
                              ))}
                           </tr>
                           <tr className="bg-emerald-50 text-emerald-700">
                              <td className="p-4 font-black italic text-[10px] border border-emerald-100">-</td>
                              <td className="p-4 font-black italic text-[10px] border border-emerald-100 uppercase">Đáp án đúng</td>
                              {currentRound?.problems?.map((p, i) => (
                                 <td key={i} className="p-4 font-black text-center border border-emerald-100">{p.correctAnswer}</td>
                              ))}
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {studentsArr.map((s, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                 <td className="p-4 font-bold text-slate-400 text-center border border-slate-50">{idx + 1}</td>
                                 <td className="p-4 font-black text-slate-800 uppercase italic border border-slate-50">{s.name}</td>
                                 {Array.from({ length: currentRound?.problems?.length || 0 }).map((_, i) => (
                                    <td key={i} className="p-4 text-center border border-slate-50 font-bold">
                                       <span className={s.answers[i] === currentRound?.problems[i]?.correctAnswer ? 'text-emerald-500' : 'text-rose-500'}>
                                          {s.answers[i] || '-'}
                                       </span>
                                    </td>
                                 ))}
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         )}

         <header className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 shrink-0">
            <div className="flex items-center gap-6">
               <div className="bg-blue-600 text-white p-5 rounded-[2rem] text-center min-w-[160px] shadow-lg shadow-blue-500/20">
                  <span className="text-[10px] font-bold uppercase text-blue-100 block mb-1">MÃ PHÒNG</span>
                  <div className="text-3xl font-black tracking-widest uppercase italic leading-none">{currentSessionCode || '...'}</div>
               </div>
               <div>
                  <h3 className="text-2xl font-bold text-slate-800 uppercase italic leading-none">{loadedSetTitle || 'ARENA LIVE'}</h3>
                  <p className="text-[10px] font-medium text-slate-400 uppercase mt-2 italic tracking-widest">
                    Vòng {activeRoundIdx + 1} • {currentRound?.problems?.length || 0} Câu hỏi
                  </p>
               </div>
            </div>
            
            <div className="flex items-center gap-3">
               {isLiveGameActive && (
                 <>
                   <button 
                     onClick={handleShowExplanation}
                     className="px-6 py-4 bg-emerald-100 text-emerald-600 rounded-2xl font-black uppercase italic hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center gap-2"
                   >
                     <span>✨</span> HIỆN ĐÁP ÁN
                   </button>
                   <button 
                     onClick={handleResetBuzzer}
                     className="px-6 py-4 bg-rose-100 text-rose-600 rounded-2xl font-black uppercase italic hover:bg-rose-600 hover:text-white transition-all shadow-sm flex items-center gap-2"
                   >
                     <span>🔔</span> RESET CHUÔNG
                   </button>
                 </>
               )}
               
               <div className="h-10 w-[2px] bg-slate-100 mx-2"></div>

               {!isLiveGameActive ? (
                 <button onClick={handleStartLiveMatch} className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-bold uppercase italic shadow-lg hover:bg-blue-500 transition-all">
                   ⚡ BẮT ĐẦU SHOW
                 </button>
               ) : isShowingIntro ? (
                 <button onClick={handleShowQuestion} className="px-10 py-4 bg-emerald-600 text-white rounded-2xl font-bold uppercase italic shadow-lg hover:bg-emerald-500 transition-all">
                   🚀 HIỂN THỊ CÂU {liveProblemIdx + 1}
                 </button>
               ) : (
                 <button onClick={handleNextLiveQuestion} className="px-10 py-4 bg-amber-500 text-white rounded-2xl font-bold uppercase italic shadow-lg hover:bg-amber-400 transition-all">
                   ⏩ CÂU TIẾP THEO
                 </button>
               )}
            </div>
         </header>

         <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
            <div className="col-span-8 flex flex-col h-full">
               <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex-1 flex flex-col">
                  <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
                    <h4 className="font-bold text-slate-400 uppercase italic text-xs tracking-widest">BẢNG TRÌNH CHIẾU</h4>
                  </div>
                  <div className="flex-1 p-6 flex flex-col justify-start text-center relative overflow-y-auto no-scrollbar">
                    {isShowingIntro ? (
                      <div className="animate-in zoom-in flex flex-col items-center">
                         <div className="text-8xl mb-10 animate-bounce">🚀</div>
                         <h2 className="text-5xl font-black text-slate-800 uppercase italic tracking-tighter mb-4 leading-none">SẴN SÀNG CHƯA?</h2>
                         {currentRound?.description && (
                            <div className="bg-slate-50 px-10 py-6 rounded-[2rem] mb-6 border border-slate-100 max-w-xl">
                               <p className="text-slate-600 italic font-medium text-lg leading-relaxed">{currentRound.description}</p>
                            </div>
                         )}
                         <p className="text-blue-500 font-bold uppercase tracking-[0.4em] text-sm animate-pulse">ĐỢI GIÁO VIÊN NHẤN HIỂN THỊ</p>
                      </div>
                    ) : (
                    <div className="flex flex-col gap-4">
                       <div className="flex justify-between items-center w-full mb-2">
                          <div className="text-slate-400 font-black italic uppercase text-[10px] tracking-widest border border-slate-100 px-4 py-1 rounded-full">Nội dung câu {liveProblemIdx + 1}</div>
                          <div className="bg-emerald-500 text-white px-4 py-1 rounded-full font-black text-xs uppercase italic animate-pulse">
                             Đáp án: {currentProblem?.correctAnswer}
                          </div>
                       </div>
                       <div className="text-lg font-bold text-slate-800 italic leading-snug text-left mb-2 w-full bg-blue-50/30 p-4 rounded-2xl border border-blue-100/50">
                          <span className="font-black text-blue-600 mr-2 not-italic">CÂU:</span>
                          <LatexRenderer content={currentProblem?.content || ""} />
                       </div>
                       
                       {currentProblem?.options && currentProblem.options.length > 0 && (
                         <div className="grid grid-cols-2 gap-3 w-full text-left">
                           {currentProblem.options.map((opt, idx) => (
                             <div key={idx} className={`text-sm font-bold flex items-start gap-2 p-3 rounded-xl border ${currentProblem.correctAnswer === String.fromCharCode(65 + idx) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                               <span className={`${currentProblem.correctAnswer === String.fromCharCode(65 + idx) ? 'text-emerald-600' : 'text-blue-600'} min-w-[24px] font-black`}>{String.fromCharCode(65 + idx)}.</span>
                               <LatexRenderer content={opt} />
                             </div>
                           ))}
                         </div>
                       )}
                    </div>
                    )}
                  </div>
               </div>
            </div>

            <div className="col-span-4 flex flex-col gap-6 h-full overflow-hidden">
               <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col h-full">
                  <div className="flex justify-between items-center mb-6 shrink-0">
                    <h4 className="text-lg font-bold text-slate-800 uppercase italic">THÍ SINH ({studentsArr.length})</h4>
                    <button onClick={() => setShowHistoryModal(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase italic shadow-lg hover:bg-black">Danh sách 📊</button>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-1 no-scrollbar">
                     <table className="w-full text-left">
                        <thead className="sticky top-0 bg-white z-10">
                           <tr className="border-b-2 border-slate-50">
                              <th className="pb-4 font-black text-[10px] text-slate-400 uppercase italic">Tên HS</th>
                              <th className="pb-4 font-black text-[10px] text-slate-400 uppercase italic text-center">Tình trạng</th>
                              <th className="pb-4 font-black text-[10px] text-slate-400 uppercase italic text-right">Tổng điểm</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {studentsArr.map((s, i) => (
                              <tr key={i} className={`hover:bg-slate-50 transition-colors ${currentBuzzerWinner === s.name ? 'bg-blue-50' : ''} ${!s.isOnline ? 'opacity-40 grayscale' : ''}`}>
                                 <td className="py-2 font-black text-slate-700 uppercase italic text-[11px]">
                                   {s.name} {!s.isOnline && <span className="text-[8px] text-rose-400 ml-1">(OFF)</span>}
                                 </td>
                                 <td className="py-2 text-center">
                                    {s.status === 'Answering' ? (
                                      <span className="text-blue-500 font-black italic text-[9px] animate-pulse">ĐANG TL...</span>
                                    ) : s.status === 'Correct' ? (
                                      <span className="text-emerald-500 font-black italic text-[9px]">ĐÚNG ✅</span>
                                    ) : s.status === 'Incorrect' ? (
                                      <span className="text-rose-500 font-black italic text-[9px]">SAI ❌</span>
                                    ) : (
                                      <span className="text-slate-300 font-black italic text-[9px]">...</span>
                                    )}
                                 </td>
                                 <td className="py-2 text-right font-black text-blue-600 italic text-xs">{s.score}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                     {studentsArr.length === 0 && <div className="py-20 text-center opacity-20 italic text-sm">Chưa có ai tham gia...</div>}
                  </div>
               </div>
            </div>
         </div>
         {status && (
            <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl font-bold uppercase italic shadow-2xl animate-in slide-in-from-bottom-4 ${status.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
              {status.text}
            </div>
         )}
      </div>
  );
};

export default AdminPanel;
