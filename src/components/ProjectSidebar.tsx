
import React, { useEffect, useState, useRef } from 'react';
import { ProjectData, ProjectSummary, StorageEstimate } from '../types';
import { deleteProject, deleteAllProjects, getAllProjectSummaries, getProject, getStorageEstimate } from '../services/storageService';
import ApiKeySettings from './ApiKeySettings';

interface ProjectSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (project: ProjectData) => void;
  onNewProject: () => void;
  onImportProject?: (file: File) => void;
  currentProjectId?: string;
  refreshTrigger: number;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  isOpen,
  onClose,
  onSelectProject,
  onNewProject,
  onImportProject,
  currentProjectId,
  refreshTrigger
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageEstimate>({ usedMB: 0, totalMB: 0, percent: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 사이드바가 열릴 때만 프로젝트 목록 + 저장소 정보 로드
  useEffect(() => {
    if (isOpen) {
      loadProjects();
      loadStorageInfo();
    }
  }, [refreshTrigger, isOpen]);

  const loadProjects = async () => {
    const list = await getAllProjectSummaries();
    setProjects(list);
  };

  const loadStorageInfo = async () => {
    const estimate = await getStorageEstimate();
    setStorageInfo(estimate);
  };

  const handleOpenProject = async (summary: ProjectSummary) => {
    setLoadingProjectId(summary.id);
    try {
      const fullProject = await getProject(summary.id);
      if (fullProject) {
        onSelectProject(fullProject);
        onClose();
      }
    } finally {
      setLoadingProjectId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("정말 이 프로젝트를 삭제하시겠습니까? 복구할 수 없습니다.")) {
      await deleteProject(id);
      loadProjects();
      loadStorageInfo();
    }
  };

  const handleClearAll = async () => {
    if (confirm("저장된 모든 프로젝트가 영구적으로 삭제됩니다.\n\n정말 전체 삭제하시겠습니까?")) {
      await deleteAllProjects();
      loadProjects();
      loadStorageInfo();
      onNewProject();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportProject) {
      onImportProject(file);
      onClose();
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateNew = () => {
    onNewProject();
    onClose();
  };

  // 저장소 게이지 색상
  const getGaugeColor = () => {
    if (storageInfo.percent >= 80) return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]';
    if (storageInfo.percent >= 50) return 'bg-orange-500';
    return 'bg-gradient-to-r from-green-400 to-emerald-500';
  };

  const getStatusColor = () => {
    if (storageInfo.percent >= 80) return 'text-red-400';
    if (storageInfo.percent >= 50) return 'text-orange-400';
    return 'text-emerald-400';
  };

  return (
    <>
      {/* Settings Modal */}
      <ApiKeySettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <div className={`fixed top-0 right-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="p-6 h-full flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                📂 내 프로젝트
                <span className="text-sm bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-600">Local</span>
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <button
            onClick={handleCreateNew}
            className="w-full font-bold py-3 px-4 rounded-lg mb-3 flex items-center justify-center gap-2 shadow-lg transition-all transform hover:scale-[1.02] bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
            새 프로젝트 생성
          </button>

          {onImportProject && (
              <>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 font-bold py-2 px-4 rounded-lg mb-3 flex items-center justify-center gap-2 transition-all text-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    HTML 프로젝트 불러오기
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".html,.zip"
                    className="hidden"
                />
              </>
          )}

          {/* API Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 font-bold py-2 px-4 rounded-lg mb-3 flex items-center justify-center gap-2 transition-all text-sm"
          >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              API 설정
          </button>

          {/* Project List */}
          <div className="flex-grow overflow-y-auto space-y-3 border-t border-gray-700 pt-4 custom-scrollbar">
             {projects.length === 0 ? (
                 <div className="text-center text-gray-500 py-10 text-base">
                     저장된 프로젝트가 없습니다.
                 </div>
             ) : (
                 projects.map((p) => (
                     <div
                        key={p.id}
                        onClick={() => handleOpenProject(p)}
                        className={`p-4 rounded-lg border cursor-pointer transition-all group relative ${
                            loadingProjectId === p.id
                            ? 'bg-blue-900/20 border-blue-500/50 animate-pulse'
                            : currentProjectId === p.id
                            ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500'
                            : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-750'
                        }`}
                     >
                        <h3 className="font-bold text-gray-200 truncate pr-6 text-base">{p.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-gray-500">
                              {new Date(p.lastModified).toLocaleDateString()} {new Date(p.lastModified).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                          <span className="text-xs text-gray-600">
                            {p.sceneCount}컷{p.estimatedSizeMB ? ` | ${p.estimatedSizeMB}MB` : ''}
                          </span>
                        </div>

                        <button
                            onClick={(e) => handleDelete(e, p.id)}
                            className="absolute top-3 right-3 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-black/20 rounded-full"
                            title="삭제"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                     </div>
                 ))
             )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-700 flex flex-col gap-3">

             {/* Storage Gauge Bar */}
             <div className="space-y-1">
                 <div className="flex justify-between text-sm text-gray-400 font-bold">
                     <span>저장소: {storageInfo.usedMB}MB / {storageInfo.totalMB}MB ({storageInfo.percent}%)</span>
                     <span className={getStatusColor()}>
                         {storageInfo.percent >= 80 ? '부족' : storageInfo.percent >= 50 ? '보통' : '여유'}
                     </span>
                 </div>
                 <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-600">
                     <div
                        className={`h-full transition-all duration-500 ${getGaugeColor()}`}
                        style={{ width: `${Math.min(storageInfo.percent, 100)}%` }}
                     ></div>
                 </div>
                 {storageInfo.percent >= 80 && (
                   <p className="text-sm text-red-400 font-bold animate-pulse">
                     저장소가 부족합니다
                   </p>
                 )}
             </div>

             {/* Delete All Button */}
             {projects.length > 0 && (
                 <button
                     onClick={handleClearAll}
                     className="w-full py-2.5 bg-red-900/30 hover:bg-red-900/60 text-red-400 border border-red-900/50 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                 >
                     전체 삭제
                 </button>
             )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectSidebar;
