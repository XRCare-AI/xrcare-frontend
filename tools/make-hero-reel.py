"""Home page hero video: the site's photos crossfading with a slow zoom and pan, as a seamless loop.
Frames are drawn with sub-pixel crops (smooth motion) and piped to ffmpeg.

    pip install pillow imageio-ffmpeg        # imageio-ffmpeg brings its own ffmpeg
    python tools/make-hero-reel.py images videos/hero-reel     # writes videos/hero-reel.mp4 and .jpg (poster)
"""
import math, subprocess, sys
from PIL import Image
import imageio_ffmpeg

root, out = sys.argv[1], sys.argv[2]
W, H, FPS = 1600, 900, 30
HOLD, FADE = 5.0, 1.5                       # seconds each photo leads, crossfade length
photos = ['hero.jpg', 'care-team-training.jpg', 'clinical-teams.jpg', 'pharmacy.jpg', 'articles/extended-intelligence.jpg']
# (zoom start, zoom end, pan from (x,y), pan to) as fractions of the free space around the crop
moves = [(1.0, 1.18, (0.3, 0.4), (0.6, 0.5)), (1.2, 1.02, (0.7, 0.3), (0.4, 0.5)),
         (1.02, 1.2, (0.5, 0.6), (0.5, 0.3)), (1.18, 1.0, (0.3, 0.5), (0.65, 0.4)),
         (1.0, 1.16, (0.6, 0.35), (0.4, 0.55))]
images = [Image.open(f'{root}/{p}').convert('RGB') for p in photos]
N, T = len(images), len(images) * HOLD
frames = int(T * FPS)
ease = lambda p: 0.5 - 0.5 * math.cos(math.pi * min(max(p, 0), 1))

def frame_of(i, p):
    im, (z0, z1, a, b) = images[i], moves[i]
    iw, ih = im.size
    cw, ch = (iw, iw * H / W) if iw / ih < W / H else (ih * W / H, ih)   # largest 16:9 crop
    z = z0 + (z1 - z0) * p
    w, h = cw / z, ch / z
    fx = a[0] + (b[0] - a[0]) * p; fy = a[1] + (b[1] - a[1]) * p
    x, y = (iw - w) * fx, (ih - h) * fy
    return im.resize((W, H), Image.BICUBIC, box=(x, y, x + w, y + h))

cmd = [imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
       '-movflags', '+faststart', '-an', out + '.mp4']
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
span = HOLD + FADE                            # each photo moves over its whole time on screen
for f in range(frames):
    t = f / FPS
    layers = []
    for i in range(N):
        start = (i * HOLD - FADE) % T          # photo i fades in FADE seconds before its turn
        local = (t - start) % T
        if local < span:
            alpha = min(1.0, local / FADE)     # fading in
            layers.append((i, local / span, alpha))
    layers.sort(key=lambda l: -l[2])           # fully shown photo first, the one fading in on top
    base = frame_of(layers[0][0], layers[0][1])
    for i, p, alpha in layers[1:]:
        base = Image.blend(base, frame_of(i, p), ease(alpha))
    if f == int(FPS * 1):
        base.save(out + '.jpg', quality=80)    # poster
    proc.stdin.write(base.tobytes())
proc.stdin.close(); proc.wait()
print('done', frames, 'frames')
