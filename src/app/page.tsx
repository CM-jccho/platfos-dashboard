"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, ChevronLeft, ChevronRight, FileCode, Plus,
  Database, Calendar as CalendarIcon2, Info,
  ExternalLink, BookOpen, Menu, X
} from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, parseISO
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CONFLUENCE_LINKS = [
  { title: "1. Run", links: [
    { name: "[Run][S7]", url: "https://platfos.atlassian.net/wiki/x/BIBnNw" },
    { name: "[Run][S1]", url: "https://platfos.atlassian.net/wiki/x/AYB8Nw" },
    { name: "[Run][S3]", url: "https://platfos.atlassian.net/wiki/x/AYB9Nw" },
    { name: "[Run][S4]", url: "https://platfos.atlassian.net/wiki/x/EIB8Nw" },
  ]},
  { title: "2. Core", links: [
    { name: "[Core][S1]", url: "https://platfos.atlassian.net/wiki/x/AQB_Nw" },
    { name: "[Core][S2]", url: "https://platfos.atlassian.net/wiki/x/EAB_Nw" },
    { name: "[Core][S3]", url: "https://platfos.atlassian.net/wiki/x/HwB_Nw" },
    { name: "[Core][S4]", url: "https://platfos.atlassian.net/wiki/x/LgB_Nw" },
    { name: "[Core][S5]", url: "https://platfos.atlassian.net/wiki/x/H4B8Nw" },
    { name: "[Core][S6]", url: "https://platfos.atlassian.net/wiki/x/PQB_Nw" },
  ]},
  { title: "3. Grow", links: [
    { name: "[Grow][S1]", url: "https://platfos.atlassian.net/wiki/x/EIB9Nw" },
    { name: "[Grow][S2]", url: "https://platfos.atlassian.net/wiki/x/AYB_Nw" },
    { name: "[Grow][S7]", url: "https://platfos.atlassian.net/wiki/x/H4B9Nw" },
  ]},
  { title: "4. Expand", links: [
    { name: "[Expand][S8]", url: "https://platfos.atlassian.net/wiki/x/EIB_Nw" },
  ]},
];

// ── 모듈 레벨 컴포넌트 (key 충돌 없음) ──
interface CalendarPanelProps {
  currentDate: Date;
  selectedDate: Date;
  files: { date: string; filename: string }[];
  fileCount: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: Date) => void;
}

function CalendarPanel({
  currentDate, selectedDate, files, fileCount,
  onPrevMonth, onNextMonth, onSelectDate
}: CalendarPanelProps) {
  const monthStart = startOfMonth(currentDate);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(endOfMonth(monthStart));

  const weeks: React.ReactNode[] = [];
  let day = startDate;

  while (day <= endDate) {
    const weekDays: React.ReactNode[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(day);
      const dateStr = format(d, "yyyy-MM-dd");
      const hasFile = files.some(f => f.date === dateStr);
      const isSelected = isSameDay(d, selectedDate);
      const inMonth = isSameMonth(d, monthStart);

      weekDays.push(
        <div
          key={dateStr}
          onClick={() => onSelectDate(d)}
          className={cn(
            "relative h-10 flex items-center justify-center cursor-pointer rounded-xl transition-all select-none",
            !inMonth && "text-gray-300",
            inMonth && !isSelected && "text-gray-600 font-medium hover:bg-violet-50 hover:text-violet-600 active:scale-95",
            isSelected && "bg-violet-600 text-white shadow-lg shadow-violet-500/30 scale-105 z-10"
          )}
        >
          <span className="text-sm">{format(d, "d")}</span>
          {hasFile && (
            <span className={cn(
              "absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full",
              isSelected ? "bg-white" : "bg-violet-400 animate-pulse"
            )} />
          )}
        </div>
      );
      day = addDays(day, 1);
    }
    weeks.push(
      <div key={day.toISOString()} className="grid grid-cols-7 gap-1 px-4 mb-1">
        {weekDays}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 월 네비게이션 */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black text-gray-900 leading-none mb-1">
              {format(currentDate, "MMMM")}
            </h2>
            <p className="text-sm font-bold text-gray-400 tracking-widest">
              {format(currentDate, "yyyy")}
            </p>
          </div>
          <div className="flex gap-1">
            <button onClick={onPrevMonth}
              className="p-2 hover:bg-violet-50 hover:text-violet-600 rounded-xl text-gray-400 transition-all">
              <ChevronLeft size={20} />
            </button>
            <button onClick={onNextMonth}
              className="p-2 hover:bg-violet-50 hover:text-violet-600 rounded-xl text-gray-400 transition-all">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-1 px-4 mb-3 text-center">
          {["S","M","T","W","T","F","S"].map((d, i) => (
            <span key={i} className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
              {d}
            </span>
          ))}
        </div>

        {/* 날짜 그리드 */}
        {weeks}
      </div>

      {/* 메트릭 */}
      <div className="mt-auto p-6 border-t border-gray-100">
        <div className="bg-violet-50/50 rounded-2xl p-4 border border-violet-100/30 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-black text-violet-400 uppercase tracking-[0.15em]">
              Total Activity
            </h3>
            <Info size={11} className="text-violet-300" />
          </div>
          <span className="text-2xl font-black text-violet-600">{fileCount}</span>
        </div>

        {/* Confluence */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={13} className="text-violet-500" />
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
              Confluence Index
            </h3>
          </div>
          <div className="space-y-4 max-h-64 overflow-y-auto">
            {CONFLUENCE_LINKS.map((cat, idx) => (
              <div key={idx}>
                <h4 className="text-[11px] font-black text-gray-800 flex items-center mb-2">
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full mr-2 shrink-0" />
                  {cat.title}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {cat.links.map((link, li) => (
                    <a key={li} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between p-2 bg-gray-50 hover:bg-violet-50 rounded-xl border border-transparent hover:border-violet-100 transition-all group">
                      <span className="text-[10px] font-bold text-gray-500 group-hover:text-violet-600 uppercase truncate">
                        {link.name}
                      </span>
                      <ExternalLink size={9} className="text-gray-300 group-hover:text-violet-400 shrink-0 ml-1" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 메인 대시보드 ──
export default function Dashboard() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [files, setFiles] = useState<{ date: string; filename: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [viewFile, setViewFile] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setIsMounted(true); fetchFiles(); }, []);

  useEffect(() => {
    const file = files.find(f => f.date === format(selectedDate, "yyyy-MM-dd"));
    setViewFile(file ? `/api/files/${file.filename}` : null);
  }, [selectedDate, files]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      if (Array.isArray(data)) setFiles(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const dashMatch = file.name.match(/(?:^|_)(\d{4}-\d{2}-\d{2})(?=\.|$|_)/);
    const yyyyMatch = file.name.match(/(?:^|_)(\d{4})(\d{2})(\d{2})(?=\.|$|_)/);
    const yyMatch   = file.name.match(/(?:^|_)(\d{2})(\d{2})(\d{2})(?=\.|$|_)/);

    if (!file.name.toLowerCase().endsWith(".html") || (!dashMatch && !yyyyMatch && !yyMatch)) {
      setToast({ message: "해당 파일은 관리자만 업로드 가능합니다.", type: "error" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const htmlContent = ev.target?.result as string;
      setIsUploading(true);
      try {
        let uploadDate = format(selectedDate, "yyyy-MM-dd");
        if (dashMatch) uploadDate = dashMatch[1];
        else if (yyyyMatch) uploadDate = `${yyyyMatch[1]}-${yyyyMatch[2]}-${yyyyMatch[3]}`;
        else if (yyMatch)   uploadDate = `20${yyMatch[1]}-${yyMatch[2]}-${yyMatch[3]}`;

        await fetch("/api/upload", {
          method: "POST",
          body: JSON.stringify({ htmlContent, date: uploadDate }),
        });
        await fetchFiles();
        const newDate = parseISO(uploadDate);
        setSelectedDate(newDate);
        setCurrentDate(newDate);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const calendarProps: CalendarPanelProps = {
    currentDate,
    selectedDate,
    files,
    fileCount: files.length,
    onPrevMonth: () => setCurrentDate(subMonths(currentDate, 1)),
    onNextMonth: () => setCurrentDate(addMonths(currentDate, 1)),
    onSelectDate: (d) => { setSelectedDate(d); setDrawerOpen(false); },
  };

  if (!isMounted) return <div className="h-screen bg-gray-50" />;

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* 헤더 */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-3.5 sm:py-5 bg-white border-b border-gray-100 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button className="sm:hidden p-2 rounded-xl hover:bg-violet-50 text-gray-500 active:scale-95"
            onClick={() => setDrawerOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="p-2 bg-violet-600 rounded-xl text-white shadow-md shadow-violet-300">
            <Database size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-extrabold text-gray-900 leading-tight">
              Platfos Dashboard
            </h1>
            <div className="flex items-center gap-1.5 text-violet-600">
              <CalendarIcon2 size={10} />
              <p className="text-[10px] font-bold tracking-widest uppercase">
                {format(selectedDate, "yyyy . MM . dd")}
              </p>
            </div>
          </div>
        </div>
        <button onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 flex items-center justify-center bg-violet-600 text-white rounded-xl hover:bg-violet-700 active:scale-95 shadow-md shadow-violet-200 transition-all">
          <Plus size={20} strokeWidth={2.5} />
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      </header>

      {/* 바디 */}
      <div className="flex flex-1 overflow-hidden">

        {/* 데스크톱 사이드바 */}
        <aside className="hidden sm:block w-72 lg:w-80 bg-white border-r border-gray-100 shrink-0 overflow-y-auto">
          <CalendarPanel {...calendarProps} />
        </aside>

        {/* 모바일 드로어 */}
        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.div key="overlay"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-40 sm:hidden"
                onClick={() => setDrawerOpen(false)}
              />
              <motion.aside key="drawer"
                initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 280 }}
                className="fixed left-0 top-0 h-full w-[78vw] max-w-[300px] bg-white z-50 sm:hidden shadow-2xl overflow-y-auto"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <span className="font-black text-gray-900 text-sm">캘린더</span>
                  <button onClick={() => setDrawerOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500">
                    <X size={18} />
                  </button>
                </div>
                <CalendarPanel {...calendarProps} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* 메인 콘텐츠 */}
        <main className="flex-1 overflow-hidden p-3 sm:p-8">
          <AnimatePresence mode="wait">
            {viewFile ? (
              <motion.div key="iframe-wrap"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full h-full rounded-2xl overflow-auto bg-white shadow-md border border-gray-100"
              >
                <iframe
                  src={viewFile}
                  title="Dashboard Preview"
                  className="w-full border-none"
                  style={{ height: "100%", minHeight: "600px" }}
                />
              </motion.div>
            ) : (
              <motion.div key="empty"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="w-full h-full flex items-center justify-center"
              >
                <div className="p-8 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center max-w-xs w-full mx-4">
                  <div className="p-5 bg-violet-50 rounded-2xl mb-5 text-violet-500">
                    <FileCode size={36} strokeWidth={1.2} />
                  </div>
                  <h3 className="text-lg font-black text-gray-900 mb-2">저장된 리포트 없음</h3>
                  <p className="text-gray-400 text-sm mb-6">
                    {format(selectedDate, "M월 d일")}에 저장된 대시보드가 없습니다.
                  </p>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 active:scale-[0.97] flex items-center justify-center gap-2 transition-all">
                    <span>업로드</span>
                    <Plus size={16} strokeWidth={3} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* 업로드 오버레이 */}
      <AnimatePresence>
        {isUploading && (
          <motion.div key="upload-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
          >
            <div className="p-8 bg-white rounded-2xl shadow-2xl flex flex-col items-center gap-5 max-w-xs w-full text-center">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 border-4 border-violet-100 rounded-full" />
                <motion.div className="absolute inset-0 border-4 border-violet-600 border-t-transparent rounded-full"
                  animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
                <div className="absolute inset-0 flex items-center justify-center text-violet-600">
                  <Upload size={22} />
                </div>
              </div>
              <div>
                <p className="font-black text-gray-900">업로드 중...</p>
                <p className="text-sm text-gray-400 mt-1">잠시만 기다려주세요.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 토스트 */}
      <AnimatePresence>
        {isMounted && toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, x: "-50%" }}
            animate={{ opacity: 1, y: 16, x: "-50%" }}
            exit={{ opacity: 0, y: -16, x: "-50%" }}
            className={cn(
              "fixed top-0 left-1/2 z-[200] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 border text-sm font-bold whitespace-nowrap",
              toast.type === "error"
                ? "bg-red-50 text-red-600 border-red-100"
                : "bg-violet-50 text-violet-600 border-violet-100"
            )}
          >
            <Info size={15} />
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
