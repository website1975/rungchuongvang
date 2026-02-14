
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, GameStatus, GameState, Student, MessageType } from './types';
import { generateQuestions, getDeepExplanation } from './services/geminiService';
import Timer from './components/Timer';

const INITIAL_TIMER = 15;
const CHANNEL_NAME = 'rung_chuong_vang_pro';

const SAMPLE_QUESTIONS: Question[] = [
  {
    id: 1,
    content: "Vị tướng nào là người chỉ huy trực tiếp chiến dịch Điện Biên Phủ năm 1954, 'lừng lẫy năm châu, chấn động địa cầu'?",
    options: ["Đại tướng Văn Tiến Dũng", "Đại tướng Võ Nguyên Giáp", "Đại tướng Nguyễn Chí Thanh", "Đại tướng Chu Huy Mân"],
    correctAnswer: 1,
    difficulty: 'Medium',
    explanation: "Đại tướng Võ Nguyên Giáp (1911-2013) là Tổng tư lệnh Quân đội Nhân dân Việt Nam, người đã trực tiếp chỉ huy và đưa chiến dịch Điện Biên Phủ đến thắng lợi hoàn toàn vào ngày 7/5/1954. Đây là thắng lợi quyết định kết thúc cuộc kháng chiến chống Pháp."
  },
  {
    id: 2,
    content: "Con sông nào sau đây được mệnh danh là 'con sông dài nhất thế giới'?",
    options: ["Sông Amazon", "Sông Nile (Ni-lơ)", "Sông Mê Kông", "Sông Trường Giang"],
    correctAnswer: 1,
    difficulty: 'Easy',
    explanation: "Sông Nile nằm ở Châu Phi, với chiều dài khoảng 6.650 km, chảy qua 11 quốc gia. Tuy có những tranh luận với sông Amazon về độ dài, nhưng sông Nile vẫn thường được công nhận là con sông dài nhất thế giới trong hầu hết các tài liệu địa lý."
  }
];

const App: React.FC = () => {
  const [role, setRole] = useState<'SELECT' | 'TEACHER' | 'STUDENT'>('SELECT');
  const [studentName, setStudentName] = useState('');
  const [myId] = useState(() => 'stu_' + Math.random().toString(36).substr(2, 5));
  const [isAiMode, setIsAiMode] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  const [gameState, setGameState] = useState<GameState>({
    questions: [],
    currentQuestionIndex: -1,
    status: GameStatus.LOBBY,
    timer: INITIAL_TIMER,
    isTimerRunning: false,
    buzzedStudentId: null
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [topic, setTopic] = useState('Kiến thức tổng quát');
  const [loading, setLoading] = useState(false);
  const [explanationText, setExplanationText] = useState<string | null>(null);
  
  const bc = useRef<BroadcastChannel | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const gameStateRef = useRef(gameState);
  const studentsRef = useRef(students);
  const roleRef = useRef(role);
  const myIdRef = useRef(myId);
  const studentNameRef = useRef(studentName);

  useEffect(() => {
    gameStateRef.current = gameState;
    studentsRef.current = students;
    roleRef.current = role;
    myIdRef.current = myId;
    studentNameRef.current = studentName;
  }, [gameState, students, role, myId, studentName]);

  const sendJoinMessage = useCallback(() => {
    bc.current?.postMessage({
      type: 'STUDENT_JOIN',
      student: { id: myIdRef.current, name: studentNameRef.current, status: 'online', score: 0 }
    });
  }, []);

  useEffect(() => {
    bc.current = new BroadcastChannel(CHANNEL_NAME);
    
    bc.current.onmessage = (event: MessageEvent<MessageType>) => {
      const msg = event.data;
      const currentRole = roleRef.current;

      switch (msg.type) {
        case 'REQUEST_SYNC':
          if (currentRole === 'TEACHER') {
            bc.current?.postMessage({ type: 'SYNC_STATE', state: gameStateRef.current, students: studentsRef.current });
          } else if (currentRole === 'STUDENT') {
            sendJoinMessage();
          }
          break;

        case 'SYNC_STATE':
          if (currentRole === 'STUDENT') {
            setGameState(msg.state);
            if (msg.students) {
              setStudents(msg.students);
              const amIInList = msg.students.some(s => s.id === myIdRef.current);
              if (!amIInList) sendJoinMessage();
            }
          }
          break;

        case 'STUDENT_JOIN':
          if (currentRole === 'TEACHER') {
            setStudents(prev => {
              if (prev.find(s => s.id === msg.student.id)) return prev;
              const newStudents = [...prev, msg.student];
              bc.current?.postMessage({ type: 'SYNC_STATE', state: gameStateRef.current, students: newStudents });
              return newStudents;
            });
          }
          break;

        case 'STUDENT_BUZZ':
          if (currentRole === 'TEACHER' && gameStateRef.current.isTimerRunning && !gameStateRef.current.buzzedStudentId) {
            handleStudentBuzz(msg.studentId, msg.timestamp);
          }
          break;

        case 'STUDENT_ANSWER':
          if (currentRole === 'TEACHER') {
            handleStudentAnswer(msg.studentId, msg.optionIndex);
          }
          break;
      }
    };

    if (role !== 'SELECT') {
      bc.current.postMessage({ type: 'REQUEST_SYNC' });
    }

    return () => bc.current?.close();
  }, [role, sendJoinMessage]);

  const handleStudentBuzz = (id: string, time: number) => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    const newState = { ...gameStateRef.current, buzzedStudentId: id, isTimerRunning: false };
    const newStudents = studentsRef.current.map(s => s.id === id ? { ...s, status: 'answering' as const, lastBuzzedTime: time } : s);
    setGameState(newState);
    setStudents(newStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: newStudents });
  };

  const handleStudentAnswer = (id: string, optionIndex: number) => {
    const currentQ = gameStateRef.current.questions[gameStateRef.current.currentQuestionIndex];
    const isCorrect = currentQ.correctAnswer === optionIndex;
    
    const newStudents = studentsRef.current.map(s => {
      if (s.id === id) {
        return { 
          ...s, 
          status: (isCorrect ? 'correct' : 'wrong') as any,
          score: isCorrect ? s.score + 10 : s.score,
          selectedOption: optionIndex
        };
      }
      return s;
    });
    setStudents(newStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: gameStateRef.current, students: newStudents });
  };

  const judgeStudent = (id: string, isCorrect: boolean) => {
    const newStudents = students.map(s => {
      if (s.id === id) {
        return { 
          ...s, 
          status: (isCorrect ? 'correct' : 'wrong') as any,
          score: isCorrect ? s.score + 10 : s.score
        };
      }
      return s;
    });
    setStudents(newStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: gameState, students: newStudents });
  };

  const startTimer = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    const startState = { ...gameState, isTimerRunning: true, buzzedStudentId: null };
    const resetStudents = students.map(s => ({ ...s, status: 'online' as const, selectedOption: undefined }));
    setGameState(startState);
    setStudents(resetStudents);
    setSelectedOption(null);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: startState, students: resetStudents });
    
    timerInterval.current = setInterval(() => {
      setGameState(prev => {
        const nextTimer = prev.timer - 1;
        if (nextTimer <= 0) {
          if (timerInterval.current) clearInterval(timerInterval.current);
          const timeoutState = { ...prev, timer: 0, isTimerRunning: false };
          bc.current?.postMessage({ type: 'SYNC_STATE', state: timeoutState, students: studentsRef.current });
          return timeoutState;
        }
        const activeState = { ...prev, timer: nextTimer };
        bc.current?.postMessage({ type: 'SYNC_STATE', state: activeState, students: studentsRef.current });
        return activeState;
      });
    }, 1000);
  };

  const handleStartGame = async () => {
    setLoading(true);
    try {
      const qs = await generateQuestions(topic);
      if (qs.length > 0) {
        setIsAiMode(true);
        startGameWithQuestions(qs);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartWithSample = () => {
    setIsAiMode(false);
    startGameWithQuestions(SAMPLE_QUESTIONS);
  };

  const startGameWithQuestions = (qs: Question[]) => {
    const newState: GameState = {
      questions: qs,
      currentQuestionIndex: 0,
      status: GameStatus.PLAYING,
      timer: INITIAL_TIMER,
      isTimerRunning: false,
      buzzedStudentId: null
    };
    setGameState(newState);
    setExplanationText(null);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: students });
  };

  const handleExplain = async () => {
    const q = gameState.questions[gameState.currentQuestionIndex];
    if (q.explanation && q.explanation.trim() !== "") {
      setExplanationText(q.explanation);
    } else {
      setLoading(true);
      const text = await getDeepExplanation(q);
      setExplanationText(text);
      setLoading(false);
    }
    const newState = { ...gameState, status: GameStatus.EXPLAINING };
    setGameState(newState);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: students });
  };

  const nextQuestion = () => {
    const nextIndex = gameState.currentQuestionIndex + 1;
    let newState: GameState;
    if (nextIndex >= gameState.questions.length) {
      newState = { ...gameState, status: GameStatus.FINISHED };
    } else {
      newState = {
        ...gameState,
        currentQuestionIndex: nextIndex,
        timer: INITIAL_TIMER,
        isTimerRunning: false,
        buzzedStudentId: null,
        status: GameStatus.PLAYING
      };
    }
    setGameState(newState);
    setExplanationText(null);
    setSelectedOption(null);
    const resetStudents = students.map(s => ({ ...s, status: 'online' as const, selectedOption: undefined }));
    setStudents(resetStudents);
    bc.current?.postMessage({ type: 'SYNC_STATE', state: newState, students: resetStudents });
  };

  const joinGame = () => {
    if (!studentName.trim()) return;
    setRole('STUDENT');
  };

  const studentBuzz = () => {
    if (!gameState.isTimerRunning || gameState.buzzedStudentId) return;
    bc.current?.postMessage({ type: 'STUDENT_BUZZ', studentId: myId, timestamp: Date.now() });
  };

  const submitAnswer = () => {
    if (selectedOption === null) return;
    bc.current?.postMessage({ type: 'STUDENT_ANSWER', studentId: myId, optionIndex: selectedOption });
  };

  const handleExit = () => {
    if (timerInterval.current) clearInterval(timerInterval.current);
    setRole('SELECT');
    setGameState({
      questions: [],
      currentQuestionIndex: -1,
      status: GameStatus.LOBBY,
      timer: INITIAL_TIMER,
      isTimerRunning: false,
      buzzedStudentId: null
    });
    setStudents([]);
    setExplanationText(null);
    setLoading(false);
    setIsAiMode(false);
  };

  const requestSync = () => {
    bc.current?.postMessage({ type: 'REQUEST_SYNC' });
  };

  if (role === 'SELECT') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl max-w-md w-full border-t-8 border-red-600 animate-fade-in overflow-y-auto max-h-[95vh]">
          <div className="text-center mb-6">
            <i className="fas fa-bell text-5xl text-yellow-500 mb-3 bell-shake"></i>
            <h1 className="text-2xl md:text-3xl font-bungee text-red-800 tracking-tighter">RUNG CHUÔNG VÀNG</h1>
            <p className="text-xs text-gray-500 font-medium">Hệ thống thi đấu trực tuyến</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <button onClick={() => setRole('TEACHER')} className="group bg-red-600 p-4 rounded-2xl hover:bg-red-700 transition-all text-left flex items-center gap-4 shadow-md">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-xl text-white flex-shrink-0">
                <i className="fas fa-chalkboard-teacher"></i>
              </div>
              <div>
                <h3 className="text-white font-bold text-base">GIÁO VIÊN</h3>
                <p className="text-red-100 text-xs">Quản lý lớp học & soạn đề</p>
              </div>
            </button>
            <div className="bg-yellow-50 p-4 rounded-2xl border-2 border-yellow-200">
              <h3 className="text-yellow-800 font-bold mb-3 text-sm flex items-center gap-2"><i className="fas fa-user-graduate"></i> HỌC SINH THAM GIA</h3>
              <div className="flex flex-col gap-2">
                <input type="text" placeholder="Nhập họ tên..." className="w-full border-2 border-gray-300 px-3 py-2 rounded-xl focus:border-yellow-500 outline-none font-bold text-sm" value={studentName} onChange={e => setStudentName(e.target.value)} onKeyPress={e => e.key === 'Enter' && joinGame()} />
                <button onClick={joinGame} disabled={!studentName.trim()} className="w-full bg-yellow-500 text-white font-bold py-2 rounded-xl hover:bg-yellow-600 disabled:bg-gray-300 transition-all shadow-sm text-sm uppercase">VÀO THI</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (role === 'TEACHER') {
    const currentQ = gameState.questions[gameState.currentQuestionIndex];
    const buzzedStudent = students.find(s => s.id === gameState.buzzedStudentId);

    return (
      <div className="h-screen bg-gray-50 flex flex-col">
        <header className="red-gradient text-white p-3 shadow-md flex justify-between items-center z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <i className="fas fa-desktop text-xl"></i>
            <h2 className="text-base font-bungee hidden sm:block">Teacher Console</h2>
            {gameState.status !== GameStatus.LOBBY && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isAiMode ? 'bg-purple-500' : 'bg-blue-500'}`}>
                {isAiMode ? 'AI Mode' : 'Sample Mode'}
              </span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <span className="bg-white/20 px-3 py-0.5 rounded-full text-xs font-bold">{students.length} Thí sinh</span>
            <button onClick={handleExit} className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg transition-all text-xs font-bold">Thoát</button>
          </div>
        </header>
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-gray-100">
            {gameState.status === GameStatus.LOBBY && (
              <div className="max-w-xl mx-auto mt-4 animate-fade-in">
                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border-b-4 border-red-600">
                  <h3 className="text-xl font-bold mb-4 text-gray-800">Cấu hình trận đấu</h3>
                  <div className="space-y-4">
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <h4 className="font-bold text-blue-800 text-sm mb-1 flex items-center gap-2"><i className="fas fa-vial"></i> Chế độ dùng thử</h4>
                      <p className="text-[11px] text-blue-600 mb-2">Test nhanh hệ thống không cần AI.</p>
                      <button onClick={handleStartWithSample} className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg text-xs hover:bg-blue-700 transition-all">DÙNG BỘ ĐỀ MẪU</button>
                    </div>
                    <div className="relative flex items-center justify-center"><div className="w-full border-t border-gray-200 absolute"></div><span className="relative px-2 bg-white text-[10px] text-gray-400 font-bold uppercase">Hoặc</span></div>
                    <div>
                      <label className="block text-gray-600 font-bold text-xs mb-1">Chủ đề AI soạn:</label>
                      <input className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm focus:border-red-500 outline-none transition-all" value={topic} onChange={e => setTopic(e.target.value)} placeholder="VD: Lịch sử Việt Nam..." />
                    </div>
                    <button onClick={handleStartGame} disabled={loading} className="w-full red-gradient text-white font-bungee text-lg py-3 rounded-xl shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2">
                      {loading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-rocket"></i>} {loading ? "ĐANG SOẠN..." : "BẮT ĐẦU VỚI AI"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {currentQ && (
              <div className="max-w-3xl mx-auto space-y-4 animate-fade-in pb-10">
                <div className="bg-white p-6 rounded-3xl shadow-lg border-2 border-red-800 relative">
                  <div className="flex justify-between items-center mb-4">
                    <span className="bg-yellow-400 text-red-900 px-4 py-1 rounded-full font-bungee text-sm shadow-sm">CÂU {gameState.currentQuestionIndex + 1} / {gameState.questions.length}</span>
                    <div className="scale-75 origin-right"><Timer seconds={gameState.timer} total={INITIAL_TIMER} /></div>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-center mb-6 leading-relaxed text-gray-800">{currentQ.content}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                    {currentQ.options.map((opt, i) => (
                      <div key={i} className={`p-3 border-2 rounded-xl text-sm flex items-center gap-3 ${gameState.status === GameStatus.EXPLAINING && i === currentQ.correctAnswer ? 'bg-green-50 border-green-500 font-bold text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                         <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-white rounded-full font-bungee shadow-sm text-xs">{String.fromCharCode(64 + (i+1))}</span>{opt}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!gameState.isTimerRunning && gameState.status === GameStatus.PLAYING && !gameState.buzzedStudentId && (
                      <button onClick={startTimer} className="flex-1 min-w-[120px] bg-green-600 text-white font-bungee py-3 rounded-xl shadow-md hover:bg-green-700 transition-all text-sm animate-pulse border-2 border-white"><i className="fas fa-play mr-2"></i> ĐẾM GIỜ</button>
                    )}
                    {gameState.status === GameStatus.PLAYING && (
                      <button onClick={handleExplain} disabled={loading} className="flex-1 min-w-[120px] bg-purple-600 text-white font-bungee py-3 rounded-xl shadow-md hover:bg-purple-700 disabled:opacity-50 text-sm">
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-lightbulb mr-2"></i>} GIẢI THÍCH
                      </button>
                    )}
                    {gameState.status === GameStatus.EXPLAINING && (
                      <button onClick={nextQuestion} className="flex-1 min-w-[120px] bg-blue-600 text-white font-bungee py-3 rounded-xl shadow-md hover:bg-blue-700 text-sm">CÂU TIẾP <i className="fas fa-arrow-right ml-2"></i></button>
                    )}
                  </div>
                </div>
                {buzzedStudent && buzzedStudent.status === 'answering' && (
                  <div className="bg-white p-4 rounded-2xl shadow-md border-2 border-blue-500 text-center animate-pulse">
                    <p className="text-blue-600 font-bold text-sm"><i className="fas fa-keyboard"></i> {buzzedStudent.name} ĐANG CHỌN ĐÁP ÁN...</p>
                  </div>
                )}
                {explanationText && (
                  <div className="bg-purple-900 text-white p-5 rounded-2xl shadow-xl animate-fade-in border-l-4 border-yellow-400">
                    <h4 className="text-sm font-bold mb-2 flex items-center gap-2 text-yellow-400 uppercase tracking-tighter"><i className="fas fa-graduation-cap"></i> Giải đáp chi tiết:</h4>
                    <div className="text-sm leading-relaxed opacity-90 whitespace-pre-wrap font-medium">{explanationText}</div>
                  </div>
                )}
              </div>
            )}
          </main>
          <aside className="w-72 md:w-80 bg-white border-l shadow-2xl flex flex-col z-20 flex-shrink-0">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 flex items-center gap-2"><i className="fas fa-users text-red-600"></i> GIÁM SÁT</h3>
              <button onClick={requestSync} className="text-blue-600 hover:text-blue-800 text-[10px] font-bold uppercase">Làm mới DS</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {students.length === 0 ? (
                 <div className="text-center py-10 opacity-30"><i className="fas fa-user-clock text-3xl mb-2"></i><p className="text-xs font-bold italic">Đang chờ thí sinh...</p></div>
              ) : (
                students.sort((a,b) => b.score - a.score).map((s, idx) => (
                  <div key={s.id} className={`p-3 rounded-xl border transition-all duration-300 ${s.status === 'answering' || s.status === 'buzzed' ? 'border-yellow-400 bg-yellow-50 shadow-md ring-2 ring-yellow-200' : s.status === 'correct' ? 'border-green-400 bg-green-50' : s.status === 'wrong' ? 'border-red-400 bg-red-50' : 'border-gray-100 bg-white shadow-sm'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2"><span className="text-[10px] font-bold bg-gray-100 w-5 h-5 rounded-full flex items-center justify-center">#{idx + 1}</span><span className="font-bold text-gray-800 text-xs truncate max-w-[100px]">{s.name}</span></div>
                      <span className="font-bungee text-red-600 text-sm">{s.score}đ</span>
                    </div>
                    {s.status === 'correct' && <p className="text-[9px] text-green-600 font-bold">Đáp án: {String.fromCharCode(65 + (s.selectedOption ?? 0))}</p>}
                    {s.status === 'wrong' && <p className="text-[9px] text-red-600 font-bold">Đáp án: {String.fromCharCode(65 + (s.selectedOption ?? 0))}</p>}
                    {(s.status === 'buzzed' || s.status === 'answering') && (
                      <div className="flex gap-1 mt-2">
                        <button onClick={() => judgeStudent(s.id, true)} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-1.5 rounded-lg text-[10px]"><i className="fas fa-check"></i> ĐÚNG</button>
                        <button onClick={() => judgeStudent(s.id, false)} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-1.5 rounded-lg text-[10px]"><i className="fas fa-times"></i> SAI</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const myStatus = students.find(s => s.id === myId);
  const isMeBuzzed = gameState.buzzedStudentId === myId;
  const someoneElseBuzzed = gameState.buzzedStudentId && !isMeBuzzed;
  const currentQ = gameState.questions[gameState.currentQuestionIndex];
  const canBuzz = gameState.isTimerRunning && !gameState.buzzedStudentId;
  const isAnswering = myStatus?.status === 'answering';

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-y-auto">
      <header className="gold-gradient p-3 md:p-4 text-white shadow-md flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-white/30 rounded-full flex items-center justify-center text-base"><i className="fas fa-user-graduate"></i></div>
          <div><h2 className="font-bungee text-sm md:text-base truncate max-w-[120px]">{studentName}</h2><p className="text-[10px] font-bold opacity-80 uppercase">Hạng {students.sort((a,b)=>b.score-a.score).findIndex(s=>s.id===myId)+1} • {myStatus?.score || 0}đ</p></div>
        </div>
        <div className="flex gap-3 items-center">
          <div className="flex flex-col items-end"><span className="text-[9px] font-black uppercase opacity-60">PHÒNG #1</span><span className="font-bungee text-xl">{gameState.timer}s</span></div>
          <button onClick={handleExit} className="bg-black/10 hover:bg-black/20 p-2 rounded-lg transition-all"><i className="fas fa-power-off text-sm"></i></button>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-4 space-y-4 relative overflow-hidden">
        <i className="fas fa-bell absolute -bottom-10 -right-10 text-[10rem] text-black/5 rotate-12 pointer-events-none"></i>
        {gameState.status === GameStatus.LOBBY && (
          <div className="text-center space-y-4 animate-pulse">
            <i className="fas fa-satellite-dish text-6xl text-red-500"></i>
            <h3 className="text-xl font-bold text-gray-700">Đợi thầy cô...</h3>
            <p className="text-xs text-gray-500 font-medium">Sắp bắt đầu thi, chuẩn bị nhé!</p>
          </div>
        )}
        {gameState.status === GameStatus.PLAYING && currentQ && (
          <div className="w-full max-w-sm flex flex-col items-center gap-6">
            <div className="w-full bg-white p-6 rounded-3xl shadow-xl text-center border-b-4 border-yellow-500 animate-fade-in relative">
               <span className="text-red-600 font-bungee text-xs mb-1 block uppercase tracking-widest">Câu {gameState.currentQuestionIndex + 1}</span>
               <p className="text-lg font-bold text-gray-800 leading-snug">{currentQ.content}</p>
               {!gameState.isTimerRunning && !gameState.buzzedStudentId && (
                 <div className="mt-3 text-[10px] font-black text-blue-600 bg-blue-50 py-1 px-4 rounded-full inline-flex items-center gap-1 animate-bounce"><i className="fas fa-clock"></i> CHỜ GIÁO VIÊN BẤM GIỜ</div>
               )}
            </div>

            {/* Area for selection after buzzing */}
            {isMeBuzzed && isAnswering ? (
              <div className="w-full bg-white p-6 rounded-3xl shadow-2xl border-4 border-blue-500 animate-fade-in flex flex-col gap-3">
                <h4 className="text-blue-800 font-black text-center text-sm uppercase mb-2">CHỌN ĐÁP ÁN CỦA BẠN</h4>
                <div className="grid grid-cols-1 gap-2">
                  {currentQ.options.map((opt, i) => (
                    <button 
                      key={i} 
                      onClick={() => setSelectedOption(i)} 
                      className={`p-3 rounded-xl border-2 text-left text-xs font-bold transition-all flex items-center gap-3 ${selectedOption === i ? 'bg-blue-600 border-blue-700 text-white shadow-lg scale-105' : 'bg-gray-50 border-gray-200 text-gray-700'}`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black ${selectedOption === i ? 'bg-white text-blue-600' : 'bg-white shadow-sm'}`}>{String.fromCharCode(65 + i)}</span>
                      {opt}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={submitAnswer} 
                  disabled={selectedOption === null}
                  className="mt-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bungee py-3 rounded-xl shadow-lg transition-all text-sm"
                >
                  XÁC NHẬN ĐÁP ÁN
                </button>
              </div>
            ) : (
              <div className="relative">
                {canBuzz && (<div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping"></div>)}
                <button onClick={studentBuzz} disabled={!canBuzz} className={`w-48 h-48 md:w-56 md:h-56 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all active:scale-95 border-[8px] relative z-10 ${isMeBuzzed ? 'bg-green-600 border-green-300' : someoneElseBuzzed ? 'bg-gray-400 border-gray-300 grayscale opacity-50' : canBuzz ? 'bg-red-600 border-red-400 hover:scale-105' : 'bg-gray-300 border-gray-200'}`}>
                  <i className={`fas fa-bell text-5xl md:text-6xl text-white mb-2 ${canBuzz ? 'bell-shake' : ''}`}></i>
                  <span className="text-white font-bungee text-sm px-4 text-center">
                    {isMeBuzzed ? 'ĐÃ GIÀNH QUYỀN!' : someoneElseBuzzed ? 'BẠN KHÁC BẤM TRƯỚC' : canBuzz ? 'RUNG CHUÔNG!' : 'CHỜ HIỆU LỆNH'}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
        {gameState.status === GameStatus.EXPLAINING && (
          <div className="text-center space-y-4 animate-fade-in">
            <div className="bg-white p-6 rounded-full shadow-lg inline-block animate-yellow-glow"><i className="fas fa-lightbulb text-6xl text-yellow-500"></i></div>
            <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Đang giảng giải...</h3>
            {myStatus?.status === 'correct' && (<div className="bg-green-100 text-green-700 px-4 py-2 rounded-full font-bold text-xs flex items-center gap-1 mx-auto w-fit"><i className="fas fa-check-circle"></i> ĐÚNG (+10đ)</div>)}
            {myStatus?.status === 'wrong' && (<div className="bg-red-100 text-red-700 px-4 py-2 rounded-full font-bold text-xs flex items-center gap-1 mx-auto w-fit"><i className="fas fa-times-circle"></i> CHƯA CHÍNH XÁC</div>)}
          </div>
        )}
        {gameState.status === GameStatus.FINISHED && (
          <div className="text-center space-y-4 animate-fade-in bg-white p-8 rounded-[2rem] shadow-xl border-t-4 border-yellow-500">
             <i className="fas fa-medal text-6xl text-yellow-500 mb-2"></i>
             <h2 className="text-2xl font-bungee text-red-800">KẾT THÚC!</h2>
             <div className="text-lg font-bold text-gray-700">Điểm của bạn: {myStatus?.score || 0}</div>
             <button onClick={requestSync} className="text-blue-600 text-[10px] font-bold underline block mx-auto">Sync lại dữ liệu</button>
          </div>
        )}
      </main>
      <footer className="p-2 bg-gray-200 text-center text-gray-500 text-[8px] font-black uppercase tracking-[0.2em] flex-shrink-0">Rung Chuông Vàng Pro v2.2 • Live Sync</footer>
      <style>{`
        @keyframes yellow-glow {
          0%, 100% { filter: drop-shadow(0 0 5px rgba(234, 179, 8, 0.3)); }
          50% { filter: drop-shadow(0 0 15px rgba(234, 179, 8, 0.6)); }
        }
        .animate-yellow-glow { animation: yellow-glow 2s infinite; }
      `}</style>
    </div>
  );
};

export default App;
