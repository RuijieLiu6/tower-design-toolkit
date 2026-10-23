"""Build street and lane context from native City engineering centre lines and SURFACE_WIDTH.
Widths describe segment surface width, not exact curb geometry; no invented widths for missing values.
Run with --download to refresh the official query; omit it to rebuild the archived data offline.
"""
from pathlib import Path
import sys,json,hashlib,urllib.request,urllib.parse
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_city_forms import ROOT,RAW,WORK,ORIGIN,footprints,save_layer,parts
import shapely
from shapely.geometry import LineString,box
from shapely.ops import unary_union

def download():
    """Archive the official native-coordinate query, with stable OBJECTID pagination."""
    RAW.mkdir(parents=True,exist_ok=True)
    service='https://services3.arcgis.com/qrcTTRTwUoS8N47o/arcgis/rest/services/StreetCentreline/FeatureServer/0'
    def fetch(url):
        with urllib.request.urlopen(url,timeout=60) as r:return json.load(r)
    for name,url in [('street-service.json',service+'?f=json'),('street-item.json','https://www.arcgis.com/sharing/rest/content/items/9fdc0c22433a44598978aa25672a66e9?f=json')]:
        (RAW/name).write_text(json.dumps(fetch(url)),encoding='utf-8')
    features=[]
    params={'f':'json','where':'1=1','geometry':'480000,5455000,495000,5461000','geometryType':'esriGeometryEnvelope','inSR':26910,'spatialRel':'esriSpatialRelIntersects','outSR':26910,'outFields':'OBJECTID,STREET_NAME,HBLOCK,STREET_CLASS,SEGTYPE,SURFACE_WIDTH,DISPOSITION_STATE,DRIVEABLE,UNIT_DESCRIPTION','orderByFields':'OBJECTID','resultRecordCount':2000}
    while True:
        data=fetch(service+'/query?'+urllib.parse.urlencode(dict(params,resultOffset=len(features))))
        if 'error' in data:raise RuntimeError(data['error'])
        features+=data['features']
        if not data.get('exceededTransferLimit'):break
    if len({f['attributes']['OBJECTID'] for f in features})!=len(features):raise RuntimeError('Duplicate records in paginated download')
    (RAW/'street-centrelines-native.json').write_text(json.dumps({'spatialReference':{'wkid':26910},'features':features}),encoding='utf-8')
    (RAW/'street-query.json').write_text(json.dumps({'url':service+'/query','parameters':params,'records':len(features)},indent=2),encoding='utf-8')

def main():
    if '--download' in sys.argv:download()
    fps=footprints();bs=[p.bounds for _,p in fps];bounds=(min(b[0] for b in bs),min(b[1] for b in bs),max(b[2] for b in bs),max(b[3] for b in bs))
    clip=box(*bounds);features=json.loads((RAW/'street-centrelines-native.json').read_text(encoding='utf-8'))['features']
    lines=[];areas={'street':[],'lane':[]};widths=[];unknown=0;excluded=0
    for f in features:
        a=f['attributes'];kind=a['STREET_CLASS']
        if kind not in ('Street','Lane') or a['DISPOSITION_STATE']!='In Service':continue
        name=a.get('STREET_NAME') or a.get('HBLOCK') or 'Unnamed lane'
        width=a.get('SURFACE_WIDTH');valid=isinstance(width,(int,float)) and 1<=width<=60
        # A centre-line at a bridge is not a ground-level surface. Keep the reference line only.
        bridge='BRIDGE' in (name+' '+(a.get('UNIT_DESCRIPTION') or '')).upper()
        for path in f.get('geometry',{}).get('paths',[]):
            if len(path)<2:continue
            full=LineString([p[:2] for p in path]);geom=full.intersection(clip)
            if geom.is_empty:continue
            pieces=[geom] if geom.geom_type=='LineString' else [g for g in getattr(geom,'geoms',[]) if g.geom_type=='LineString']
            for line in pieces:
                if line.length<1:continue
                coords=[[round(x-ORIGIN[0],2),round(y-ORIGIN[1],2)] for x,y in line.segmentize(8).coords]
                row={'id':a['OBJECTID'],'name':name,'kind':kind.lower(),'width':width if valid else None,'bridge':bridge,'points':coords}
                lines.append(row)
                if valid and not bridge:
                    areas[kind.lower()].append(line.buffer(width/2,cap_style='round',join_style='round',quad_segs=4).intersection(clip));widths.append(width)
                else:unknown+=1
    meshes={}
    for kind,polys in areas.items():
        region=unary_union(polys)
        pts=[];indices=[];lookup={}
        for p in parts(region):
            # Extra edge nodes let terrain draping follow the local ground instead of bridging whole blocks.
            for tri in shapely.constrained_delaunay_triangles(p.segmentize(8)).geoms:
                for x,y in list(tri.exterior.coords)[:3]:
                    key=(round(x-ORIGIN[0],2),round(y-ORIGIN[1],2))
                    if key not in lookup:lookup[key]=len(pts)//2;pts.extend(key)
                    indices.append(lookup[key])
        meshes[kind]={'positions':pts,'indices':indices}
    report={'segments':len(lines),'street_segments':sum(l['kind']=='street' for l in lines),
        'lane_segments':sum(l['kind']=='lane' for l in lines),'surface_width_segments':len(widths),
        'centreline_only_segments':unknown,'min_surface_width_m':min(widths),'max_surface_width_m':max(widths),
        'triangles':sum(len(m['indices'])//3 for m in meshes.values()),
        'method':'Native EPSG:26910 centrelines buffered by recorded SURFACE_WIDTH/2, dissolved at intersections, draped on available terrain. Ground surfaces exclude bridge-labelled records.',
        'raw_sha256':hashlib.sha256((RAW/'street-centrelines-native.json').read_bytes()).hexdigest(),
        'limits':'City centre lines approximate the dedicated right-of-way centre, not necessarily the physical road centre. Segment widths do not locate individual curbs, parking bays, medians or sidewalk edges. Missing widths remain centre lines. This is an approximate surface model.'}
    data={'version':1,'origin':list(ORIGIN),'lines':lines,'meshes':meshes,'stats':report}
    report['bytes']=save_layer('city_streets','City street and lane geometry',data,
        {'name':'City engineering StreetCentreline (SURFACE_WIDTH)','url':'https://www.arcgis.com/home/item.html?id=9fdc0c22433a44598978aa25672a66e9',
         'request':'https://services3.arcgis.com/qrcTTRTwUoS8N47o/arcgis/rest/services/StreetCentreline/FeatureServer/0',
         'note':'In-service streets and lanes, native geometry and recorded surface widths; centred surface corridors are derived approximations, not surveyed curbs.'},report,vertical=None,licence={'name':'Creative Commons Attribution (CC BY)', 'url':'https://www.arcgis.com/home/item.html?id=9fdc0c22433a44598978aa25672a66e9'})
    (WORK/'street-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
