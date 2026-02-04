from PIL import Image
import os

ICONS_DIR = os.path.join(os.path.dirname(__file__), 'icons')
TARGET_SIZE = 64

for filename in os.listdir(ICONS_DIR):
    if filename.endswith('.png'):
        filepath = os.path.join(ICONS_DIR, filename)
        img = Image.open(filepath)
        
        if img.width == TARGET_SIZE and img.height == TARGET_SIZE:
            print(f'Skipped: {filename} (already {TARGET_SIZE}x{TARGET_SIZE})')
            continue
        
        img.thumbnail((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
        
        canvas = Image.new('RGBA', (TARGET_SIZE, TARGET_SIZE), (0, 0, 0, 0))
        x = (TARGET_SIZE - img.width) // 2
        y = (TARGET_SIZE - img.height) // 2
        canvas.paste(img, (x, y))
        canvas.save(filepath)
        print(f'Resized: {filename} ({img.width}x{img.height})')

print('Done')