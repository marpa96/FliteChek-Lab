from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
SIZES=[(320,568,2),(375,667,2),(414,736,3),(375,812,3),(390,844,3),(393,852,3),(402,874,3),(414,896,2),(414,896,3),(428,926,3),(430,932,3),(440,956,3),(420,912,3)]
OUT=ROOT/'web'/'launch';OUT.mkdir(exist_ok=True)
links=[];files=[]
for width,height,scale in SIZES:
 for orientation in ['portrait','landscape']:
  x,y=(width,height) if orientation=='portrait' else (height,width)
  image=Image.new('RGB',(x*scale,y*scale),'#080303');draw=ImageDraw.Draw(image)
  for text,size,offset,color in [('FliteChek',32,-35,'#d8897e'),('Starting your checklists…',16,20,'#aa746e')]:
   font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',size*scale)
   draw.text((x*scale/2,y*scale/2+offset*scale),text,font=font,fill=color,anchor='mm')
  name=f'launch/{width}-{height}-{scale}-{orientation}.png';image.save(ROOT/'web'/name,optimize=True);files.append('./'+name)
  links.append(f'<link rel="apple-touch-startup-image" href="./{name}" media="(device-width: {width}px) and (device-height: {height}px) and (-webkit-device-pixel-ratio: {scale}) and (orientation: {orientation})">')
(ROOT/'web/launch/links.txt').write_text('\n'.join(links))
import json
(ROOT/'web/launch/files.json').write_text(json.dumps(files))
