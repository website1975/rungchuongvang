
import React, { useState, useEffect, useRef } from 'react';
import { GameState } from '../types';
import { supabase } from '../services/supabaseService';

interface StudentArenaFlowProps {
  gameState: GameState;
  setGameState: (s: GameState) => void;
  playerName: string;
  onStartMatch: (data: any) => void;
}

const StudentArenaFlow: React.FC<StudentArenaFlowProps> = ({ 
  gameState, setGameState, playerName, onStartMatch
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [presentPlayers, setPresentPlayers] = useState<string[]>([]);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [activeRoomCode, setActiveRoomCode] = useState('');
  const [uniqueId] = useState(() => Math.random().toString(36).substring(7));
  const channelRef = useRef<any>(null);
  const isTransitioningRef = useRef(false); // Flag để chặn lỗi "bị đá ra"

  const handleJoinRoom = () => {
    if (!roomCodeInput || roomCodeInput.length < 4) {
      setError('Mã phòng không hợp lệ!');
      return;
    }
    setError('');
    setActiveRoomCode(roomCodeInput.toUpperCase());
    setGameState('WAITING_FOR_PLAYERS');
  };

  useEffect(() => {
    if (gameState === 'WAITING_FOR_PLAYERS' && activeRoomCode) {
      const presenceKey = `${playerName}_${uniqueId}`;
      const channelName = `arena_room_${activeRoomCode}`;
      
      const channel = supabase.channel(channelName, {
        config: { presence: { key: presenceKey } }
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const playersKeys = Object.keys(state).sort();
          const playerNames = playersKeys
            .filter(k => !k.includes('teacher'))
            .map(k => k.split('_')[0]);
          setPresentPlayers(playerNames);

          const hasTeacher = Object.keys(state).some(k => k.includes('teacher'));
          if (!hasTeacher) {
            setError('Giáo viên đã rời phòng.');
          } else {
            setError('');
          }
        })
        .on('broadcast', { event: 'teacher_start_game' }, ({ payload }) => {
          isTransitioningRef.current = true; // Đánh dấu đang chuyển cảnh
          onStartMatch({ 
            setId: payload.setId, 
            title: payload.title, 
            rounds: payload.rounds, 
            opponentName: "Cả lớp",
            roomCode: payload.roomCode,
            startIndex: payload.currentQuestionIndex || 0 
          });
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ role: 'student', online_at: new Date().toISOString(), status: 'waiting' });
          }
          // CHỈ xử lý lỗi khi KHÔNG phải đang chuyển vào trận đấu
          if (!isTransitioningRef.current && (status === 'CLOSED' || status === 'CHANNEL_ERROR')) {
            setError('Lỗi kết nối phòng. Vui lòng thử lại!');
            setGameState('ENTER_CODE');
          }
        });

      channelRef.current = channel;
      return () => { 
        // Khi unmount, Supabase sẽ tự động đóng channel
        supabase.removeChannel(channel); 
      };
    }
  }, [gameState, activeRoomCode, playerName, uniqueId, onStartMatch, setGameState]);

  if (gameState === 'ENTER_CODE') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-md w-full text-center border-b-[12px] border-blue-600 animate-in slide-in-from-bottom-4">
          <div className="text-5xl mb-6">🔑</div>
          <h2 className="text-3xl font-black text-slate-800 uppercase italic mb-2">NHẬP MÃ PHÒNG</h2>
          <p className="text-slate-400 font-bold uppercase text-[10px] mb-8 tracking-widest">Hỏi giáo viên để lấy mã phòng</p>
          
          {error && <div className="mb-6 p-4 bg-red-50 text-red-500 rounded-2xl font-bold text-xs border border-red-100">{error}</div>}
          
          <input 
            type="text" 
            placeholder="Ví dụ: RG82A1" 
            className="w-full p-6 bg-slate-50 border-4 border-slate-100 rounded-[2rem] font-black text-center text-4xl uppercase outline-none focus:border-blue-600 transition-all mb-8 tracking-widest" 
            value={roomCodeInput} 
            onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
            maxLength={8}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
          />
          
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setGameState('LOBBY')} className="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase italic">Quay lại</button>
            <button onClick={handleJoinRoom} className="py-5 bg-blue-600 text-white font-black rounded-3xl uppercase italic shadow-lg shadow-blue-500/20">VÀO PHÒNG</button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'WAITING_FOR_PLAYERS') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-5xl w-full border-b-[12px] border-blue-600 animate-in zoom-in flex flex-col items-center text-center">
          <div className="w-full flex justify-between items-center mb-10">
             <div className="text-left">
                <h2 className="text-3xl font-black text-slate-800 uppercase italic leading-none">PHÒNG CHỜ LIVE</h2>
                <p className="text-blue-600 font-black uppercase italic text-xs mt-2 tracking-widest">MÃ PHÒNG: {activeRoomCode}</p>
             </div>
             <div className="bg-slate-900 text-white px-8 py-3 rounded-full font-black italic text-xl shadow-lg">
                {presentPlayers.length} THÍ SINH
             </div>
          </div>

          <div className="w-full grid grid-cols-2 md:grid-cols-5 gap-4 mb-12 max-h-[300px] overflow-y-auto p-6 bg-slate-50 rounded-[3rem] no-scrollbar shadow-inner border border-slate-100">
             {presentPlayers.map((p, i) => (
               <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2">
                  <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-lg mb-2 shadow-sm">👤</div>
                  <div className="text-[10px] font-bold uppercase italic text-slate-600 truncate w-full">{p}</div>
               </div>
             ))}
             {presentPlayers.length === 0 && <div className="col-span-full py-10 opacity-20 italic text-slate-400 font-bold uppercase">Đang kết nối...</div>}
          </div>

          <div className="flex flex-col items-center gap-6">
             <div className="flex items-center gap-4">
               <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
               <span className="text-2xl font-bold text-slate-800 uppercase italic animate-pulse">Đợi giáo viên phát đề...</span>
             </div>
             <button onClick={() => setGameState('ENTER_CODE')} className="text-slate-400 font-bold uppercase italic text-[10px] hover:text-rose-500 transition-colors">Rời phòng</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default StudentArenaFlow;
