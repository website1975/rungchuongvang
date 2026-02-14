
export interface Question {
  id: number;
  content: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export enum GameStatus {
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  EXPLAINING = 'EXPLAINING',
  FINISHED = 'FINISHED'
}

export interface Student {
  id: string;
  name: string;
  status: 'online' | 'buzzed' | 'correct' | 'wrong' | 'answering';
  score: number;
  lastBuzzedTime?: number;
  selectedOption?: number;
}

export interface GameState {
  questions: Question[];
  currentQuestionIndex: number;
  status: GameStatus;
  timer: number;
  isTimerRunning: boolean;
  buzzedStudentId: string | null;
}

export type MessageType = 
  | { type: 'SYNC_STATE', state: GameState, students?: Student[] }
  | { type: 'STUDENT_JOIN', student: Student }
  | { type: 'STUDENT_BUZZ', studentId: string, timestamp: number }
  | { type: 'STUDENT_ANSWER', studentId: string, optionIndex: number }
  | { type: 'TEACHER_ACTION', action: 'correct' | 'wrong' | 'reset', studentId: string }
  | { type: 'REQUEST_SYNC' };
