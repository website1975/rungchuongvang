
import React, { useState } from 'react';

interface BuzzerPanelProps {
  onBuzzerPressed: (name: string) => void;
  disabled: boolean;
}

const BuzzerPanel: React.FC<BuzzerPanelProps> = ({ onBuzzerPressed, disabled }) => {
  const [studentName, setStudentName] = useState('');

  const handlePress = () => {
    if (studentName.trim()) {
      onBuzzerPressed(studentName);
      setStudentName('');
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-xl border-4 border-yellow-400">
      <h3 className="text-xl font-bold mb-4 text-red-800 flex items-center">
        <i className="fas fa-hand-pointer mr-2"></i> Khu Vực Thí Sinh
      </h3>
      <div className="flex gap-2">
        <input 
          type="text" 
          placeholder="Nhập tên của em..." 
          className="flex-1 border-2 border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          disabled={disabled}
        />
        <button 
          onClick={handlePress}
          disabled={disabled || !studentName.trim()}
          className={`px-6 py-2 rounded-lg font-bold text-white transition-all ${
            disabled || !studentName.trim() 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-red-600 hover:bg-red-700 active:scale-95 shadow-lg'
          }`}
        >
          GIÀNH QUYỀN!
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500 italic">
        * Giả lập học sinh nhấn chuông giành quyền trả lời.
      </p>
    </div>
  );
};

export default BuzzerPanel;
