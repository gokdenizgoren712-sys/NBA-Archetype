"""Generate og-image.png (1200x630) for social sharing."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
BG = (10, 12, 20)
PANEL = (18, 22, 35)
AMBER = (245, 158, 11)
WHITE = (255, 255, 255)
GRAY = (148, 163, 184)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# Background panel
d.rectangle([40, 40, W - 40, H - 40], fill=PANEL, outline=(30, 40, 60), width=2)

# Amber accent bar at top
d.rectangle([40, 40, W - 40, 46], fill=AMBER)

# Try to use a system font; fall back to default
def font(size):
    for name in ["arial.ttf", "Arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"]:
        for path in [
            f"C:/Windows/Fonts/{name}",
            f"/usr/share/fonts/truetype/dejavu/{name}",
            f"/usr/share/fonts/liberation/{name}",
        ]:
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
    return ImageFont.load_default()

title_font  = font(72)
sub_font    = font(28)
label_font  = font(22)
small_font  = font(18)

# Main title
d.text((80, 100), "NBA Archetype", font=title_font, fill=AMBER)
d.text((80, 190), "Identify Every Player's True Role", font=sub_font, fill=WHITE)

# Divider
d.line([(80, 250), (W - 80, 250)], fill=(40, 50, 70), width=2)

# Stats row
stats = [
    ("12", "Core Archetypes"),
    ("22", "Modifier Tags"),
    ("40+", "Seasons"),
    ("16 000+", "Player-Seasons"),
]
col_w = (W - 160) // len(stats)
for i, (val, lbl) in enumerate(stats):
    x = 80 + i * col_w + col_w // 2
    d.text((x, 280), val, font=font(52), fill=AMBER, anchor="mt")
    d.text((x, 345), lbl, font=label_font, fill=GRAY, anchor="mt")

# Archetype badges row
archetypes = ["Engine", "Creator", "Anchor", "Spacer", "Stopper", "Hub"]
badge_y = 430
bw, bh, gap = 160, 44, 12
total_bw = len(archetypes) * bw + (len(archetypes) - 1) * gap
bx0 = (W - total_bw) // 2
for i, arch in enumerate(archetypes):
    bx = bx0 + i * (bw + gap)
    d.rounded_rectangle([bx, badge_y, bx + bw, badge_y + bh], radius=8,
                        fill=(30, 40, 60), outline=AMBER, width=1)
    d.text((bx + bw // 2, badge_y + bh // 2), arch, font=small_font,
           fill=WHITE, anchor="mm")

# URL
d.text((W // 2, H - 65), "nba-archetypes.onrender.com", font=label_font,
       fill=GRAY, anchor="mm")

out = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "og-image.png")
img.save(out)
print(f"Saved: {os.path.abspath(out)}")
