
import React from 'react';

interface TimerProps {
  seconds: number;
  total: number;
}

const Timer: React.FC<TimerProps> = ({ seconds, total }) => {
  const percentage = (seconds / total) * 100;
  const colorClass = seconds < 5 ? 'bg-red-500' : seconds < 10 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute w-full h-full transform -rotate-90">
        <circle
          cx="48"
          cy="48"
          r="40"
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          className="text-gray-200"
        />
        <circle
          cx="48"
          cy="48"
          r="40"
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={251.2}
          strokeDashoffset={251.2 - (251.2 * percentage) / 100}
          className={`${colorClass} transition-all duration-1000 ease-linear`}
        />
      </svg>
      <span className="text-3xl font-bungee text-gray-800">{seconds}</span>
    </div>
  );
};

export default Timer;
