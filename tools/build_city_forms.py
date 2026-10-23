"""Extract stepped roof masses from non-withheld City LAS class 6, preserving measured gaps.
Run with the context-data venv: python -I tools/build_city_forms.py
No architectural regularization or inferred roof heights. Output is a derived 1 m / 3 m-band model.
"""
from pathlib import Path
import json, struct, zipfile, hashlib, warnings
import numpy as np
import laspy, rasterio, shapely
from rasterio.features import shapes, rasterize, sieve
from rasterio.transform import from_origin
from shapely.geometry import Polygon, shape, box
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/data'
WORK=ROOT.parent/'context-data/work/building-street-upgrade-2026-10-22'
RAW=ROOT.parent/'context-data/raw/building-street-audit-2026-10-22'
ORIGIN=(491300,5458600); EAST=490000; NORTH=5459000
TRANSFORM=from_origin(EAST,NORTH+1000,1,1)

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
        'source':dict(publisher='City of Vancouver',retrieved='2026-10-22',**source),
        'licence':licence or {'name':'Open Government Licence - Vancouver','url':'https://opendata.vancouver.ca/pages/licence/'},
        'attribution':'City of Vancouver, derived geometry; '+(licence['name'] if licence else 'Open Government Licence - Vancouver')+'.',
        'crs':{'horizontal':'EPSG:26910','origin':list(ORIGIN),'note':'Native City UTM coordinates retained; no WGS84 round trip.'},
        'datum':{'vertical':vertical},'processing':processing,'flag':'unverified'}
    m['layers']=[l for l in m['layers'] if l['id']!=lid]+[entry]
    (OUT/'layers.json').write_text(json.dumps(m,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    return len(payload)

def roof_grid():
    cache=WORK/'roof-observations.npz'
    if cache.exists():
        d=np.load(cache);return d['roof'],d['count']
    ids=[];heights=[]
    archive=ROOT.parent/'context-data/raw/lidar-2022/490000_5459000.zip'
    with zipfile.ZipFile(archive) as z:
        for member in z.infolist():
            if not member.filename.lower().endswith(('.las','.laz')):continue
            with z.open(member) as f,laspy.open(f,read_evlrs=False) as reader:
                assert reader.header.parse_crs().to_epsg()==26910
                for i,p in enumerate(reader.chunk_iterator(1000000)):
                    take=(np.asarray(p.classification)==6)&(np.asarray(p.withheld)==0)
                    c=np.floor(np.asarray(p.x)[take]-EAST).astype('int32')
                    r=999-np.floor(np.asarray(p.y)[take]-NORTH).astype('int32')
                    h=np.asarray(p.z)[take].astype('float32')
                    keep=(c>=0)&(c<1000)&(r>=0)&(r<1000)&np.isfinite(h)
                    ids.append(r[keep]*1000+c[keep]);heights.append(h[keep])
                    if i%10==0:print('Read', (i+1)*1000000,'LAS points',flush=True)
    ix=np.concatenate(ids);h=np.concatenate(heights)
    order=np.lexsort((h,ix));ix=ix[order];h=h[order]
    unique,start,count=np.unique(ix,return_index=True,return_counts=True)
    roof=np.full(1000000,np.nan,dtype='float32');counts=np.zeros(1000000,dtype='uint32')
    roof[unique]=h[start+np.floor((count-1)*.9).astype(int)];counts[unique]=count
    roof=roof.reshape(1000,1000);counts=counts.reshape(1000,1000)
    np.savez_compressed(cache,roof=roof,count=counts)
    return roof,counts

def main():
    WORK.mkdir(parents=True,exist_ok=True)
    fps=footprints();roof,counts=roof_grid()
    # Keep legacy buildings crossing the tile boundary intact, excluding their area from the new model.
    tile=box(EAST+1,NORTH+1,EAST+999,NORTH+999)
    boundary=[p.buffer(2) for _,p in fps if p.intersects(tile) and not tile.contains(p)]
    coverage=tile.difference(unary_union(boundary))
    inside=rasterize([(coverage,1)],out_shape=roof.shape,transform=TRANSFORM).astype(bool)
    valid=(counts>=3)&inside
    pad=np.pad(valid,1)
    # Numpy bool sums need integer accumulation.
    support=sum(pad[y:y+1000,x:x+1000].astype('uint8') for y in range(3) for x in range(3))
    valid &= support>=4
    roof=np.where(valid,roof,np.nan)
    padded=np.pad(roof,1,constant_values=np.nan)
    neighbours=np.stack([padded[y:y+1000,x:x+1000] for y in range(3) for x in range(3)])
    # Local rank filter removes narrow facade-return strips without averaging tall and low roofs.
    # It can shift a corner by one cell; this is a 1 m context model, not an architectural survey.
    close=neighbours
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        smooth=np.nanmedian(close,axis=0)
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
    # Connected roof component controls its base, including all of its tower/podium regions.
    components=[shape(g) for g,v in shapes(valid.astype('uint8'),mask=valid,transform=TRANSFORM) if shape(g).area>=9]
    tree=shapely.STRtree(components)
    with rasterio.open(ROOT.parent/'context-data/work/terrain-upgrade-2026-10-22/490000_5459000_ground_1m.tif') as ds:
        ground=ds.read(1).astype('float32');ground[ground==ds.nodata]=np.nan
    old=np.frombuffer((OUT/'footprint_heights.bin').read_bytes(),dtype=[('g','<i2'),('r','<i2'),('m','<i2'),('n','<u2')],offset=8)
    bases=[]
    for comp in components:
        mask=rasterize([(comp.buffer(6).difference(comp.buffer(.5)),1)],out_shape=roof.shape,transform=TRANSFORM).astype(bool)
        vals=ground[mask&np.isfinite(ground)]
        bases.append(float(np.percentile(vals,10)) if len(vals)>=10 else None)
    forms=[];missing_ground=0;residuals=[]
    for i,p in enumerate(regions):
        pt=original[i].representative_point();found=tree.query(pt,predicate='intersects')
        base=bases[int(found[0])] if len(found) else None
        if base is None:
            candidates=[old[k]['g']/10 for k,(_,fp) in enumerate(fps) if old[k]['g']!=-32768 and fp.intersects(original[i])]
            base=float(min(candidates)) if candidates else None
        if base is None:missing_ground+=1;continue
        cells=(labels==i+1)&valid;vals=roof[cells]
        top=float(np.median(vals))
        if top-base<2:continue
        residuals.extend((vals-top).tolist())
        for poly in parts(p):
            if poly.area<16:continue
            forms.append(dict(id=-(len(forms)+1),**polygon(poly),ground=round(base,2),roof=round(top,2),
                max=round(float(np.percentile(vals,99)),2),points=int(counts[cells].sum())))
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
        'coverage_local':[EAST-ORIGIN[0],NORTH-ORIGIN[1],EAST+1000-ORIGIN[0],NORTH+1000-ORIGIN[1]]}
    repairs=[{'index':i,'parts':[polygon(q) for q in parts(shapely.make_valid(p)) if q.area>=1]} for i,(_,p) in enumerate(fps) if not p.is_valid]
    report['repaired_2015_polygons']=len(repairs)
    data={'version':1,'origin':list(ORIGIN),'baseCount':len(fps),'baseSha256':hashlib.sha256((OUT/'footprints_downtown.bin').read_bytes()).hexdigest(),
          'tile':'490000_5459000','repairs':repairs,'replace':replaced,'forms':forms,'stats':report}
    report['bytes']=save_layer('building_forms','City LiDAR 2022: stepped building forms',data,
        {'name':'LiDAR 2022 building class 6','url':'https://opendata.vancouver.ca/explore/dataset/lidar-2022/',
         'request':'https://webtransfer.vancouver.ca/opendata/2022LiDAR/490000_5459000.zip',
         'note':'One processed 1 km tile. Separate roof levels derived from classified returns, not a survey-grade architectural model.'},report)
    (WORK/'building-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
