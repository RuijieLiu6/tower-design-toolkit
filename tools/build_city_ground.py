"""Build 1 m ground tiles from City LiDAR 2022 without extracting/deleting LAS files.

python -I tools/build_city_ground.py TILE.zip public/data WORK_DIR YYYY-MM-DD
Only ASPRS class 2 is ground; the numbered list on the portal is not a class-code table.
The output retains large gaps as nodata. Small gaps use GDAL inverse-distance interpolation
within 3 m. Cell means and interpolation are derived estimates, not a new accuracy claim.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

import laspy
import numpy as np
import rasterio
from rasterio.fill import fillnodata
from rasterio.transform import from_origin

ORIGIN = (491300, 5458600)
NODATA = 65535


def ground_grid(archive, east, north):
    sums = np.zeros(1000000, dtype=np.float64)
    counts = np.zeros(1000000, dtype=np.uint32)
    classes, headers, samples = {}, [], []
    with zipfile.ZipFile(archive) as z:
        members = [m for m in z.infolist() if m.filename.lower().endswith(('.las', '.laz'))]
        if not members:
            raise ValueError('No LAS/LAZ data in archive')
        for member in members:
            # No extraction: archive filenames can never become filesystem paths.
            with z.open(member) as stream, laspy.open(stream, read_evlrs=False) as reader:
                h = reader.header
                crs = h.parse_crs()
                if crs is None or crs.to_epsg() not in (26910, 3157, 2955):
                    raise ValueError(f'Unexpected horizontal CRS: {crs}')
                headers.append({'file': member.filename, 'points': h.point_count, 'crs': crs.to_string(),
                                'bounds': [h.mins.tolist(), h.maxs.tolist()]})
                print(f'Reading {member.filename}: {h.point_count:,} points', flush=True)
                for i, p in enumerate(reader.chunk_iterator(1000000)):
                    cls = np.asarray(p.classification)
                    for c, n in zip(*np.unique(cls, return_counts=True)):
                        classes[str(int(c))] = classes.get(str(int(c)), 0) + int(n)
                    good = (cls == 2) & (np.asarray(p.withheld) == 0)
                    x, y, height = np.asarray(p.x)[good], np.asarray(p.y)[good], np.asarray(p.z)[good]
                    col, row = np.floor(x-east).astype(int), np.floor(y-north).astype(int)
                    valid = (col >= 0) & (col < 1000) & (row >= 0) & (row < 1000) & np.isfinite(height)
                    ix = row[valid]*1000 + col[valid]
                    sums += np.bincount(ix, weights=height[valid], minlength=1000000)
                    counts += np.bincount(ix, minlength=1000000).astype(np.uint32)
                    samples.append(np.column_stack([x[valid][::100], y[valid][::100], height[valid][::100]]))
                    if i % 10 == 0:
                        print(f'  streamed {(i+1)*1000000:,} points', flush=True)
    observed = counts.reshape(1000, 1000) > 0
    grid = np.divide(sums, counts, out=np.zeros_like(sums), where=counts > 0).reshape(1000, 1000).astype('float32')
    # Zero is valid; a separate mask distinguishes absent data, including sea and buildings.
    filled = fillnodata(np.where(observed, grid, np.nan), mask=observed.astype('uint8'), max_search_distance=3, smoothing_iterations=0)
    quality = np.where(observed, 1, np.where(np.isfinite(filled), 2, 0)).astype('uint8')
    return filled, quality, classes, headers, np.concatenate(samples)


def sample(a, x, y, x0, y0, step):
    fc, fr = (x-x0)/step, (y-y0)/step
    c, r = np.floor(fc).astype(int), np.floor(fr).astype(int)
    inside = (c >= 0) & (r >= 0) & (c+1 < a.shape[1]) & (r+1 < a.shape[0])
    c, r = np.clip(c, 0, a.shape[1]-2), np.clip(r, 0, a.shape[0]-2)
    u, v = fc-c, fr-r
    out = a[r,c]*(1-u)*(1-v) + a[r,c+1]*u*(1-v) + a[r+1,c]*(1-u)*v + a[r+1,c+1]*u*v
    return np.where(inside, out, np.nan)


def residuals(e):
    return {'n': int(e.size), 'median_abs_m': round(float(np.median(np.abs(e))), 3),
            'p95_abs_m': round(float(np.percentile(np.abs(e),95)),3), 'rmse_m': round(float(np.sqrt(np.mean(e*e))),3)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('archive', type=Path); p.add_argument('out', type=Path)
    p.add_argument('work', type=Path); p.add_argument('retrieved')
    args = p.parse_args()
    match = re.fullmatch(r'(\d{6})_(\d{7})', args.archive.stem)
    if not match: raise ValueError('Expected City tile name EASTING_NORTHING.zip')
    east, north = map(int, match.groups())
    args.work.mkdir(parents=True, exist_ok=True); args.out.mkdir(parents=True, exist_ok=True)
    grid, quality, classes, headers, pts = ground_grid(args.archive, east, north)
    profile = dict(driver='GTiff', height=1000, width=1000, count=1, crs='EPSG:26910',
                   transform=from_origin(east, north+1000, 1, 1), compress='deflate')
    tif = args.work / f'{args.archive.stem}_ground_1m.tif'
    with rasterio.open(tif, 'w', dtype='float32', nodata=-9999, **profile) as ds:
        ds.write(np.flipud(np.where(np.isfinite(grid),grid,-9999)),1)
        ds.update_tags(SOURCE='City of Vancouver LiDAR 2022', VERTICAL_DATUM='CGVD28GVRD (HTMVBC00)',
                       METHOD='class 2 cell mean, IDW gaps <=3m, larger gaps nodata')
    with rasterio.open(args.work / f'{args.archive.stem}_ground_quality.tif', 'w', dtype='uint8', nodata=0, **profile) as ds:
        ds.write(np.flipud(quality),1)
        ds.update_tags(VALUES='0 nodata; 1 observed ground in cell; 2 IDW interpolation within 3m')
    lo = float(np.floor(np.nanmin(grid)*100)/100)
    quant = np.where(np.isfinite(grid), np.rint((grid-lo)/0.01), NODATA)
    if np.nanmax(quant[np.isfinite(grid)]) >= NODATA: raise ValueError('Height range exceeds uint16')
    data = quant.astype('<u2').tobytes()
    lid = f'terrain_ground_{args.archive.stem}'
    filename = lid+'.bin'; (args.out/filename).write_bytes(data)
    manifest_path = args.out/'layers.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    r1 = next(l for l in manifest['layers'] if l['id']=='terrain_r1'); g = r1['grid']
    q = np.fromfile(args.out/r1['file'],dtype='<u2').reshape(g['rows'],g['cols'])
    old = np.where(q==g['nodata'],np.nan,g['offset_m']+q*g['scale_m'])
    oldz = sample(old,pts[:,0]-ORIGIN[0],pts[:,1]-ORIGIN[1],g['x0'],g['y0'],g['step_m'])
    newz = sample(grid,pts[:,0],pts[:,1],east+0.5,north+0.5,1)
    pair = np.isfinite(oldz)&np.isfinite(newz)
    checks = {'note':'In-sample point-to-grid residuals on a deterministic ground-point subsample; not independent survey validation.',
              'mrdem_30m':residuals(oldz[pair]-pts[pair,2]), 'city_ground_1m':residuals(newz[pair]-pts[pair,2])}
    digest = hashlib.sha256()
    with args.archive.open('rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''): digest.update(b)
    entry = {'id':lid,'title':f'City ground 1 m ({args.archive.stem})','file':filename,
             'format':'uint16 little endian, rows south to north; offset + q * scale; 65535 nodata',
             'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'lazy':True,
             'grid':{'cols':1000,'rows':1000,'step_m':1,'x0':east+0.5-ORIGIN[0],'y0':north+0.5-ORIGIN[1],
                     'offset_m':lo,'scale_m':0.01,'nodata':NODATA},
             'source':{'name':'LiDAR 2022 ground class','publisher':'City of Vancouver',
                       'url':'https://opendata.vancouver.ca/explore/dataset/lidar-2022/',
                       'request':f'https://webtransfer.vancouver.ca/opendata/2022LiDAR/{args.archive.name}',
                       'retrieved':args.retrieved,'acquired':['2022-09-07','2022-09-09'],
                       'zip_sha256':digest.hexdigest(),'headers':headers,
                       'note':'Local City download. Source accuracy 0.081m at 95% confidence; this is not the accuracy of the derived grid. Covers one tile only.'},
             'licence':{'name':'Open Government Licence - Vancouver','url':'https://opendata.vancouver.ca/pages/licence/'},
             'attribution':'Contains information licensed under the Open Government Licence - Vancouver (City of Vancouver LiDAR 2022).',
             'crs':{'horizontal':'EPSG:26910','origin':list(ORIGIN),'note':'LAS header coordinates retained. City metadata identifies NAD83(CSRS) 4.0.0.BC.1.GVRD, UTM 10N.'},
             'datum':{'vertical':'CGVD28GVRD (HTMVBC00), as delivered','note':'No vertical offset applied. Difference from MRDEM HT2_2010v70 realization remains unmeasured.'},
             'processing':{'script':'tools/build_city_ground.py','classes':classes,'ground_class':2,
                           'cell_m':1,'method':'Mean of non-withheld ground returns per 1m cell; IDW fills gaps only within 3m; large gaps stay nodata.',
                           'observed_cells':int((quality==1).sum()),'interpolated_cells':int((quality==2).sum()),
                           'nodata_cells':int((quality==0).sum()),'checks':checks,
                           'display':'A 30m border transition joins the display to regional terrain. Analysis samples unblended values, falling back at missing cells.'},
             'flag':'unverified'}
    manifest['layers']=[l for l in manifest['layers'] if l['id']!=lid]+[entry]
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
    report={'tile':args.archive.stem,'observed_cells':entry['processing']['observed_cells'],
            'interpolated_cells':entry['processing']['interpolated_cells'],'nodata_cells':entry['processing']['nodata_cells'],
            'min_m':float(np.nanmin(grid)),'max_m':float(np.nanmax(grid)),'checks':checks}
    (args.work/'ground-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__=='__main__': main()
