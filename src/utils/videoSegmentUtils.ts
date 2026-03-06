
export interface VideoSegment {
    index: number;
    startSec: number;
    endSec: number;
    trimmedUrl: string;
}

const SEGMENT_DURATION = 8;
const MIN_LAST_SEGMENT = 2;

/** HTMLVideoElement로 영상 길이(초) 감지. 실패 시 0 반환. */
export const getVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            const duration = video.duration;
            URL.revokeObjectURL(video.src);
            resolve(isFinite(duration) ? duration : 0);
        };
        video.onerror = () => resolve(0);
        video.src = url;
        setTimeout(() => resolve(0), 10000);
    });
};

/** Cloudinary URL에 so_X,eo_Y 트랜스포메이션 삽입 */
export const buildCloudinaryTrimUrl = (baseUrl: string, startSec: number, endSec: number): string => {
    const uploadIndex = baseUrl.indexOf('/upload/');
    if (uploadIndex === -1) return baseUrl;
    const before = baseUrl.substring(0, uploadIndex + '/upload/'.length);
    const after = baseUrl.substring(uploadIndex + '/upload/'.length);
    return `${before}so_${startSec},eo_${endSec}/${after}`;
};

/** 영상을 ~8초 단위 구간으로 분할. 마지막 구간이 2초 미만이면 이전 구간에 병합. */
export const splitVideoIntoSegments = (baseUrl: string, durationSec: number): VideoSegment[] => {
    if (durationSec <= 0 || durationSec <= SEGMENT_DURATION) {
        return [{ index: 0, startSec: 0, endSec: durationSec || SEGMENT_DURATION, trimmedUrl: baseUrl }];
    }

    const segments: VideoSegment[] = [];
    let start = 0;

    while (start < durationSec) {
        let end = Math.min(start + SEGMENT_DURATION, durationSec);
        const remaining = durationSec - end;

        // 마지막 구간이 2초 미만이면 현재 구간에 병합
        if (remaining > 0 && remaining < MIN_LAST_SEGMENT) {
            end = durationSec;
        }

        segments.push({
            index: segments.length,
            startSec: start,
            endSec: end,
            trimmedUrl: buildCloudinaryTrimUrl(baseUrl, start, end),
        });

        start = end;
    }

    return segments;
};
