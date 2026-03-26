"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar as CalendarIcon, 
  Upload, 
  ChevronLeft, 
  ChevronRight, 
  FileCode, 
  Plus,
  Database,
  Calendar as CalendarIcon2,
  Info,
  ExternalLink,
  BookOpen,
  Menu,
  X
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
  const [viewFile, setViewFile] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      setViewFile(null);
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

  const loadHtml = (filename: string) => {
    setViewFile(`/data/${filename}`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const dashMatch = file.name.match(/(?:^|_)(\d{4}-\d{2}-\d{2})(?=\.|$|_)/);
    const yyyymmddMatch = file.name.match(/(?:^|_)(\d{4})(\d{2})(\d{2})(?=\.|$|_)/);
    const yymmddMatch = file.name.match(/(?:^|_)(\d{2})(\d{2})(\d{2})(?=\.|$|_)/);

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
        if (dashMatch) uploadDate = dashMatch[1];
        else if (yyyymmddMatch) uploadDate = `${yyyymmddMatch[1]}-${yyyymmddMatch[2]}-${yyyymmddMatch[3]}`;
        else if (yymmddMatch) uploadDate = `20${yymmddMatch[1]}-${yymmddMatch[2]}-${yymmddMatch[3]}`;

        await fetch('/api/upload', {
          method: 'POST',
          body: JSON.stringify({ htmlContent: content, date: uploadDate }),
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

  const CalendarPanel = ({ onDateSelect }: { onDateSelect?: () => void }) => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const hasFile = files.some(f => f.date === format(cloneDay, "yyyy-MM-dd"));
        days.push(
          <div
            key={day.toString()}
            className={cn(
              "relative h-10 sm:h-11 flex items-center justify-center cursor-pointer transition-all rounded-xl",
              !isSameMonth(day, monthStart) ? "text-gray-300" : "text-gray-600 font-medium",
              isSameDay(day, selectedDate)
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/40 scale-105 z-10"
                : "hover:bg-violet-50 hover:text-violet-600 active:scale-95"
            )}
            onClick={() => {
              setSelectedDate(cloneDay);
              onDateSelect?.();
            }}
          >
            <span className="text-sm z-10">{format(day, "d")}</span>
            {hasFile && !isSameDay(day, selectedDate) && (
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
            )}
            {hasFile && isSameDay(day, selectedDate) && (
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-white rounded-full" />
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 px-4 sm:px-6 mb-1 sm:mb-1.5" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

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
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-8 sm:mb-10">
            <div>
              <h2 className="text-2xl font-black text-gray-900 leading-none mb-1">{format(currentDate, "MMMM")}</h2>
              <p className="text-sm font-bold text-gray-400 tracking-widest">{format(currentDate, "yyyy")}</p>
            </div>
            <div className="flex space-x-1">
              <button onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-2 hover:bg-violet-50 hover:text-violet-600 rounded-xl text-gray-400 transition-all active:scale-90">
                <ChevronLeft size={22} />
              </button>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-2 hover:bg-violet-50 hover:text-violet-600 rounded-xl text-gray-400 transition-all active:scale-90">
                <ChevronRight size={22} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 px-4 sm:px-6 mb-4 sm:mb-6 text-center">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <span key={i} className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{d}</span>
            ))}
          </div>
          {rows}
        </div>

        <div className="mt-auto p-6 sm:p-8 border-t border-gray-50/80 space-y-5 bg-gradient-to-b from-transparent to-gray-50/30">
          <div className="bg-violet-50/50 rounded-2xl p-4 sm:p-5 border border-violet-100/20">
            <div className="flex items-center justify-between mb-3">
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

        <div className="px-6 sm:px-8 mb-8">
          <div className="flex items-center space-x-2 mb-5">
            <BookOpen size={14} className="text-violet-500" />
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Confluence Index</h3>
          </div>
          <div className="space-y-6 max-h-[300px] overflow-y-auto pr-2">
            {categories.map((cat, idx) => (
              <div key={idx} className="space-y-3">
                <h4 className="text-[11px] font-black text-gray-900 flex items-center">
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full mr-2" />
                  {cat.title}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {cat.links.map((link, lIdx) => (
                    <a key={lIdx} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 bg-gray-50/50 hover:bg-violet-50 rounded-xl group transition-all border border-transparent hover:border-violet-100">
                      <span className="text-[10px] font-bold text-gray-500 group-hover:text-violet-600 uppercase truncate">{link.name}</span>
                      <ExternalLink size={10} className="text-gray-300 group-hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-all" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (!isMounted) return <div className="h-screen bg-gray-50" />;

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 bg-white/70 backdrop-blur-xl border-b border-gray-100/50 z-30">
        <div className="flex items-center space-x-3 sm:space-x-5">
          {/* 모바일: 메뉴 버튼 */}
          <button
            className="sm:hidden p-2 rounded-xl hover:bg-violet-50 text-gray-500 active:scale-95 transition-all"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={22} />
          </button>
          <div className="p-2 sm:p-2.5 bg-violet-600 rounded-xl sm:rounded-2xl text-white shadow-xl shadow-violet-500/30">
            <Database size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-extrabold text-gray-900 tracking-tight">Platfos Dashboard</h1>
            <div className="flex items-center space-x-1.5 text-violet-600">
              <CalendarIcon2 size={11} strokeWidth={2.5} />
              <p className="text-[10px] sm:text-xs font-bold tracking-wider uppercase">{format(selectedDate, "yyyy . MM . dd")}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 bg-violet-600 text-white rounded-xl sm:rounded-2xl hover:bg-violet-700 transition-all shadow-xl shadow-violet-200 active:scale-95 group"
        >
          <Plus size={20} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 데스크톱 사이드바 */}
        <div className="hidden sm:flex w-80 lg:w-85 bg-white border-r border-gray-100/80 flex-col h-full overflow-y-auto">
          <CalendarPanel />
        </div>

        {/* 모바일 드로어 오버레이 */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 sm:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed left-0 top-0 h-full w-80 bg-white z-50 sm:hidden shadow-2xl overflow-y-auto"
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <span className="font-black text-gray-900">캘린더</span>
                  <button onClick={() => setSidebarOpen(false)}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 active:scale-95">
                    <X size={20} />
                  </button>
                </div>
                <CalendarPanel onDateSelect={() => setSidebarOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* 메인 컨텐츠 */}
        <main className="flex-1 overflow-hidden relative p-4 sm:p-10 bg-gray-50/50">
          <AnimatePresence mode="wait">
            {viewFile ? (
              <motion.div
                key={selectedDate.toString()}
                initial={{ opacity: 0, scale: 0.99, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.99, y: -15 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="w-full h-full rounded-2xl sm:rounded-[2.5rem] overflow-hidden bg-white shadow-[0_20px_50px_rgba(139,92,246,0.08)] border border-violet-100/50"
              >
                <iframe
                  src={viewFile}
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
                <div className="relative w-full max-w-sm mx-auto">
                  <div className="absolute -inset-10 bg-violet-500/10 rounded-full blur-[100px] animate-pulse" />
                  <div className="relative p-8 sm:p-12 bg-white rounded-[2rem] sm:rounded-[3rem] border border-violet-50 shadow-[0_30px_60px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
                    <div className="p-5 sm:p-6 bg-violet-50 rounded-[1.5rem] sm:rounded-[2rem] mb-6 sm:mb-8 text-violet-600">
                      <FileCode size={44} strokeWidth={1.2} />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-2 tracking-tight">Archive Empty</h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-8 font-medium">
                      No dashboard has been archived for {format(selectedDate, "MMMM d")}.
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="group w-full py-3.5 sm:py-4 bg-violet-600 text-white rounded-[1.2rem] sm:rounded-[1.5rem] font-bold hover:bg-violet-700 transition-all shadow-2xl shadow-violet-200 active:scale-[0.97] flex items-center justify-center space-x-2"
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

      {/* 업로드 오버레이 */}
      {isUploading && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="p-8 sm:p-10 bg-white rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl flex flex-col items-center space-y-6 sm:space-y-8 max-w-sm w-full text-center"
          >
            <div className="relative">
              <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-violet-50 rounded-full" />
              <motion.div
                className="absolute top-0 w-16 h-16 sm:w-20 sm:h-20 border-4 border-violet-600 border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-violet-600">
                <Upload size={28} />
              </div>
            </div>
            <div>
              <h4 className="text-lg sm:text-xl font-black text-gray-900 mb-2">Securing report</h4>
              <p className="text-sm text-gray-400 font-medium leading-relaxed">Please wait while we process and index your HTML document.</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* 토스트 */}
      <AnimatePresence>
        {isMounted && toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={cn(
              "fixed top-0 left-1/2 z-[100] px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 border",
              toast.type === 'error' ? "bg-red-50 text-red-600 border-red-100" : "bg-violet-50 text-violet-600 border-violet-100"
            )}
          >
            {toast.type === 'error' ? <Info size={18} /> : <Database size={18} />}
            <span className="font-bold text-sm tracking-tight">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
