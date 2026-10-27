"""Extract stepped roof masses from non-withheld City LAS class 6, preserving measured gaps.
Run with the context-data venv: python -I tools/build_city_forms.py [TILE ...]
TILE is a City LiDAR 2022 tile name (e.g. 490000_5459000); default: every zip in context-data/raw/lidar-2022 that has a
1 m ground grid from tools/build_city_ground.py. Tiles are mosaicked into one 1 m grid, so buildings on a tile edge
between two processed tiles are measured whole; 2015 footprints crossing the outer edge of the mosaic keep their old form.
No architectural regularization or inferred roof heights. Output is a derived 1 m / 3 m-band model.
"""
from pathlib import Path
import json, re, struct, sys, zipfile, hashlib, warnings
import numpy as np
import laspy, rasterio, shapely
from rasterio.features import shapes, rasterize, sieve
from rasterio.transform import from_origin
from shapely.geometry import Polygon, shape, box
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/data'
WORK=ROOT.parent/'context-data/work/building-street-upgrade-2026-10-22'
RAW=ROOT.parent/'context-data/raw/building-street-audit-2026-10-22'
LIDAR=ROOT.parent/'context-data/raw/lidar-2022'
GROUND=ROOT.parent/'context-data/work/terrain-upgrade-2026-10-22'
ORIGIN=(491300,5458600)

def pick_tiles(args):
    names=args or sorted(p.stem for p in LIDAR.glob('*.zip') if re.fullmatch(r'\d{6}_\d{7}',p.stem) and (GROUND/f'{p.stem}_ground_1m.tif').exists())
    assert names, 'No LiDAR tile with a ground grid: run tools/build_city_ground.py first'
    return [(n,*map(int,n.split('_'))) for n in names]

TILES=pick_tiles(sys.argv[1:])
EAST=min(e for _,e,_ in TILES); NORTH=min(n for _,_,n in TILES)
W=max(e for _,e,_ in TILES)+1000-EAST; H=max(n for _,_,n in TILES)+1000-NORTH
TRANSFORM=from_origin(EAST,NORTH+H,1,1)
def window(e,n):return NORTH+H-(n+1000),e-EAST  # row, col of a tile's north-west corner in the mosaic

def footprints():
    b=(OUT/'footprints_downtown.bin').read_bytes()
    magic,n,ox,oy,q,_=struct.unpack_from('<4sIiifI',b); assert magic==b'TSF1'
    pos=24
    def var():
        nonlocal pos
        value=shift=0
        while True:
            v=b[pos];pos+=1;value|=(v&127)<<shift;shift+=7
            if not v&128:return value
    def zz():
        v=var();return (v>>1)^-(v&1)
    rows=[];oid=fx=fy=0
    for _ in range(n):
        oid+=zz();head=var();sizes=[head>>1]
        if head&1:sizes += [var() for _ in range(var())]
        rings=[];x,y=fx,fy
        for ri,size in enumerate(sizes):
            ring=[]
            for k in range(size):
                x+=zz();y+=zz()
                if ri==0 and k==0:fx,fy=x,y
                ring.append((x*q+ox,y*q+oy))
            rings.append(ring)
        rows.append((oid,Polygon(rings[0],rings[1:])))
    assert pos==len(b)
    return rows

def ring(r):return [[round(x-ORIGIN[0],2),round(y-ORIGIN[1],2)] for x,y in list(r.coords)[:-1]]
def polygon(p):return {'outer':ring(p.exterior),'holes':[ring(r) for r in p.interiors]}
def parts(g):return [g] if g.geom_type=='Polygon' else [p for p in getattr(g,'geoms',[]) if p.geom_type=='Polygon']
def save_layer(lid,title,data,source,processing,vertical='CGVD28GVRD (HTMVBC00), as delivered',licence=None):
    payload=json.dumps(data,separators=(',',':'),allow_nan=False).encode()
    filename=lid+'.json';(OUT/filename).write_bytes(payload)
    m=json.loads((OUT/'layers.json').read_text(encoding='utf-8'))
    entry={'id':lid,'title':title,'file':filename,'format':'JSON, local metres east/north from CITY_ORIGIN',
        'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'lazy':True,
        'source':dict(publisher='City of Vancouver',**source),
        'licence':licence or {'name':'Open Government Licence - Vancouver','url':'https://opendata.vancouver.ca/pages/licence/'},
        'attribution':'City of Vancouver, derived geometry; '+(licence['name'] if licence else 'Open Government Licence - Vancouver')+'.',
        'crs':{'horizontal':'EPSG:26910','origin':list(ORIGIN),'note':'Native City UTM coordinates retained; no WGS84 round trip.'},
        'datum':{'vertical':vertical},'processing':processing,'flag':'unverified'}
    m['layers']=[l for l in m['layers'] if l['id']!=lid]+[entry]
    (OUT/'layers.json').write_text(json.dumps(m,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    return len(payload)

def roof_tile(name,east,north):
    """P90 of class 6 per 1 m cell for one tile (north-up rows), cached per tile in WORK."""
    cache=WORK/f'roof-observations-{name}.npz'
    legacy=WORK/'roof-observations.npz'  # the 22 Oct cache of tile 490000_5459000
    if not cache.exists() and name=='490000_5459000' and legacy.exists():cache=legacy
    if cache.exists():
        d=np.load(cache);return d['roof'],d['count']
    ids=[];heights=[]
    with zipfile.ZipFile(LIDAR/f'{name}.zip') as z:
        for member in z.infolist():
            if not member.filename.lower().endswith(('.las','.laz')):continue
            with z.open(member) as f,laspy.open(f,read_evlrs=False) as reader:
                assert reader.header.parse_crs().to_epsg()==26910
                for i,p in enumerate(reader.chunk_iterator(1000000)):
                    take=(np.asarray(p.classification)==6)&(np.asarray(p.withheld)==0)
                    c=np.floor(np.asarray(p.x)[take]-east).astype('int32')
                    r=999-np.floor(np.asarray(p.y)[take]-north).astype('int32')
                    h=np.asarray(p.z)[take].astype('float32')
                    keep=(c>=0)&(c<1000)&(r>=0)&(r<1000)&np.isfinite(h)
                    ids.append(r[keep]*1000+c[keep]);heights.append(h[keep])
                    if i%10==0:print(name,'read',(i+1)*1000000,'LAS points',flush=True)
    ix=np.concatenate(ids);h=np.concatenate(heights)
    order=np.lexsort((h,ix));ix=ix[order];h=h[order]
    unique,start,count=np.unique(ix,return_index=True,return_counts=True)
    roof=np.full(1000000,np.nan,dtype='float32');counts=np.zeros(1000000,dtype='uint32')
    roof[unique]=h[start+np.floor((count-1)*.9).astype(int)];counts[unique]=count
    roof=roof.reshape(1000,1000);counts=counts.reshape(1000,1000)
    np.savez_compressed(WORK/f'roof-observations-{name}.npz',roof=roof,count=counts)
    return roof,counts

def mosaic():
    roof=np.full((H,W),np.nan,dtype='float32');counts=np.zeros((H,W),dtype='uint32');ground=np.full((H,W),np.nan,dtype='float32')
    for name,e,n in TILES:
        r0,c0=window(e,n);rf,ct=roof_tile(name,e,n)
        roof[r0:r0+1000,c0:c0+1000]=rf;counts[r0:r0+1000,c0:c0+1000]=ct
        with rasterio.open(GROUND/f'{name}_ground_1m.tif') as ds:
            g=ds.read(1).astype('float32');g[g==ds.nodata]=np.nan
            assert ds.transform==from_origin(e,n+1000,1,1)
        ground[r0:r0+1000,c0:c0+1000]=g
    return roof,counts,ground

def ring_window(geom):
    """Row/col window of the mosaic around a geometry's bounds, and the transform of that window."""
    x0,y0,x1,y1=geom.bounds
    c0=max(0,int(np.floor(x0-EAST)));c1=min(W,int(np.ceil(x1-EAST)))
    r0=max(0,int(np.floor(NORTH+H-y1)));r1=min(H,int(np.ceil(NORTH+H-y0)))
    return r0,r1,c0,c1,from_origin(EAST+c0,NORTH+H-r0,1,1)

def main():
    WORK.mkdir(parents=True,exist_ok=True)
    fps=footprints();roof,counts,ground=mosaic()
    # Keep legacy buildings crossing the mosaic's outer edge intact, excluding their area from the new model.
    area=unary_union([box(e,n,e+1000,n+1000) for _,e,n in TILES]).buffer(-1,join_style='mitre')
    boundary=[p.buffer(2) for _,p in fps if p.intersects(area) and not area.contains(p)]
    coverage=area.difference(unary_union(boundary))
    inside=rasterize([(coverage,1)],out_shape=roof.shape,transform=TRANSFORM).astype(bool)
    valid=(counts>=3)&inside
    pad=np.pad(valid,1)
    # Numpy bool sums need integer accumulation.
    support=sum(pad[y:y+H,x:x+W].astype('uint8') for y in range(3) for x in range(3))
    valid &= support>=4
    roof=np.where(valid,roof,np.nan)
    padded=np.pad(roof,1,constant_values=np.nan)
    neighbours=np.stack([padded[y:y+H,x:x+W] for y in range(3) for x in range(3)])
    # Local rank filter removes narrow facade-return strips without averaging tall and low roofs.
    # It can shift a corner by one cell; this is a 1 m context model, not an architectural survey.
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        smooth=np.nanmedian(neighbours,axis=0)
    del neighbours,padded
    bands=np.where(valid,np.floor(np.nan_to_num(smooth)/3)+1,0).astype('int32')
    bands=sieve(bands,size=16,mask=valid,connectivity=4)
    regions=[];levels=[]
    for geom,value in shapes(bands,mask=valid,transform=TRANSFORM,connectivity=4):
        p=shapely.make_valid(shape(geom))
        for part in parts(p):
            if part.area>=16:regions.append(part);levels.append(int(value))
    # Simplify a polygon coverage jointly so adjacent levels still share exactly the same edge.
    original=regions
    regions=list(shapely.coverage_simplify(regions,1.0))
    tree_check=shapely.STRtree(regions); pairs=tree_check.query(regions,predicate='intersects'); overlaps=[regions[a].intersection(regions[b]).area for a,b in zip(*pairs) if a<b]
    print('Checking roof parts: maximum overlap area',max(overlaps,default=0),flush=True)
    assert max(overlaps,default=0)<1e-8, 'Overlapping roof masses'
    assert all(p.is_valid for p in regions)
    labels=rasterize([(p,i+1) for i,p in enumerate(original)],out_shape=roof.shape,transform=TRANSFORM,dtype='int32')
    # Cells of each region, grouped once (sorted by label, then height) instead of one full-grid mask per region.
    sel=(valid&(labels>0)).ravel();lab=labels.ravel()[sel];vals_all=roof.ravel()[sel];cnt_all=counts.ravel()[sel]
    order=np.lexsort((vals_all,lab));lab=lab[order];vals_all=vals_all[order];cnt_all=cnt_all[order]
    ulab,ustart,ucount=np.unique(lab,return_index=True,return_counts=True)
    cells_of={int(l):(int(s),int(c)) for l,s,c in zip(ulab,ustart,ucount)}
    # Connected roof component controls its base, including all of its tower/podium regions.
    components=[shape(g) for g,v in shapes(valid.astype('uint8'),mask=valid,transform=TRANSFORM) if shape(g).area>=9]
    tree=shapely.STRtree(components)
    old=np.frombuffer((OUT/'footprint_heights.bin').read_bytes(),dtype=[('g','<i2'),('r','<i2'),('m','<i2'),('n','<u2')],offset=8)
    fp_tree=shapely.STRtree([p for _,p in fps])
    bases=[]
    for comp in components:
        ring_=comp.buffer(6).difference(comp.buffer(.5))
        r0,r1,c0,c1,tf=ring_window(ring_)
        if r1<=r0 or c1<=c0:bases.append(None);continue
        mask=rasterize([(ring_,1)],out_shape=(r1-r0,c1-c0),transform=tf).astype(bool)
        g=ground[r0:r1,c0:c1];vals=g[mask&np.isfinite(g)]
        bases.append(float(np.percentile(vals,10)) if len(vals)>=10 else None)
    forms=[];missing_ground=0;residuals=[]
    for i,p in enumerate(regions):
        pt=original[i].representative_point();found=tree.query(pt,predicate='intersects')
        base=bases[int(found[0])] if len(found) else None
        if base is None:
            candidates=[old[k]['g']/10 for k in fp_tree.query(original[i],predicate='intersects') if old[k]['g']!=-32768]
            base=float(min(candidates)) if candidates else None
        if base is None:missing_ground+=1;continue
        if i+1 not in cells_of:continue
        s,c=cells_of[i+1];vals=vals_all[s:s+c]
        top=float(np.median(vals))
        if top-base<2:continue
        residuals.extend((vals-top).tolist())
        for poly in parts(p):
            if poly.area<16:continue
            forms.append(dict(id=-(len(forms)+1),**polygon(poly),ground=round(base,2),roof=round(top,2),
                max=round(float(np.percentile(vals,99)),2),points=int(cnt_all[s:s+c].sum())))
    union=unary_union([Polygon([(x+ORIGIN[0],y+ORIGIN[1]) for x,y in f['outer']], [[(x+ORIGIN[0],y+ORIGIN[1]) for x,y in r] for r in f['holes']]) for f in forms])
    # Remove superseded 2015 parts only when fully covered and supported by measured roof geometry.
    replaced=[i for i,(_,p) in enumerate(fps) if coverage.covers(p) and p.intersection(union).area>min(9,p.area*.2)]
    report={'forms':len(forms),'replaced_2015_parts':len(replaced),'supported_cells':int(valid.sum()),
        'roof_points':int(counts[valid].sum()),'roof_area_m2':round(union.area,1),'missing_ground_regions':missing_ground,
        'cell_to_mass_median_abs_m':round(float(np.median(np.abs(residuals))),2),
        'cell_to_mass_p95_abs_m':round(float(np.percentile(np.abs(residuals),95)),2),
        'roof_polygons_valid':True,'max_roof_overlap_m2':max(overlaps,default=0),
        'note':'Internal cell-to-mass fit, not independent survey accuracy. Sloped roofs are stepped approximations; walls inferred vertically.',
        'cell_m':1,'height_band_m':3,'min_area_m2':16,'joint_simplify_m':1.0,
        'tiles':[n for n,_,_ in TILES],
        'coverage_local':[EAST-ORIGIN[0],NORTH-ORIGIN[1],EAST+W-ORIGIN[0],NORTH+H-ORIGIN[1]]}
    repairs=[{'index':i,'parts':[polygon(q) for q in parts(shapely.make_valid(p)) if q.area>=1]} for i,(_,p) in enumerate(fps) if not p.is_valid]
    report['repaired_2015_polygons']=len(repairs)
    names=[n for n,_,_ in TILES]
    data={'version':1,'origin':list(ORIGIN),'baseCount':len(fps),'baseSha256':hashlib.sha256((OUT/'footprints_downtown.bin').read_bytes()).hexdigest(),
          'tile':'+'.join(names),'repairs':repairs,'replace':replaced,'forms':forms,'stats':report}
    # Retrieval date of each tile as recorded for its ground layer by build_city_ground.py.
    man={l['id']:l for l in json.loads((OUT/'layers.json').read_text(encoding='utf-8'))['layers']}
    got={n:man[f'terrain_ground_{n}']['source']['retrieved'] for n in names}
    report['bytes']=save_layer('building_forms','City LiDAR 2022: stepped building forms',data,
        {'name':'LiDAR 2022 building class 6','url':'https://opendata.vancouver.ca/explore/dataset/lidar-2022/',
         'retrieved':max(got.values()),
         'request':[f'https://webtransfer.vancouver.ca/opendata/2022LiDAR/{n}.zip' for n in names],
         'tiles':[{'tile':n,'retrieved':got[n]} for n in names],
         'note':f'{len(names)} processed 1 km tile{"s" if len(names)>1 else ""}, mosaicked. Separate roof levels derived from classified returns, not a survey-grade architectural model.'},report)
    (WORK/'building-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
