"""
AttendanceEngine — Flask-free face recognition attendance system.
Ported from OpenCvProjects/attendance_core.py; runs camera capture
in a background thread. Calls on_mark_callback(name, confidence)
when a student is successfully recognized.
"""
import os
import re
import threading
import time
import logging
from datetime import datetime, timedelta
from collections import defaultdict, Counter
from typing import Callable, Optional

try:
    import cv2
    import numpy as np
    import face_recognition
    from sklearn.cluster import DBSCAN
    _DEPS_OK = True
except ImportError as _dep_err:
    _DEPS_OK = False
    _MISSING = str(_dep_err)

log = logging.getLogger("attendance.engine")


class AttendanceEngine:
    # ── Tunable config ────────────────────────────────────────────────────────
    FACE_MATCH_THRESHOLD        = 0.45
    FRAME_SCALE                 = 0.5
    PROCESS_EVERY_N_FRAMES      = 3
    VOTE_WINDOW                 = 5
    ATTENDANCE_COOLDOWN         = 60      # seconds before re-marking same person

    MIN_FACE_WIDTH              = 60      # pixels in original frame
    MIN_BLUR_SCORE              = 80.0    # Laplacian variance
    MIN_BRIGHTNESS              = 40
    MAX_BRIGHTNESS              = 230

    UNKNOWN_CLUSTER_MIN_SAMPLES = 8
    UNKNOWN_CLUSTER_EPS         = 0.5
    CLUSTER_INTERVAL            = 5.0
    UNKNOWN_BUFFER_MAX          = 500

    def __init__(
        self,
        on_mark_callback: Callable[[str, float], None],
        known_faces_dir: str = "",
    ):
        if not _DEPS_OK:
            raise RuntimeError(
                f"face_recognition / OpenCV not installed: {_MISSING}\n"
                "Install with:  pip install cmake dlib face_recognition opencv-python scikit-learn\n"
                "On Windows you may need Visual C++ Build Tools first."
            )
        self.known_faces_dir  = known_faces_dir
        self.on_mark_callback = on_mark_callback

        self._known_encodings: list = []
        self._names: list           = []

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        self._recognized: set                   = set()
        self._last_attendance_time: dict[str, datetime] = {}

        self._frame_counter  = 0
        self._cached_results = []
        self._vote_buffer    = defaultdict(list)

        self._unknown_encodings: list  = []
        self._unknown_labels:    dict  = {}
        self._unknown_label_counter    = 0
        self._last_cluster_time        = 0.0

        self._fps_counter   = 0
        self._fps_last_time = time.time()
        self.fps_current    = 0.0

        self._latest_jpeg: Optional[bytes] = None   # for MJPEG streaming
        self._cap = None                            # cv2.VideoCapture — stored for force-release

        self._clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))  # noqa: F821 (guarded above)

    # ── Public API ────────────────────────────────────────────────────────────

    def load_known_faces_from_list(self, students: list) -> int:
        """Load face encodings directly from a list of {name, face_encoding} dicts (from MongoDB)."""
        self._known_encodings = []
        self._names = []
        for s in students:
            enc = s.get("face_encoding")
            if enc and len(enc) == 128:
                self._known_encodings.append(np.array(enc))
                self._names.append(s["name"])
        log.info(f"Loaded {len(self._names)} identities from database")
        return len(self._names)

    def load_known_faces(self) -> int:
        """Load and average face encodings from known_faces_dir. Returns identity count."""
        person_encodings: dict = defaultdict(list)
        try:
            for fname in os.listdir(self.known_faces_dir):
                if not fname.lower().endswith(('.png', '.jpg', '.jpeg')):
                    continue
                img = cv2.imread(os.path.join(self.known_faces_dir, fname))
                if img is None:
                    continue
                try:
                    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                    encs    = face_recognition.face_encodings(img_rgb)
                    if encs:
                        # Strip trailing _N suffix so multiple photos merge to one identity
                        base = re.sub(r'_\d+$', '', os.path.splitext(fname)[0])
                        person_encodings[base].append(encs[0])
                except Exception as exc:
                    log.warning(f"Could not encode {fname}: {exc}")
        except Exception as exc:
            log.error(f"Error listing {self.known_faces_dir}: {exc}")

        self._known_encodings = [np.mean(encs, axis=0) for encs in person_encodings.values()]
        self._names           = list(person_encodings.keys())
        total_imgs = sum(len(v) for v in person_encodings.values())
        log.info(f"Loaded {len(self._names)} identities from {total_imgs} images")
        return len(self._names)

    def start(self, camera_index: int = 0) -> None:
        """Start the camera loop in a daemon background thread."""
        if self._running:
            return
        if not self._known_encodings and self.known_faces_dir:
            self.load_known_faces()
        self._running = True
        self._thread  = threading.Thread(
            target=self._camera_loop,
            args=(camera_index,),
            daemon=True,
            name="AttendanceEngine",
        )
        self._thread.start()
        log.info(f"AttendanceEngine started on camera {camera_index}")

    def stop(self) -> None:
        """Signal the background thread to stop, wait, then force-release the camera."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        # Force-release camera even if thread didn't exit cleanly (Windows driver hold)
        cap = self._cap
        if cap is not None:
            try:
                cap.release()
            except Exception:
                pass
            self._cap = None
        self._latest_jpeg = None
        log.info("AttendanceEngine stopped")

    def set_threshold(self, confidence_pct: float) -> None:
        """Update recognition threshold from a UI confidence percentage (0–100)."""
        self.FACE_MATCH_THRESHOLD = 1.0 - (max(10.0, min(95.0, confidence_pct)) / 100.0)
        log.info(f"Threshold updated to {self.FACE_MATCH_THRESHOLD:.2f} ({confidence_pct:.0f}% confidence)")

    def get_present(self) -> list[str]:
        with self._lock:
            return list(self._recognized)

    def get_frame(self) -> Optional[bytes]:
        """Return latest camera frame as JPEG bytes for MJPEG streaming."""
        with self._lock:
            return self._latest_jpeg

    # ── Thread loop ───────────────────────────────────────────────────────────

    def _camera_loop(self, camera_index: int) -> None:
        cap = cv2.VideoCapture(camera_index)
        self._cap = cap
        if not cap.isOpened():
            log.error(f"Cannot open camera {camera_index}")
            self._running = False
            self._cap = None
            return
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # minimize buffering so reads don't block long
        try:
            while self._running:
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.05)
                    continue
                self._process_frame(frame)
                annotated = frame.copy()
                with self._lock:
                    recognized_set = set(self._recognized)
                    results_snap   = list(self._cached_results)

                h_frame, w_frame = annotated.shape[:2]
                for (top, right, bottom, left, name, confidence, _qtag) in results_snap:
                    if name == "__REJECTED__":
                        cv2.rectangle(annotated, (left, top), (right, bottom), (80, 80, 80), 1)
                        continue

                    is_marked = name in recognized_set and name not in ("UNKNOWN",)
                    # BGR: green for marked, red for pending/unknown
                    color = (0, 210, 0) if is_marked else (0, 0, 220)
                    thickness = 3 if is_marked else 2

                    cv2.rectangle(annotated, (left, top), (right, bottom), color, thickness)

                    # Build label string
                    if name == "UNKNOWN" or name.startswith("Intruder"):
                        label = "Unknown"
                    else:
                        label = name.replace("_", " ").title()
                        if confidence > 0:
                            label += f"  {confidence:.0f}%"
                        if is_marked:
                            label += " ✓"

                    font       = cv2.FONT_HERSHEY_SIMPLEX
                    font_scale = 0.58
                    font_thick = 1
                    (tw, th), _ = cv2.getTextSize(label, font, font_scale, font_thick)
                    pad = 4

                    # Place label below rectangle; flip above if it would go off-frame
                    if bottom + th + pad * 2 + 2 < h_frame:
                        bg_y1, bg_y2 = bottom + 2, bottom + th + pad * 2 + 2
                        tx, ty = left, bottom + th + pad + 2
                    else:
                        bg_y1, bg_y2 = top - th - pad * 2 - 2, top - 2
                        tx, ty = left, top - pad - 2

                    # Clamp horizontally
                    bg_x2 = min(left + tw + pad * 2, w_frame)
                    cv2.rectangle(annotated, (left, bg_y1), (bg_x2, bg_y2), color, -1)
                    cv2.putText(annotated, label, (tx + pad, ty),
                                font, font_scale, (255, 255, 255), font_thick, cv2.LINE_AA)

                ok, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 75])
                if ok:
                    with self._lock:
                        self._latest_jpeg = buf.tobytes()
        finally:
            cap.release()
            self._cap = None

    def _process_frame(self, frame: np.ndarray) -> None:
        self._update_fps()
        self._frame_counter += 1

        enhanced   = self._apply_clahe(frame)
        frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        run_recognition = (
            self._frame_counter % self.PROCESS_EVERY_N_FRAMES == 0
            or not self._cached_results
        )

        if run_recognition:
            scale     = self.FRAME_SCALE
            small     = cv2.resize(enhanced, (0, 0), fx=scale, fy=scale)
            rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

            face_locs = face_recognition.face_locations(rgb_small, model="hog")
            face_encs = face_recognition.face_encodings(rgb_small, face_locs)

            new_results = []
            for (ts, rs, bs, ls), enc in zip(face_locs, face_encs):
                top, right, bottom, left = (
                    int(ts / scale), int(rs / scale),
                    int(bs / scale), int(ls / scale),
                )
                passes, reason = self._face_quality(frame_gray, top, right, bottom, left)
                if not passes:
                    new_results.append((top, right, bottom, left, "__REJECTED__", 0.0, reason))
                    continue

                if self._known_encodings:
                    dists    = face_recognition.face_distance(self._known_encodings, enc)
                    best_idx = int(np.argmin(dists))
                    best_dist = float(dists[best_idx])
                else:
                    best_dist, best_idx = 1.0, -1

                if best_dist < self.FACE_MATCH_THRESHOLD and best_idx >= 0:
                    raw_name   = self._names[best_idx].upper()
                    confidence = round((1.0 - best_dist) * 100, 1)
                else:
                    raw_name   = "UNKNOWN"
                    confidence = 0.0
                    self._unknown_encodings.append(enc.tolist())
                    if len(self._unknown_encodings) > self.UNKNOWN_BUFFER_MAX:
                        self._unknown_encodings.pop(0)
                    self._cluster_unknowns()

                new_results.append((top, right, bottom, left, raw_name, confidence, "ok"))

            # Temporal voting with IoU-based track matching
            updated, used = [], set()
            for (top, right, bottom, left, raw_name, confidence, qtag) in new_results:
                if raw_name == "__REJECTED__":
                    updated.append((top, right, bottom, left, raw_name, confidence, qtag))
                    continue

                box = (top, right, bottom, left)
                best_id, best_iou = None, 0.3
                for i, cached in enumerate(self._cached_results):
                    if i in used or cached[4] == "__REJECTED__":
                        continue
                    iou = self._iou(box, cached[:4])
                    if iou > best_iou:
                        best_iou, best_id = iou, i

                track_id = best_id if best_id is not None else id(box)
                if best_id is not None:
                    used.add(best_id)

                buf = self._vote_buffer[track_id]
                buf.append(raw_name)
                if len(buf) > self.VOTE_WINDOW:
                    buf.pop(0)
                voted_name = Counter(buf).most_common(1)[0][0]

                if voted_name == "UNKNOWN" and self._unknown_encodings:
                    voted_name = self._get_unknown_label(np.array(self._unknown_encodings[-1]))

                updated.append((top, right, bottom, left, voted_name, confidence, qtag))

            self._cached_results = updated

        # Mark attendance for confirmed identities
        now = datetime.now()
        for (_, _, _, _, name, confidence, _) in self._cached_results:
            if name in ("__REJECTED__", "UNKNOWN") or name.startswith("Intruder"):
                continue
            last = self._last_attendance_time.get(name)
            if last is None or (now - last).total_seconds() >= self.ATTENDANCE_COOLDOWN:
                self._last_attendance_time[name] = now
                with self._lock:
                    already = name in self._recognized
                    self._recognized.add(name)
                if not already:
                    log.info(f"Marked present: {name} ({confidence:.0f}%)")
                try:
                    self.on_mark_callback(name, confidence)
                except Exception as exc:
                    log.error(f"on_mark_callback error for {name}: {exc}")

    # ── CV helpers ────────────────────────────────────────────────────────────

    def _apply_clahe(self, frame: np.ndarray) -> np.ndarray:
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = self._clahe.apply(l)
        return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    def _update_fps(self) -> None:
        self._fps_counter += 1
        now = time.time()
        elapsed = now - self._fps_last_time
        if elapsed >= 1.0:
            self.fps_current    = self._fps_counter / elapsed
            self._fps_counter   = 0
            self._fps_last_time = now

    def _face_quality(
        self, frame_gray: np.ndarray, top: int, right: int, bottom: int, left: int
    ) -> tuple[bool, str]:
        if (right - left) < self.MIN_FACE_WIDTH:
            return False, "too small"
        crop = frame_gray[top:bottom, left:right]
        if crop.size == 0:
            return False, "empty crop"
        blur = float(cv2.Laplacian(crop, cv2.CV_64F).var())
        if blur < self.MIN_BLUR_SCORE:
            return False, "blurry"
        bright = float(crop.mean())
        if bright < self.MIN_BRIGHTNESS:
            return False, "too dark"
        if bright > self.MAX_BRIGHTNESS:
            return False, "overexposed"
        return True, "ok"

    @staticmethod
    def _iou(a: tuple, b: tuple) -> float:
        yA = max(a[0], b[0]); xA = min(a[1], b[1])
        yB = min(a[2], b[2]); xB = max(a[3], b[3])
        inter = max(0, yB - yA) * max(0, xA - xB)
        areaA = (a[2] - a[0]) * (a[1] - a[3])
        areaB = (b[2] - b[0]) * (b[1] - b[3])
        union = areaA + areaB - inter
        return inter / union if union > 0 else 0.0

    def _cluster_unknowns(self) -> None:
        if len(self._unknown_encodings) < self.UNKNOWN_CLUSTER_MIN_SAMPLES:
            return
        now = time.time()
        if now - self._last_cluster_time < self.CLUSTER_INTERVAL:
            return
        self._last_cluster_time = now

        X      = np.array(self._unknown_encodings)
        labels = DBSCAN(
            eps=self.UNKNOWN_CLUSTER_EPS,
            min_samples=self.UNKNOWN_CLUSTER_MIN_SAMPLES,
            metric="euclidean",
        ).fit_predict(X)

        new_labels: dict = {}
        for cid in set(labels):
            if cid == -1:
                continue
            if cid not in self._unknown_labels:
                self._unknown_label_counter += 1
                self._unknown_labels[cid] = f"Intruder #{self._unknown_label_counter}"
            new_labels[cid] = self._unknown_labels[cid]
        self._unknown_labels = new_labels

    def _get_unknown_label(self, encoding: np.ndarray) -> str:
        if not self._unknown_labels or not self._unknown_encodings:
            return "UNKNOWN"
        X      = np.array(self._unknown_encodings)
        labels = DBSCAN(
            eps=self.UNKNOWN_CLUSTER_EPS,
            min_samples=self.UNKNOWN_CLUSTER_MIN_SAMPLES,
            metric="euclidean",
        ).fit_predict(X)
        nearest_idx = int(np.argmin(np.linalg.norm(X - encoding, axis=1)))
        return self._unknown_labels.get(labels[nearest_idx], "UNKNOWN")
