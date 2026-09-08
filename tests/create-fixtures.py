"""Generate synthetic receipts only; no personal reimbursement data is used."""
from pathlib import Path
from PIL import Image, ImageDraw

directory = Path(__file__).parent / 'fixtures'
directory.mkdir(exist_ok=True)
for name, dimensions, color, label in [
    ('payment.png', (420, 840), '#e7eee3', 'PAYMENT RECEIPT'),
    ('invoice.jpg', (840, 420), '#f5eee1', 'IMAGE INVOICE'),
]:
    image = Image.new('RGB', dimensions, color)
    draw = ImageDraw.Draw(image)
    draw.rectangle((16, 16, dimensions[0]-17, dimensions[1]-17), outline='#365d46', width=3)
    draw.text((36, 42), label, fill='#253b32', font_size=30)
    draw.text((36, 105), 'TEST ONLY  123.45', fill='#253b32', font_size=25)
    for y in range(170, dimensions[1]-35, 55):
        draw.line((36, y, dimensions[0]-36, y), fill='#98a88f', width=2)
    image.save(directory / name)
