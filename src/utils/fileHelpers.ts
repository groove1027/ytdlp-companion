
// Pure utility functions extracted from App.tsx

export const dataURLtoFile = (dataurl: string, filename: string): File | null => {
    try {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, {type:mime});
    } catch(e) {
        console.error("DataURL Conversion Error", e);
        return null;
    }
};

export const getSafeFilename = (index: number, text: string, ext: string): string => {
    const safeText = text
        .replace(/[^\w가-힣ぁ-ヶ一-龥\s\-_]/g, '')
        .trim().substring(0, 15).replace(/\s+/g, '_');
    const num = String(index + 1).padStart(2, '0');
    return `${num}_${safeText || 'Scene'}.${ext}`;
};

export const downloadHtmlFile = (content: string, filename: string): void => {
    const blob = new Blob([content], { type: 'text/html' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
};

export const optimizeForExport = (
    imageUrl: string,
    format: 'image/jpeg' | 'image/png',
    constraint?: { type: 'width' | 'height', size: number }
): Promise<string> => {
    return new Promise((resolve) => {
        if (!imageUrl) {
            resolve(imageUrl);
            return;
        }

        // Support both Base64 data URLs and remote URLs
        const isDataUrl = imageUrl.startsWith('data:image/');
        const isRemoteUrl = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');

        if (!isDataUrl && !isRemoteUrl) {
            resolve(imageUrl);
            return;
        }

        const img = new Image();
        if (isRemoteUrl) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            // Calculate resizing based on constraint
            if (constraint) {
                if (constraint.type === 'width' && width > constraint.size) {
                    const scale = constraint.size / width;
                    width = constraint.size;
                    height = height * scale;
                } else if (constraint.type === 'height' && height > constraint.size) {
                    const scale = constraint.size / height;
                    height = constraint.size;
                    width = width * scale;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (ctx) {
                if (format === 'image/jpeg') {
                    // Fill white background for JPG to handle transparency
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }
                // Draw image with smoothing
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                // Return data URL (0.7 quality for JPG, default for PNG)
                resolve(canvas.toDataURL(format, format === 'image/jpeg' ? 0.7 : undefined));
            } else {
                resolve(imageUrl);
            }
        };
        img.onerror = () => resolve(imageUrl); // Fallback to original if load fails
        img.src = imageUrl;
    });
};

export const compressImageUnderSize = (
    url: string,
    maxBytes: number,
    filename: string
): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            let scale = 1;

            const attempt = (): void => {
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(width * scale);
                canvas.height = Math.round(height * scale);
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context unavailable'));
                    return;
                }
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const qualities = [0.92, 0.85, 0.75, 0.65, 0.5, 0.35, 0.2, 0.1];
                const tryQuality = (idx: number): void => {
                    if (idx >= qualities.length) {
                        if (scale > 0.25) {
                            scale *= 0.5;
                            attempt();
                        } else {
                            canvas.toBlob(
                                (b) => resolve(b || new Blob()),
                                'image/jpeg',
                                0.1
                            );
                        }
                        return;
                    }
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) { tryQuality(idx + 1); return; }
                            if (blob.size <= maxBytes) {
                                resolve(blob);
                            } else {
                                tryQuality(idx + 1);
                            }
                        },
                        'image/jpeg',
                        qualities[idx]
                    );
                };
                tryQuality(0);
            };
            attempt();
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${filename}`));
        img.src = url;
    });
};

/**
 * [FIX #183] Blob 이미지를 목표 비율로 중앙 크롭
 * 비율이 이미 일치하면(2% 이내) 원본 Blob 그대로 반환
 */
export const cropBlobToAspectRatio = (
    blob: Blob,
    targetRatio: string,
    quality = 0.85
): Promise<Blob> => {
    const parts = targetRatio.split(':').map(Number);
    if (parts.length !== 2 || !parts[0] || !parts[1]) return Promise.resolve(blob);
    const targetAR = parts[0] / parts[1];

    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const currentAR = w / h;

            if (Math.abs(currentAR - targetAR) / targetAR < 0.02) {
                resolve(blob);
                return;
            }

            let sx = 0, sy = 0, sw = w, sh = h;
            if (currentAR > targetAR) {
                sw = Math.round(h * targetAR);
                sx = Math.round((w - sw) / 2);
            } else {
                sh = Math.round(w / targetAR);
                sy = Math.round((h - sh) / 2);
            }

            const canvas = document.createElement('canvas');
            canvas.width = sw; canvas.height = sh;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(blob); return; }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            canvas.toBlob(b => resolve(b || blob), 'image/jpeg', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
        img.src = url;
    });
};

export const processSequentially = async <T>(
    items: T[],
    batchSize: number,
    delayMs: number,
    onProcess: (item: T) => Promise<void>,
    onProgress: (count: number) => void
): Promise<void> => {
    let processed = 0;
    for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize);
        await Promise.all(chunk.map(onProcess));
        processed += chunk.length;
        onProgress(processed);
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
};
