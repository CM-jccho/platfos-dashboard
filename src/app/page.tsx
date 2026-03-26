"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar as CalendarIcon, 
  Upload, 
  ChevronLeft, 
  ChevronRight, 
  FileCode, 
  X,
  Plus,
  ArrowRight,
  Database,
  Calendar as CalendarIcon2,
  Info,
  HelpCircle,
  Download,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  parseISO
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute bottom-full mb-2 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-lg whitespace-nowrap z-[100] pointer-events-none shadow-xl border border-white/10"
          >
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function Dashboard() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [files, setFiles] = useState<{ date: string; filename: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [viewHtml, setViewHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    setIsMounted(true);
    fetchFiles();
  }, []);

  useEffect(() => {
    const file = files.find(f => f.date === format(selectedDate, 'yyyy-MM-dd'));
    if (file) {
      loadHtml(file.filename);
    } else {
      setViewHtml(null);
    }
  }, [selectedDate, files]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadHtml = async (filename: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/files/${filename}`);
      const content = await res.text();
      setViewHtml(content);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Smart Date Extraction from Filename
    const dashMatch = file.name.match(/(?:^|_)(\d{4}-\d{2}-\d{2})(?=\.|$|_)/);
    const yyyymmddMatch = file.name.match(/(?:^|_)(\d{4})(\d{2})(\d{2})(?=\.|$|_)/);
    const yymmddMatch = file.name.match(/(?:^|_)(\d{2})(\d{2})(\d{2})(?=\.|$|_)/);

    // Validation: Check structure (requires a date pattern) and extension (.html)
    const isHtml = file.name.toLowerCase().endsWith('.html');
    if (!isHtml || (!dashMatch && !yyyymmddMatch && !yymmddMatch)) {
      setToast({ message: "해당 파일은 관리자만 업로드 가능합니다.", type: "error" });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setIsUploading(true);
      try {
        let uploadDate = format(selectedDate, 'yyyy-MM-dd');

        if (dashMatch) {
          uploadDate = dashMatch[1];
        } else if (yyyymmddMatch) {
          uploadDate = `${yyyymmddMatch[1]}-${yyyymmddMatch[2]}-${yyyymmddMatch[3]}`;
        } else if (yymmddMatch) {
          uploadDate = `20${yymmddMatch[1]}-${yymmddMatch[2]}-${yymmddMatch[3]}`;
        }

        await fetch('/api/upload', {
          method: 'POST',
          body: JSON.stringify({
            htmlContent: content,
            date: uploadDate
          }),
        });

        await fetchFiles();
        
        const newDate = parseISO(uploadDate);
        setSelectedDate(newDate);
        setCurrentDate(newDate);
      } catch (err) {
        console.error(err);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between px-8 py-5 bg-white/70 backdrop-blur-xl border-b border-gray-100/50 sticky top-0 z-30">
        <div className="flex items-center space-x-5">
          <div className="p-2.5 bg-violet-600 rounded-2xl text-white shadow-xl shadow-violet-500/30">
            <Database size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Platfos Dashboard</h1>
            <div className="flex items-center space-x-2 text-violet-600">
              <CalendarIcon2 size={12} strokeWidth={2.5} />
              <p className="text-xs font-bold tracking-wider uppercase">{format(selectedDate, "yyyy . MM . dd")}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center w-11 h-11 bg-violet-600 text-white rounded-2xl hover:bg-violet-700 transition-all shadow-xl shadow-violet-200 active:scale-95 group focus:ring-4 focus:ring-violet-100 outline-none"
            title="Upload HTML"
          >
            <Plus size={22} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, "d");
        const cloneDay = day;
        const hasFile = files.some(f => f.date === format(cloneDay, "yyyy-MM-dd"));
        
        days.push(
          <div
            key={day.toString()}
            className={cn(
              "relative h-11 flex items-center justify-center cursor-pointer transition-all rounded-xl",
              !isSameMonth(day, monthStart) ? "text-gray-300" : "text-gray-600 font-medium",
              isSameDay(day, selectedDate) 
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/40 scale-105 z-10" 
                : "hover:bg-violet-50 hover:text-violet-600 active:scale-95"
            )}
            onClick={() => setSelectedDate(cloneDay)}
          >
            <span className="text-sm z-10">{formattedDate}</span>
            {hasFile && !isSameDay(day, selectedDate) && (
              <Tooltip text="Reports Available">
                <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
              </Tooltip>
            )}
            {hasFile && isSameDay(day, selectedDate) && (
              <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-white rounded-full" />
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-1.5 px-6 mb-1.5" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    return (
      <div className="w-85 bg-white border-r border-gray-100/80 flex flex-col h-full overflow-y-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-2xl font-black text-gray-900 leading-none mb-1">{format(currentDate, "MMMM")}</h2>
              <p className="text-sm font-bold text-gray-400 tracking-widest">{format(currentDate, "yyyy")}</p>
            </div>
            <div className="flex space-x-1">
              <button 
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-2 hover:bg-violet-50 hover:text-violet-600 rounded-xl text-gray-400 transition-all active:scale-90"
              >
                <ChevronLeft size={22} />
              </button>
              <button 
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-2 hover:bg-violet-50 hover:text-violet-600 rounded-xl text-gray-400 transition-all active:scale-90"
              >
                <ChevronRight size={22} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 px-6 mb-6 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i} className="text-[10px] font-black text-gray-300 uppercase tracking-widest leading-none">{d}</span>
            ))}
          </div>
          {rows}
        </div>

        <div className="mt-auto p-8 border-t border-gray-50/80 space-y-5 bg-gradient-to-b from-transparent to-gray-50/30">
          <div className="bg-violet-50/50 rounded-2xl p-5 border border-violet-100/20 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black text-violet-400 uppercase tracking-[0.2em]">Dashboard Metrics</h3>
              <Tooltip text="Cumulative uploaded data stats">
                <Info size={12} className="text-violet-300" />
              </Tooltip>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-500">Total Activity</span>
              <span className="text-lg font-black text-violet-600">{files.length}</span>
            </div>
          </div>
          
        </div>
        
        {renderShortcuts()}
      </div>
    );
  };

  const renderShortcuts = () => {
    const categories = [
      {
        title: "1. Run",
        links: [
          { name: "[Run][S7]", url: "https://platfos.atlassian.net/wiki/x/BIBnNw" },
          { name: "[Run][S1]", url: "https://platfos.atlassian.net/wiki/x/AYB8Nw" },
          { name: "[Run][S3]", url: "https://platfos.atlassian.net/wiki/x/AYB9Nw" },
          { name: "[Run][S4]", url: "https://platfos.atlassian.net/wiki/x/EIB8Nw" },
        ]
      },
      {
        title: "2. Core",
        links: [
          { name: "[Core][S1]", url: "https://platfos.atlassian.net/wiki/x/AQB_Nw" },
          { name: "[Core][S2]", url: "https://platfos.atlassian.net/wiki/x/EAB_Nw" },
          { name: "[Core][S3]", url: "https://platfos.atlassian.net/wiki/x/HwB_Nw" },
          { name: "[Core][S4]", url: "https://platfos.atlassian.net/wiki/x/LgB_Nw" },
          { name: "[Core][S5]", url: "https://platfos.atlassian.net/wiki/x/H4B8Nw" },
          { name: "[Core][S6]", url: "https://platfos.atlassian.net/wiki/x/PQB_Nw" },
        ]
      },
      {
        title: "3. Grow",
        links: [
          { name: "[Grow][S1]", url: "https://platfos.atlassian.net/wiki/x/EIB9Nw" },
          { name: "[Grow][S2]", url: "https://platfos.atlassian.net/wiki/x/AYB_Nw" },
          { name: "[Grow][S7]", url: "https://platfos.atlassian.net/wiki/x/H4B9Nw" },
        ]
      },
      {
        title: "4. Expand",
        links: [
          { name: "[Expand][S8]", url: "https://platfos.atlassian.net/wiki/x/EIB_Nw" },
        ]
      }
    ];

    return (
      <div className="px-8 mb-8">
        <div className="flex items-center space-x-2 mb-5">
          <BookOpen size={14} className="text-violet-500" />
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Confluence Index</h3>
        </div>
        <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {categories.map((cat, idx) => (
            <div key={idx} className="space-y-3">
              <h4 className="text-[11px] font-black text-gray-900 flex items-center">
                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full mr-2" />
                {cat.title}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {cat.links.map((link, lIdx) => (
                  <a 
                    key={lIdx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 bg-gray-50/50 hover:bg-violet-50 rounded-xl group transition-all border border-transparent hover:border-violet-100"
                  >
                    <span className="text-[10px] font-bold text-gray-500 group-hover:text-violet-600 transition-colors uppercase truncate">{link.name}</span>
                    <ExternalLink size={10} className="text-gray-300 group-hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!isMounted) return <div className="h-screen bg-gray-50" />;

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 selection:text-blue-600 overflow-hidden">
      {/* Sidebar - Calendar */}
      {renderCalendar()}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {renderHeader()}

        <main className="flex-1 overflow-hidden relative p-10 bg-gray-50/50">
          <AnimatePresence mode="wait">
            {viewHtml ? (
              <motion.div
                key={selectedDate.toString()}
                initial={{ opacity: 0, scale: 0.99, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.99, y: -15 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="w-full h-full rounded-[2.5rem] overflow-hidden bg-white shadow-[0_20px_50px_rgba(139,92,246,0.08)] border border-violet-100/50 relative group"
              >
                {isLoading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-20 flex items-center justify-center">
                    <div className="flex flex-col items-center space-y-6">
                      <div className="relative">
                        <div className="w-16 h-16 border-4 border-violet-100 rounded-full" />
                        <div className="absolute top-0 w-16 h-16 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                      <p className="text-sm font-black text-gray-900 tracking-tight">Syncing data...</p>
                    </div>
                  </div>
                )}
                <iframe 
                  srcDoc={viewHtml} 
                  className="w-full h-full border-none"
                  title="Dashboard Preview"
                />
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full h-full flex flex-col items-center justify-center"
              >
                <div className="relative">
                  <div className="absolute -inset-10 bg-violet-500/10 rounded-full blur-[100px] animate-pulse" />
                  <div className="relative p-12 bg-white rounded-[3rem] border border-violet-50 shadow-[0_30px_60px_rgba(0,0,0,0.05)] flex flex-col items-center max-w-sm text-center">
                    <div className="p-6 bg-violet-50 rounded-[2rem] mb-8 text-violet-600">
                      <FileCode size={56} strokeWidth={1.2} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Archive Empty</h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-10 font-medium">
                      No dashboard has been archived for {format(selectedDate, "MMMM d")}. Enhance your workspace by uploading a report.
                    </p>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="group w-full py-4 bg-violet-600 text-white rounded-[1.5rem] font-bold hover:bg-violet-700 transition-all shadow-2xl shadow-violet-200 active:scale-[0.97] flex items-center justify-center space-x-2"
                    >
                      <span>Get Started</span>
                      <Plus size={18} strokeWidth={3} className="group-hover:rotate-90 transition-transform" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Global Loading Overlay */}
      {isUploading && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="p-10 bg-white rounded-[3rem] shadow-2xl flex flex-col items-center space-y-8 max-w-sm w-full text-center"
          >
            <div className="relative">
              <div className="w-20 h-20 border-4 border-violet-50 rounded-full" />
              <motion.div 
                className="absolute top-0 w-20 h-20 border-4 border-violet-600 border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-violet-600">
                <Upload size={32} />
              </div>
            </div>
            <div>
              <h4 className="text-xl font-black text-gray-900 mb-2">Securing report</h4>
              <p className="text-sm text-gray-400 font-medium leading-relaxed">Please wait while we process and index your HTML document into the archives.</p>
            </div>
          </motion.div>
        </div>
      )}
      {/* Toast Notification */}
      <AnimatePresence>
        {isMounted && toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={cn(
              "fixed top-0 left-1/2 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center space-x-3 border",
              toast.type === 'error' ? "bg-red-50 text-red-600 border-red-100" : "bg-violet-50 text-violet-600 border-violet-100"
            )}
          >
            {toast.type === 'error' ? <Info size={20} /> : <Database size={20} />}
            <span className="font-bold tracking-tight">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
