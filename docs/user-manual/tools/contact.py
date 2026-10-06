"""Contact sheet of figure PNGs for visual QA.  python contact.py IN_DIR OUT_DIR"""
import sys,glob,os
from PIL import Image,ImageDraw
d=sys.argv[1]; out=sys.argv[2]; os.makedirs(out,exist_ok=True)
fs=sorted(glob.glob(d+'/*.png'))
W=640; per=6
for k in range(0,len(fs),per):
    ims=[]
    for f in fs[k:k+per]:
        im=Image.open(f); im.thumbnail((W,W*1.1)); ims.append((os.path.basename(f),im))
    H=max(i.size[1] for _,i in ims)+24
    sheet=Image.new('RGB',(W*3,H*2),'white'); dr=ImageDraw.Draw(sheet)
    for j,(n,im) in enumerate(ims):
        x=(j%3)*W; y=(j//3)*H; sheet.paste(im,(x,y+22)); dr.text((x+4,y+4),n,fill='black')
    sheet.save(f'{out}/sheet{k//per:02d}.png')
