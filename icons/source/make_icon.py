from PIL import Image, ImageDraw

SIZE = 512
BG_TOP = (30, 41, 59)      # #1E293B
BG_BOTTOM = (15, 23, 42)   # #0F172A
ACCENT_A = (52, 211, 153)  # #34D399
ACCENT_B = (5, 150, 105)   # #059669
DARK = (15, 23, 42)
LIGHT = (248, 250, 252)
WHEEL_HUB = (148, 163, 184)

def vgrad(size, top, bottom):
    img = Image.new("RGB", (size, size), top)
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        r = round(top[0] + (bottom[0] - top[0]) * t)
        g = round(top[1] + (bottom[1] - top[1]) * t)
        b = round(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img

def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask

# Background with rounded corners
bg = vgrad(SIZE, BG_TOP, BG_BOTTOM)
mask = rounded_mask(SIZE, 112)
canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
canvas.paste(bg, (0, 0), mask)

draw = ImageDraw.Draw(canvas)

# --- Car body (accent gradient approximated as solid + highlight) ---
ox, oy = 66, 200
body_pts = [
    (ox+2, oy+118), (ox-6, oy+112),
    (ox+2, oy+78), (ox+18, oy+56), (ox+48, oy+44),
    (ox+78, oy+10), (ox+100, oy),
    (ox+280, oy), (ox+304, oy+12),
    (ox+330, oy+46), (ox+360, oy+54),
    (ox+380, oy+80), (ox+380, oy+100),
    (ox+362, oy+118),
]
draw.polygon(body_pts, fill=ACCENT_A)
draw.rounded_rectangle([ox+20, oy+92, ox+362, oy+124], radius=13, fill=ACCENT_B)

# windows
win_pts = [(ox+108, oy+44), (ox+134, oy+12), (ox+268, oy+12), (ox+292, oy+44)]
draw.polygon(win_pts, fill=DARK)
draw.line([(ox+200, oy+12), (ox+200, oy+44)], fill=BG_TOP, width=6)

# wheels
for cx in (ox+78, ox+304):
    cy = oy + 120
    draw.ellipse([cx-34, cy-34, cx+34, cy+34], fill=DARK)
    draw.ellipse([cx-16, cy-16, cx+16, cy+16], fill=WHEEL_HUB)

# --- Wrench badge (top-right), simple rotated capsule with two rings ---
# Build the shape as a plain alpha mask (white=opaque) so the hole cleanly
# punches through to transparency instead of leaving a black square.
wrench_mask = Image.new("L", (200, 200), 0)
wm = ImageDraw.Draw(wrench_mask)
wm.rounded_rectangle([86, 20, 114, 170], radius=14, fill=255)
wm.ellipse([70, 4, 130, 64], fill=255)
wm.ellipse([84, 18, 116, 50], fill=0)  # punch the ring hole

wrench_mask = wrench_mask.rotate(-45, resample=Image.BICUBIC, expand=True)
wrench_solid = Image.new("RGBA", wrench_mask.size, LIGHT + (255,))
wrench = Image.new("RGBA", wrench_mask.size, (0, 0, 0, 0))
wrench.paste(wrench_solid, (0, 0), wrench_mask)
canvas.alpha_composite(wrench, (300 - wrench.width // 2, 30))

canvas.save("icon-512.png")
canvas.resize((192, 192), Image.LANCZOS).save("icon-192.png")
canvas.resize((180, 180), Image.LANCZOS).save("apple-touch-icon.png")
canvas.resize((32, 32), Image.LANCZOS).save("favicon-32.png")

# Maskable version: same art but with extra safe-zone padding (scale art down ~80%)
maskable = vgrad(SIZE, BG_TOP, BG_BOTTOM).convert("RGBA")
inner = canvas.resize((int(SIZE*0.72), int(SIZE*0.72)), Image.LANCZOS)
maskable.alpha_composite(inner, ((SIZE-inner.width)//2, (SIZE-inner.height)//2))
maskable.save("icon-512-maskable.png")

print("done")
