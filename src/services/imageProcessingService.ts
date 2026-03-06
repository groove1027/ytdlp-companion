
import { monitoredFetch } from './apiService';
import { uploadMediaToHosting } from './uploadService';

/**
 * Service for client-side image manipulation using Canvas API and AI.
 */

// Helper to load image from Base64/URL
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Prevent taint issues if external URL
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error(`Failed to load image`));
        img.src = src;
    });
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export const base64ToFile = (base64: string, filename: string): File => {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};

export const resizeImage = (
    source: File | Blob | string, 
    maxWidth: number = 1024, 
    format: 'image/jpeg' | 'image/png' = 'image/jpeg',
    quality: number = 0.9
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        const handleLoad = (src: string) => {
            const img = new Image();
            img.onload = () => {
                const elem = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
                
                elem.width = width;
                elem.height = height;
                const ctx = elem.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(elem.toDataURL(format, quality)); 
                } else {
                    reject(new Error("Canvas context unavailable"));
                }
            };
            img.onerror = (e) => reject(e);
            img.src = src;
        };

        if (typeof source === 'string') {
            handleLoad(source);
        } else {
            reader.readAsDataURL(source);
            reader.onload = (event) => handleLoad(event.target?.result as string);
            reader.onerror = (err) => reject(err);
        }
    });
};

/**
 * Canvas 기반 후처리 필터 (밝기/대비/채도/비네팅)
 */
export const applyCanvasFilters = async (
    imageUrl: string,
    filters: { brightness?: number; contrast?: number; saturate?: number; vignette?: number }
): Promise<string> => {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    canvas.width = img.width;
    canvas.height = img.height;

    // CSS filter 적용 (brightness, contrast, saturate)
    const b = filters.brightness ?? 1;
    const c = filters.contrast ?? 1;
    const s = filters.saturate ?? 1;
    ctx.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
    ctx.drawImage(img, 0, 0);

    // Reset filter for vignette overlay
    ctx.filter = 'none';

    // Vignette: radialGradient 어둡게
    const v = filters.vignette ?? 0;
    if (v > 0) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = Math.max(cx, cy);
        const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${v})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    return canvas.toDataURL('image/png', 1.0);
};

export const compositeProductOnBackground = async (
    backgroundBase64: string,
    productBase64: string
): Promise<string> => {
    try {
        const [bgImg, prodImg] = await Promise.all([
            loadImage(backgroundBase64),
            loadImage(productBase64)
        ]);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas context unavailable");

        // 1. Setup Canvas (Match Background)
        canvas.width = bgImg.width;
        canvas.height = bgImg.height;

        // 2. Draw Background
        ctx.drawImage(bgImg, 0, 0);

        // 3. Calculate Product Metrics
        // Target: Product should occupy about 35-45% of the screen area roughly, 
        // or fit within reasonable bounds to ensure it is visible but not overwhelming.
        const targetRatio = 0.40; // 40% of the canvas
        
        const scaleW = (canvas.width * targetRatio) / prodImg.width;
        const scaleH = (canvas.height * targetRatio) / prodImg.height;
        const scale = Math.min(scaleW, scaleH); // Maintain aspect ratio

        const finalW = prodImg.width * scale;
        const finalH = prodImg.height * scale;

        // 4. Position: Center Horizontal, Slightly Offset Vertically (Gravity)
        const x = (canvas.width - finalW) / 2;
        // Position slightly below center to look like it's resting on a surface
        const y = (canvas.height - finalH) / 2 + (canvas.height * 0.05); 

        // 5. Draw Product (Composite)
        ctx.drawImage(prodImg, x, y, finalW, finalH);

        // 6. Return composite as Base64
        return canvas.toDataURL('image/png', 1.0);

    } catch (e) {
        console.error("Composite Error:", e);
        // Fallback: If composite fails, return background (better than crashing)
        return backgroundBase64;
    }
};
