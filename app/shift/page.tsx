'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  MoreHorizontal
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Icons ---
const DotIcon = () => (
  <span className="opacity-20 select-none">・</span>
);

// --- Types ---
interface Shift {
  id: string; 
  name: string;
  date: string; 
  time: string;
}

interface LogEntry {
  id: string;
  message: string;
  timestamp: Date;
}

// --- Utils ---
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getMondayOfDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 6 : day - 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().split('T')[0];
};

const getDatesInRange = (startDate: string, daysLength: number) => {
  const dates = [];
  const start = new Date(startDate);
  for (let i = 0; i < daysLength; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
};

const formatDateDay = (dateStr: string) => {
  const date = new Date(dateStr);
  return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
};

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
};

// --- Page Component ---
export default function ShiftPage() {
  const [textInput, setTextInput] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeMonday, setActiveMonday] = useState(getMondayOfDate(getTodayStr()));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());

  const daysLength = 7;
  const previewDates = getDatesInRange(activeMonday, daysLength);

  const handleParse = async () => {
    if (!textInput.trim()) return;

    setIsAnalyzing(true);
    await new Promise(r => setTimeout(r, 800));

    const lines = textInput.split('\n').map(l => l.trim()).filter(l => l !== '');
    const newLogs: LogEntry[] = [];
    const updatedShifts = [...shifts];
    const newHighlighted = new Set<string>();

    let currentStaffName: string | null = null;
    let firstDetectedDate: string | null = null;

    lines.forEach(line => {
      // 1. Staff Header Detection
      const timeNameMatch = line.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
      if (timeNameMatch) {
        const rawName = timeNameMatch[2].trim();
        const parts = rawName.split(/\s+/);
        currentStaffName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        currentStaffName = currentStaffName.replace(/[よろしく更新変りました]/g, '').trim();
        return;
      }

      if (!line.match(/^\d+日/) && !line.match(/\d\/\d/) && line.length > 1 && line.length < 20 && !line.includes('よろしく')) {
        const parts = line.split(/\s+/);
        const nameCandidate = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        if (!nameCandidate.match(/^\d{4}/)) {
          currentStaffName = nameCandidate;
          return;
        }
      }

      // 2. Date Header (M/D)
      const dateHeaderMatch = line.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (dateHeaderMatch) {
        const targetDate = `${new Date().getFullYear()}-${dateHeaderMatch[1].padStart(2, '0')}-${dateHeaderMatch[2].padStart(2, '0')}`;
        if (!firstDetectedDate || targetDate < firstDetectedDate) firstDetectedDate = targetDate;
        // Logic for inline if name was previously detected might go here, 
        // but user's sample shows staff -> dates sequence.
        return;
      }

      // 3. Date with Day Pattern (N日(月))
      const dateDayMatch = line.match(/^(\d{1,2})日\s*[\(（][月火水木金土日][\)）]/);
      const timeRangeMatch = line.match(/(\d{1,2}(?:\.\d)?(?::\d{2})?)\s*-\s*(\d{1,2}(?:\.\d)?(?::\d{2})?)/);

      if (dateDayMatch && currentStaffName) {
        const dayNum = dateDayMatch[1].padStart(2, '0');
        const now = new Date();
        let month = now.getMonth() + 1;
        let year = now.getFullYear();
        if (Number(dayNum) < now.getDate() - 5) {
          month += 1;
          if (month > 12) { month = 1; year += 1; }
        }
        const targetDate = `${year}-${String(month).padStart(2, '0')}-${dayNum}`;
        if (!firstDetectedDate || targetDate < firstDetectedDate) firstDetectedDate = targetDate;

        if (timeRangeMatch) {
          const normalizeTime = (t: string) => {
            if (t.includes('.')) {
              const [h, f] = t.split('.');
              return `${h.padStart(2, '0')}:${f === '5' ? '30' : '00'}`;
            }
            if (!t.includes(':')) return `${t.padStart(2, '0')}:00`;
            return t.padStart(5, '0');
          };
          
          const timeValue = `${normalizeTime(timeRangeMatch[1])}-${normalizeTime(timeRangeMatch[2])}`;
          const shiftId = `${currentStaffName}-${targetDate}`;
          const existingIndex = updatedShifts.findIndex(s => s.id === shiftId);

          if (existingIndex > -1) {
            if (updatedShifts[existingIndex].time !== timeValue) {
              updatedShifts[existingIndex].time = timeValue;
              newLogs.push({ id: Math.random().toString(), message: `Updated ${currentStaffName}'s shift`, timestamp: new Date() });
              newHighlighted.add(shiftId);
            }
          } else {
            updatedShifts.push({ id: shiftId, name: currentStaffName, date: targetDate, time: timeValue });
            newLogs.push({ id: Math.random().toString(), message: `Added ${currentStaffName}'s shift`, timestamp: new Date() });
            newHighlighted.add(shiftId);
          }
        }
      }
    });

    if (firstDetectedDate) {
      setActiveMonday(getMondayOfDate(firstDetectedDate));
    }
    setShifts(updatedShifts);
    setLogs(prev => [...prev, ...newLogs].slice(-5));
    setHighlightedCells(newHighlighted);
    setTextInput('');
    setIsAnalyzing(false);
    setTimeout(() => setHighlightedCells(new Set()), 4000);
  };

  const handleExport = () => {
    const names = Array.from(new Set(shifts.map(s => s.name))).sort();
    const allDates = Array.from(new Set(shifts.map(s => s.date))).sort();
    const data = names.map(name => {
      const row: any = { 'STAFF': name };
      allDates.forEach(date => {
        const s = shifts.find(sh => sh.name === name && sh.date === date);
        row[date] = s ? s.time : '';
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shifts");
    XLSX.writeFile(wb, `shifts_${getTodayStr()}.xlsx`);
  };

  const staffNames = Array.from(new Set(shifts.map(s => s.name))).sort();

  return (
    <div className="min-h-screen bg-[#F9F9F9] text-[#111111] font-sans selection:bg-black/5 p-8 md:p-16 lg:p-24 transition-all overflow-x-hidden">
      <div className="max-w-screen-2xl mx-auto space-y-24">
        
        {/* Header - Massive Whitespace */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-12">
          <div className="space-y-6">
            <h1 className="text-7xl md:text-8xl font-black tracking-tighter leading-none m-0 p-0 text-[#111111]">
              SHIFT<br/>ASSISTANT.
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] font-medium text-gray-400">
              Precision Intelligence / Master Schedule Engine
            </p>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={handleExport}
              disabled={shifts.length === 0}
              className="px-10 py-5 bg-[#111111] text-[#FFFFFF] text-sm font-bold rounded-none active:scale-95 hover:translate-y-[-2px] hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] transition-all duration-300 disabled:opacity-20 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              EXCEL EXPORT
            </button>
          </div>
        </header>

        {/* Main Interface */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-24">
          
          {/* Input Section */}
          <section className="xl:col-span-4 space-y-12">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.2em] font-black text-gray-400">Intelligence Input</label>
              <div className="relative group overflow-hidden rounded-none shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="absolute inset-0 bg-white/50 backdrop-blur-xl border border-black/[0.03]" />
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="PASTE DIALOGUE..."
                  className="relative w-full h-[400px] bg-transparent p-10 outline-none resize-none font-sans text-lg focus:shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] transition-all"
                />
                
                <div className="relative border-t border-black/[0.05] p-10 bg-white/30">
                  <button 
                    onClick={handleParse}
                    disabled={!textInput.trim() || isAnalyzing}
                    className="w-full py-6 bg-[#111111] text-[#FFFFFF] text-xs font-black tracking-[0.2em] uppercase active:scale-95 transition-all disabled:opacity-30"
                  >
                    {isAnalyzing ? "Processing..." : "SYNC SHIFTS"}
                  </button>
                </div>
              </div>
            </div>

            {/* Quiet Logs */}
            <div className="space-y-4 pt-10 border-t border-black/[0.05]">
              <label className="text-[9px] uppercase tracking-[0.3em] font-black text-gray-300">Activity Log</label>
              <div className="space-y-2 min-h-[40px]">
                <AnimatePresence mode="popLayout">
                  {logs.map((log) => (
                    <motion.p
                      key={log.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[10px] text-gray-400 font-mono flex justify-between items-center"
                    >
                      <span>{formatTimeAgo(log.timestamp)}: {log.message.toLowerCase()}</span>
                      <MoreHorizontal className="w-3 h-3 opacity-20" />
                    </motion.p>
                  ))}
                  {logs.length === 0 && (
                    <p className="text-[10px] text-gray-300 font-mono italic">Waiting for input Activity...</p>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>

          {/* Master Grid Section */}
          <section className="xl:col-span-8 space-y-12">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-[0.2em] font-black text-gray-400">Preview Dashboard</label>
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => {
                    const d = new Date(activeMonday);
                    d.setDate(d.getDate() - 7);
                    setActiveMonday(d.toISOString().split('T')[0]);
                  }}
                  className="p-2 hover:bg-black/5 rounded-none transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-black tracking-widest tabular-nums uppercase">
                  {activeMonday.replace(/-/g, '.')} — {previewDates[6].replace(/-/g, '.')}
                </span>
                <button 
                  onClick={() => {
                    const d = new Date(activeMonday);
                    d.setDate(d.getDate() + 7);
                    setActiveMonday(d.toISOString().split('T')[0]);
                  }}
                  className="p-2 hover:bg-black/5 rounded-none transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="relative border border-black/[0.05] bg-white overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-black/[0.1]">
                      <th className="p-8 text-left text-[10px] font-black tracking-widest text-gray-400 sticky left-0 bg-white z-20 border-r border-black/[0.05]">STAFF</th>
                      {previewDates.map(date => (
                        <th key={date} className="p-6 min-w-[140px] text-center bg-white border-r border-black/[0.05] last:border-none">
                          <div className="text-[9px] font-black text-gray-300 uppercase tracking-tighter mb-1">{date.split('-')[1]}.{date.split('-')[2]}</div>
                          <div className="text-sm font-black tracking-tight">{formatDateDay(date)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staffNames.length === 0 ? (
                      <tr>
                        <td colSpan={daysLength + 1} className="py-48 text-center">
                          <p className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-200">No shifts synchronized</p>
                        </td>
                      </tr>
                    ) : (
                      staffNames.map(name => (
                        <tr key={name} className="border-b border-black/[0.05] last:border-none group">
                          <td className="p-8 text-sm font-black sticky left-0 bg-white z-10 border-r border-black/[0.05] group-hover:bg-[#FDFDFD] transition-colors">
                            {name}
                          </td>
                          {previewDates.map(date => {
                            const shift = shifts.find(s => s.name === name && s.date === date);
                            const shiftId = `${name}-${date}`;
                            const isHighlighted = highlightedCells.has(shiftId);
                            return (
                              <td 
                                key={date} 
                                className={cn(
                                  "p-0 h-16 text-center font-mono text-xs tabular-nums transition-all duration-700",
                                  isHighlighted ? "bg-[#111111] text-[#FFFFFF]" : "group-hover:bg-[#F9F9F9]"
                                )}
                              >
                                {shift ? shift.time : <DotIcon />}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table Footer / Legend */}
            <div className="flex justify-between items-center text-[9px] font-black tracking-[0.2em] text-gray-300 uppercase">
              <div className="flex gap-12">
                <span className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black" /> Newly Sync'd</span>
                <span className="flex items-center gap-3"><div className="w-1.5 h-1.5 border border-black/[0.1]" /> Static Reference</span>
              </div>
              <p>Mon - Sun Operational Sequence</p>
            </div>
          </section>
        </div>

        {/* Dynamic Footer */}
        <footer className="pt-24 flex flex-col md:flex-row items-center justify-between gap-8 text-[9px] font-black tracking-[0.5em] text-gray-200 uppercase border-t border-black/[0.05]">
          <div className="flex items-center gap-4">
            <span className="text-black">© 2026</span>
            <span>SHIROKI OKIMIYAGE</span>
          </div>
          <div className="flex gap-12">
            <span>Precision Engineering</span>
            <span>Zero Latency Parsing</span>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@100;300;400;500;700;900&display=swap');
        
        body {
          font-family: 'Geist', sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        ::-webkit-scrollbar {
          width: 0px;
          height: 0px;
        }
        
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
