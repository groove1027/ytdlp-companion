
import React, { useEffect } from 'react';

interface ImageLightboxProps {
    imageUrl: string;
    onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ imageUrl, onClose }) => {
    
    // [NEW] Close on Escape Key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `image_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div 
            className="fixed inset-0 bg-black/95 z-[99999] flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-[100000]"
                title="닫기 (ESC)"
            >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <img 
                src={imageUrl} 
                alt="Full View" 
                className="w-auto h-auto max-w-[95vw] max-h-[95vh] object-contain rounded shadow-2xl"
                onClick={(e) => e.stopPropagation()} 
            />

            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4">
                <button 
                    onClick={handleDownload}
                    className="bg-white text-black px-6 py-2 rounded-full font-bold shadow-lg hover:bg-gray-200 transition-colors"
                >
                    다운로드
                </button>
            </div>
        </div>
    );
};

export default ImageLightbox;
