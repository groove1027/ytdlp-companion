"""
ProPainter + PaddleOCR FastAPI Server
컴패니언 앱과 함께 실행되는 자막/워터마크 제거 백엔드

엔드포인트:
  GET  /health               — 상태 확인
  POST /api/detect-text      — PaddleOCR로 텍스트 영역 감지
  POST /api/inpaint          — ProPainter로 영상 인페인팅
  GET  /api/inpaint/status/:id — 작업 진행률
  GET  /api/inpaint/result/:id — 완성 영상 다운로드
"""

import os
import sys
import uuid
import json
import tempfile
import subprocess
import threading
import time
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import cv2
import numpy as np

# ProPainter 경로 (같은 레벨 또는 환경변수로 지정)
PROPAINTER_DIR = os.environ.get("PROPAINTER_DIR", "/tmp/ProPainter")
sys.path.insert(0, PROPAINTER_DIR)

app = FastAPI(title="ProPainter Inpaint Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 작업 상태 저장
tasks: dict[str, dict] = {}

# ── PaddleOCR 초기화 (lazy) ──
_ocr = None

def get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR
        _ocr = PaddleOCR(lang='korean')
    return _ocr


@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": "propainter-server",
        "version": "1.0.0",
        "features": {"inpaint": True},
        "propainter": True,
    }


@app.post("/api/detect-text")
async def detect_text(video: UploadFile = File(...), sampleFrames: int = Form(5)):
    """영상에서 PaddleOCR로 텍스트 영역 감지 (다중 프레임 샘플링)"""
    # 임시 파일에 영상 저장
    suffix = Path(video.filename or "video.mp4").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await video.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            return JSONResponse({"regions": [], "error": "영상 프레임을 읽을 수 없습니다"}, status_code=400)

        # 균등 간격으로 프레임 샘플링
        sample_count = min(sampleFrames, total_frames)
        indices = [int(i * total_frames / sample_count) for i in range(sample_count)]

        ocr = get_ocr()
        all_regions = []
        seen_boxes = set()

        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret:
                continue

            result = ocr.ocr(frame)
            if not result or not result[0]:
                continue

            for line in result[0]:
                if not line or len(line) < 2:
                    continue
                box = line[0]
                text_info = line[1]
                if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                    text, conf = text_info[0], text_info[1]
                else:
                    continue
                if conf < 0.5:
                    continue
                xs = [p[0] for p in box]
                ys = [p[1] for p in box]
                x, y = int(min(xs)), int(min(ys))
                w, h = int(max(xs) - x), int(max(ys) - y)

                # 중복 제거 (비슷한 위치 ±30px)
                key = (round(x / 30) * 30, round(y / 30) * 30, round(w / 30) * 30, round(h / 30) * 30)
                if key in seen_boxes:
                    continue
                seen_boxes.add(key)

                # 마스크 패딩 추가 (상하좌우 10px)
                pad = 10
                x = max(0, x - pad)
                y = max(0, y - pad)
                w = w + pad * 2
                h = h + pad * 2

                all_regions.append({
                    "x": x, "y": y, "width": w, "height": h,
                    "text": text, "confidence": round(conf, 3),
                })

        cap.release()
        return {"regions": all_regions, "sampledFrames": sample_count}
    finally:
        os.unlink(tmp_path)


@app.post("/api/inpaint")
async def inpaint(video: UploadFile = File(...), masks: str = Form(...)):
    """ProPainter로 마스크 영역 인페인팅"""
    task_id = str(uuid.uuid4())[:8]
    mask_list = json.loads(masks)

    # 임시 디렉토리에 영상 + 마스크 저장
    work_dir = Path(tempfile.mkdtemp(prefix=f"inpaint-{task_id}-"))
    suffix = Path(video.filename or "video.mp4").suffix
    video_path = work_dir / f"input{suffix}"
    with open(video_path, "wb") as f:
        f.write(await video.read())

    # 마스크 이미지 생성
    cap = cv2.VideoCapture(str(video_path))
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    # 프레임 추출
    frames_dir = work_dir / "frames"
    masks_dir = work_dir / "masks"
    frames_dir.mkdir()
    masks_dir.mkdir()

    cap = cv2.VideoCapture(str(video_path))
    i = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        cv2.imwrite(str(frames_dir / f"{i:05d}.png"), frame)

        # 마스크 이미지 (흰색=제거 영역, 검정=유지)
        mask_img = np.zeros((frame_h, frame_w), dtype=np.uint8)
        for m in mask_list:
            x, y, w, h = int(m["x"]), int(m["y"]), int(m["width"]), int(m["height"])
            mask_img[y:y+h, x:x+w] = 255
        cv2.imwrite(str(masks_dir / f"{i:05d}.png"), mask_img)
        i += 1
    cap.release()

    output_dir = work_dir / "results"
    output_dir.mkdir()

    tasks[task_id] = {
        "status": "processing",
        "progress": 0,
        "message": "ProPainter 처리 시작...",
        "work_dir": str(work_dir),
        "output_path": "",
    }

    # 백그라운드에서 ProPainter 실행
    def run_propainter():
        try:
            tasks[task_id]["message"] = "ProPainter 인페인팅 실행 중..."
            tasks[task_id]["progress"] = 10

            cmd = [
                sys.executable,
                os.path.join(PROPAINTER_DIR, "inference_propainter.py"),
                "--video", str(frames_dir),
                "--mask", str(masks_dir),
                "--output", str(output_dir),
                "--fp16",
            ]

            # M1/M2/M4 Mac은 MPS 사용 불가 시 CPU 폴백
            env = os.environ.copy()

            process = subprocess.Popen(
                cmd, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, cwd=PROPAINTER_DIR
            )

            for line in process.stdout:
                line = line.strip()
                if "%" in line:
                    try:
                        pct = int(line.split("%")[0].split()[-1])
                        tasks[task_id]["progress"] = min(pct, 95)
                    except (ValueError, IndexError):
                        pass
                tasks[task_id]["message"] = line[:100]

            process.wait()

            if process.returncode != 0:
                tasks[task_id]["status"] = "failed"
                tasks[task_id]["message"] = f"ProPainter 실행 실패 (exit {process.returncode})"
                return

            # 결과 영상 찾기
            result_files = list(output_dir.glob("*.mp4")) + list(output_dir.glob("inpaint_out.mp4"))
            if not result_files:
                # ProPainter는 프레임으로 출력 → ffmpeg로 합치기
                result_frames = sorted(output_dir.glob("*.png"))
                if result_frames:
                    output_video = str(work_dir / "result.mp4")
                    # 원본 영상의 fps 가져오기
                    probe_cap = cv2.VideoCapture(str(video_path))
                    fps = probe_cap.get(cv2.CAP_PROP_FPS) or 25
                    probe_cap.release()

                    ffmpeg_cmd = [
                        "ffmpeg", "-y",
                        "-framerate", str(fps),
                        "-i", str(output_dir / "%05d.png"),
                        "-i", str(video_path),
                        "-map", "0:v", "-map", "1:a?",
                        "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-c:a", "aac",
                        output_video
                    ]
                    subprocess.run(ffmpeg_cmd, capture_output=True)
                    tasks[task_id]["output_path"] = output_video
                else:
                    tasks[task_id]["status"] = "failed"
                    tasks[task_id]["message"] = "ProPainter 출력 파일을 찾을 수 없습니다"
                    return
            else:
                tasks[task_id]["output_path"] = str(result_files[0])

            tasks[task_id]["status"] = "completed"
            tasks[task_id]["progress"] = 100
            tasks[task_id]["message"] = "완료"

        except Exception as e:
            tasks[task_id]["status"] = "failed"
            tasks[task_id]["message"] = str(e)

    thread = threading.Thread(target=run_propainter, daemon=True)
    thread.start()

    return {"taskId": task_id}


@app.get("/api/inpaint/status/{task_id}")
def inpaint_status(task_id: str):
    task = tasks.get(task_id)
    if not task:
        return JSONResponse({"error": "작업을 찾을 수 없습니다"}, status_code=404)
    return {
        "taskId": task_id,
        "status": task["status"],
        "progress": task["progress"],
        "message": task["message"],
    }


@app.get("/api/inpaint/result/{task_id}")
def inpaint_result(task_id: str):
    task = tasks.get(task_id)
    if not task or task["status"] != "completed":
        return JSONResponse({"error": "결과가 아직 준비되지 않았습니다"}, status_code=404)

    output_path = task.get("output_path", "")
    if not output_path or not os.path.exists(output_path):
        return JSONResponse({"error": "결과 파일을 찾을 수 없습니다"}, status_code=404)

    return FileResponse(output_path, media_type="video/mp4", filename=f"inpaint_{task_id}.mp4")


# ── Vmake AI 프록시 (CORS 우회 — 브라우저 → localhost → Vmake 서버) ──

vmake_tasks: dict[str, dict] = {}

@app.post("/api/vmake/remove-watermark")
async def vmake_remove_watermark(
    video: UploadFile = File(...),
    ak: str = Form(...),
    sk: str = Form(...),
):
    """Vmake videoscreenclear API 프록시 — 브라우저 CORS 우회"""
    task_id = str(uuid.uuid4())[:8]

    # 임시 파일에 저장
    suffix = Path(video.filename or "video.mp4").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await video.read()
        tmp.write(content)
        tmp_path = tmp.name

    vmake_tasks[task_id] = {
        "status": "uploading",
        "progress": 0,
        "message": "Vmake 서버에 업로드 중...",
        "result_path": None,
    }

    def run_vmake():
        try:
            import importlib
            vmake_tasks[task_id]["status"] = "processing"
            vmake_tasks[task_id]["progress"] = 10
            vmake_tasks[task_id]["message"] = "Vmake SDK 초기화..."

            os.environ["MT_AK"] = ak
            os.environ["MT_SK"] = sk

            # SDK 임포트 (action_api_sdk 필요)
            try:
                from action_api_sdk import SkillClient
            except ImportError:
                vmake_tasks[task_id]["status"] = "failed"
                vmake_tasks[task_id]["message"] = "Vmake SDK가 설치되지 않았습니다. pip install action-api-sdk"
                return

            client = SkillClient(ak, sk)
            vmake_tasks[task_id]["progress"] = 20
            vmake_tasks[task_id]["message"] = "영상 업로드 중..."

            result = client.run_task(
                "videoscreenclear",
                tmp_path,
                {"parameter": {"rsp_media_type": "url"}}
            )

            # 결과 URL 추출
            result_url = None
            if isinstance(result, dict):
                data = result.get("data", {})
                urls = data.get("result", {}).get("urls", [])
                if urls:
                    result_url = urls[0]
                else:
                    media_list = data.get("result", {}).get("data", {}).get("media_info_list", [])
                    if media_list:
                        result_url = media_list[0].get("media_data", "")

            if not result_url:
                err_msg = result.get("message", "") if isinstance(result, dict) else str(result)
                vmake_tasks[task_id]["status"] = "failed"
                vmake_tasks[task_id]["message"] = f"Vmake 처리 실패: {err_msg[:200]}"
                return

            # 결과 다운로드
            vmake_tasks[task_id]["progress"] = 90
            vmake_tasks[task_id]["message"] = "결과 다운로드 중..."

            import urllib.request
            result_path = tmp_path.replace(suffix, f"_vmake{suffix}")
            urllib.request.urlretrieve(result_url, result_path)

            vmake_tasks[task_id]["status"] = "completed"
            vmake_tasks[task_id]["progress"] = 100
            vmake_tasks[task_id]["message"] = "완료"
            vmake_tasks[task_id]["result_path"] = result_path

        except Exception as e:
            vmake_tasks[task_id]["status"] = "failed"
            vmake_tasks[task_id]["message"] = str(e)[:300]
        finally:
            try:
                os.unlink(tmp_path)
            except:
                pass

    thread = threading.Thread(target=run_vmake, daemon=True)
    thread.start()

    return {"taskId": task_id}


@app.get("/api/vmake/status/{task_id}")
def vmake_status(task_id: str):
    task = vmake_tasks.get(task_id)
    if not task:
        return JSONResponse({"error": "작업을 찾을 수 없습니다"}, status_code=404)
    return {
        "taskId": task_id,
        "status": task["status"],
        "progress": task["progress"],
        "message": task["message"],
    }


@app.get("/api/vmake/result/{task_id}")
def vmake_result(task_id: str):
    task = vmake_tasks.get(task_id)
    if not task or task["status"] != "completed":
        return JSONResponse({"error": "결과가 준비되지 않았습니다"}, status_code=404)
    result_path = task.get("result_path", "")
    if not result_path or not os.path.exists(result_path):
        return JSONResponse({"error": "결과 파일 없음"}, status_code=404)
    return FileResponse(result_path, media_type="video/mp4", filename=f"vmake_{task_id}.mp4")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "9877"))
    print(f"🧹 ProPainter + Vmake Proxy Server starting on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
