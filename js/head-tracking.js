// Head tracking cursor: the webcam follows the tip of your nose (MediaPipe face landmarks) and moves an on-screen
// pointer, so you can hover the site by moving your head. Ported from Open Coding Society's GlobalNodCursor
// (assets/js/user-preferences.js), which is based on NodCursor. Video never leaves the browser.
//
// Loaded only when needed: js/main.js starts it on every page when the user turned it on, and the Preferences page
// drives it directly for its switch and calibration buttons.
//   start({sensitivity, calibration}) / stop() / update({sensitivity, calibration}) / rawPoint() / isRunning()

const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let settings = { sensitivity: 0.45, calibration: null };
let landmarker, stream, video, cursor, frame, smoothed, raw;

// Where the nose is in the camera frame (0..1) -> where the pointer goes on screen (0..1), using the calibration
function toScreen(x, y) {
    const c = settings.calibration;
    if (!c) return { x, y };
    const scale = (value, low, high) => Math.abs(high - low) < 0.001 ? 0.5 : (value - low) / (high - low);
    const clamp = v => Math.max(0, Math.min(1, v));
    return { x: clamp(scale(x, c.leftX, c.rightX)), y: clamp(scale(y, c.upY, c.downY)) };
}

function makeCursor() {
    cursor = document.createElement("div");
    cursor.className = "head-cursor";
    cursor.setAttribute("aria-hidden", "true");
    document.body.append(cursor);
}

function tick() {
    if (!landmarker || !video) return;
    if (video.readyState >= 2) {
        const nose = landmarker.detectForVideo(video, performance.now())?.faceLandmarks?.[0]?.[1];
        if (nose) {
            raw = { x: 1 - nose.x, y: nose.y };   // mirrored, so moving right moves the pointer right
            const target = toScreen(raw.x, raw.y);
            const tx = target.x * innerWidth, ty = target.y * innerHeight;
            const alpha = Math.min(0.9, Math.max(0.1, settings.sensitivity));
            smoothed = smoothed ? { x: smoothed.x + (tx - smoothed.x) * alpha, y: smoothed.y + (ty - smoothed.y) * alpha } : { x: tx, y: ty };
            const x = Math.max(0, Math.min(innerWidth - 1, smoothed.x)), y = Math.max(0, Math.min(innerHeight - 1, smoothed.y));
            cursor.style.transform = `translate(${Math.round(x - 10)}px, ${Math.round(y - 10)}px)`;
            // Let the page react as if the mouse were there (hover menus, tooltips)
            const move = new MouseEvent("mousemove", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
            document.elementFromPoint(x, y)?.dispatchEvent(move);
        }
    }
    frame = requestAnimationFrame(tick);
}

export async function start(options = {}) {
    update(options);
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't use a webcam.");
    if (!landmarker) {
        const vision = await import(`${VISION}/+esm`);
        const files = await vision.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
        landmarker = await vision.FaceLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: MODEL },
            runningMode: "VIDEO",
            numFaces: 1,
        });
    }
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
    video = Object.assign(document.createElement("video"), { autoplay: true, muted: true, playsInline: true, srcObject: stream });
    video.className = "head-cursor__video";
    document.body.append(video);
    await video.play();
    if (!cursor) makeCursor();
    cursor.hidden = false;
    smoothed = null;
    frame = requestAnimationFrame(tick);
}

export function stop() {
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach(track => track.stop());
    video?.remove();
    stream = video = smoothed = raw = null;
    if (cursor) cursor.hidden = true;
}

export function update(options = {}) {
    settings = { ...settings, ...options };
}

export const rawPoint = () => raw;
export const isRunning = () => Boolean(stream);
