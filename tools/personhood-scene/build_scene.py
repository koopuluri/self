"""Build the first editable Personhood motion study. Run with Blender Python."""
import bpy
import math
import os
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent.parent / '<3/assets'
OUT = ASSETS / 'personhood-v1.blend'
TAU = '(frame-1)*0.05235987755982988'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = '01 · Personhood'
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1280
scene.render.resolution_y = 960
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 120
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.render.filepath = str(ASSETS / 'personhood-v1.png')
scene.world = bpy.data.worlds.new('Soft gray ambient')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.25, .25, .25, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
scene.sync_mode = 'FRAME_DROP'

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

people = collection('01 · Figure')
air = collection('02 · Atmosphere')
studio = collection('03 · Camera and light')
control_collection = collection('00 · Controls')

def relink(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj

def empty(name, coll, location=(0,0,0)):
    o = bpy.data.objects.new(name, None)
    coll.objects.link(o)
    o.location = location
    o.empty_display_size = .13
    o.hide_render = True
    return o

ctrl = empty('CONTROLS', control_collection)
controls = {
    'Motion': (.65, 0, 2, 'Overall breathing and balance. Zero holds the figure still.'),
    'Wind': (.65, 0, 2, 'Gentle movement in fabric and hair.'),
    'Atmosphere': (.65, 0, 2, 'Slow background tonal drift.'),
    'Grain': (.35, 0, 1, 'Fine moving paper texture across the scene.'),
    'Contrast': (.7, 0, 1.5, 'Separation between the four cel shading tones.'),
    'Edge ink': (.35, 0, 1, 'Subtle darker grazing edges on the figure.'),
    'Eye presence': (.75, 0, 1, 'Minimal eye marks establish the direct gaze.'),
    'Figure size': (1., .7, 1.2, 'Size of the figure in the fixed camera composition.'),
}
for name, (value, lo, hi, desc) in controls.items():
    ctrl[name] = value
    ctrl.id_properties_ui(name).update(min=lo, max=hi, soft_min=lo, soft_max=hi, description=desc)
ctrl['Loop seconds'] = 5.0
ctrl.id_properties_ui('Loop seconds').update(description='Fixed for this study: 120 frames at 24 fps.')

def driver(target, path, expr, index=None, variables=None):
    fc = target.driver_add(path) if index is None else target.driver_add(path,index)
    d = fc.driver
    d.type = 'SCRIPTED'
    for short, key in (variables or {}).items():
        v = d.variables.new()
        v.name = short
        v.type = 'SINGLE_PROP'
        v.targets[0].id = ctrl
        v.targets[0].data_path = '["' + key + '"]'
    d.expression = expr
    return d

def linear(v):
    return ((v+.055)/1.055)**2.4 if v>.04045 else v/12.92

def gray(v):
    return (linear(v),)*3+(1,)

def material(name, value):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = gray(value)
    n, l = m.node_tree.nodes, m.node_tree.links
    n.clear()
    out = n.new('ShaderNodeOutputMaterial'); out.location=(880,0)
    diffuse = n.new('ShaderNodeBsdfDiffuse'); diffuse.location=(-750,180)
    diffuse.inputs['Color'].default_value=(.8,.8,.8,1)
    diffuse.inputs['Roughness'].default_value=1
    rgb=n.new('ShaderNodeShaderToRGB'); rgb.location=(-560,180)
    l.new(diffuse.outputs[0],rgb.inputs[0])
    ramp=n.new('ShaderNodeValToRGB'); ramp.location=(-340,180)
    ramp.color_ramp.interpolation='CONSTANT'
    r=ramp.color_ramp
    r.elements.remove(r.elements[1])
    levels=[(0.,-.13),(.28,-.055),(.55,.015),(.82,.07)]
    for i,(pos,delta) in enumerate(levels):
        e=r.elements[0] if i==0 else r.elements.new(pos)
        e.position=pos
        e.color=gray(max(.01,min(.95,value+delta*.7)))
        for channel in range(3):
            base, adjusted = linear(value), linear(max(.01,min(.97,value+delta)))
            driver(e,'color',f'{base}+({adjusted-base})*c',channel,{'c':'Contrast'})
    l.new(rgb.outputs['Color'],ramp.inputs[0])
    fresnel=n.new('ShaderNodeFresnel'); fresnel.location=(-350,-70)
    fresnel.inputs['IOR'].default_value=1.28
    edge=n.new('ShaderNodeMath'); edge.operation='MULTIPLY'; edge.location=(-140,-60)
    l.new(fresnel.outputs[0],edge.inputs[0])
    driver(edge.inputs[1],'default_value','ink*.75',variables={'ink':'Edge ink'})
    mix=n.new('ShaderNodeMixRGB'); mix.blend_type='MIX'; mix.location=(65,170)
    mix.inputs[2].default_value=gray(value*.55)
    l.new(edge.outputs[0],mix.inputs[0]); l.new(ramp.outputs[0],mix.inputs[1])
    coord=n.new('ShaderNodeTexCoord'); coord.location=(-750,-330)
    mapping=n.new('ShaderNodeVectorMath'); mapping.operation='ADD'; mapping.location=(-550,-330)
    l.new(coord.outputs['Generated'],mapping.inputs[0])
    driver(mapping.inputs[1],'default_value',f'.10*sin({TAU})',0)
    driver(mapping.inputs[1],'default_value',f'.10*cos({TAU})',1)
    noise=n.new('ShaderNodeTexNoise'); noise.location=(-330,-300)
    noise.inputs['Scale'].default_value=145
    noise.inputs['Detail'].default_value=1
    l.new(mapping.outputs[0],noise.inputs['Vector'])
    grain=n.new('ShaderNodeMixRGB'); grain.blend_type='MULTIPLY'; grain.location=(300,130)
    driver(grain.inputs[0],'default_value','g*.075',variables={'g':'Grain'})
    l.new(mix.outputs[0],grain.inputs[1]); l.new(noise.outputs['Fac'],grain.inputs[2])
    emission=n.new('ShaderNodeEmission'); emission.location=(600,100)
    l.new(grain.outputs[0],emission.inputs[0]); l.new(emission.outputs[0],out.inputs[0])
    return m

coat=material('01 · graphite / four gray tones',.43)
cloth=material('02 · soft ash sleeves',.55)
skin=material('03 · porcelain gray / face and hands',.75)
hair=material('04 · charcoal / broad hair shapes',.33)
pants=material('05 · slate trousers',.38)
shoes=material('06 · charcoal shoes',.30)
scarf=material('07 · pale folded collar',.64)
eye_mat=material('08 · quiet eye marks',.28)
seam_mat=material('09 · drawn garment seams',.37)

root=empty('Person · balance and breath',people)
driver(root,'rotation_euler',f'm*.008*sin({TAU})',1,{'m':'Motion'})
driver(root,'scale',f's*(1+m*.003*sin({TAU}+.35))',2,{'m':'Motion','s':'Figure size'})
for i in (0,1): driver(root,'scale','s',i,{'s':'Figure size'})
head_pivot=empty('Head · slight living motion',people,(0,0,3.15))
bpy.context.view_layer.update()
head_pivot.parent=root
driver(head_pivot,'rotation_euler',f'm*.008*sin({TAU}+.7)',2,{'m':'Motion'})
driver(head_pivot,'rotation_euler',f'm*.004*sin({TAU}-.4)',0,{'m':'Motion'})
bpy.context.view_layer.update()

def parent_keep(o,parent):
    bpy.context.view_layer.update()
    o.parent=parent
    o.matrix_parent_inverse=parent.matrix_world.inverted()

def mesh(name, verts, faces, mat, parent=root, sub=2):
    me=bpy.data.meshes.new(name)
    me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); people.objects.link(o)
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth=True
    if sub:
        mod=o.modifiers.new('Soft authored contour','SUBSURF'); mod.levels=sub; mod.render_levels=sub
    if parent: parent_keep(o,parent)
    return o

def loft(name, rings, mat, segments=32, parent=root, sub=2, folds=0):
    # Rings are center-x, center-y, height, x-radius, depth-radius.
    verts=[]
    for j,(x,y,z,rx,ry) in enumerate(rings):
        for k in range(segments):
            a=2*math.pi*k/segments
            f=1+folds*math.sin(5*a+.8)*math.sin(math.pi*j/max(1,len(rings)-1))
            verts.append((x+rx*math.cos(a)*f,y+ry*math.sin(a)*f,z))
    faces=[]
    for j in range(len(rings)-1):
        for k in range(segments):
            a=j*segments+k; b=j*segments+(k+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(rings)-1)*segments+k for k in range(segments)))
    return mesh(name,verts,faces,mat,parent,sub)

def ellipsoid(name,location,scale,mat,parent=root):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=location)
    o=bpy.context.object; o.name=name; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    relink(o,people)
    if parent: parent_keep(o,parent)
    return o

def wind_shape(o,amp=.04,pivot=.9,phase=0):
    o.shape_key_add(name='Rest')
    key=o.shape_key_add(name='Breeze')
    zs=[v.co.z for v in o.data.vertices]
    span=max(max(zs)-min(zs),.1)
    for v in key.data:
        weight=min(1,abs(v.co.z-pivot)/span)**1.5
        v.co.x+=amp*weight
        v.co.y+=amp*.35*weight*math.sin(v.co.z*3)
    driver(key,'value',f'w*(.5+.5*sin({TAU}+{phase}))',variables={'w':'Wind'})

def curve(name,pts,mat,thickness=.005,parent=root,coll=people):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.resolution_u=20
    cu.bevel_depth=thickness; cu.bevel_resolution=3
    s=cu.splines.new('BEZIER'); s.bezier_points.add(len(pts)-1)
    for b,p in zip(s.bezier_points,pts):
        b.co=p; b.handle_left_type='AUTO'; b.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cu); coll.objects.link(o); cu.materials.append(mat)
    if parent:parent_keep(o,parent)
    return o

# A deliberately simple, slightly asymmetrical garment silhouette.
tunic=loft('Tunic · broad folded silhouette',[
    (0,0,.91,.43,.21),(0,0,.94,.46,.23),(-.025,.01,1.13,.45,.24),
    (-.015,.02,1.52,.34,.215),(0,.015,1.96,.33,.22),(0,0,2.30,.43,.22),
    (0,0,2.43,.39,.20),(0,0,2.49,.20,.15),(0,0,2.50,.17,.13)],coat,folds=.045)
wind_shape(tunic,.035,2.48,.3)
for side in (-1,1):
    sleeve=loft(('Left' if side<0 else 'Right')+' sleeve',[
        (side*.53,-.01,1.46,.14,.14),(side*.53,-.01,1.49,.155,.15),
        (side*.55,0,1.70,.15,.16),(side*.52,.015,2.05,.16,.18),
        (side*.40,.01,2.34,.19,.19),(side*.31,0,2.40,.14,.13)],cloth)
    wind_shape(sleeve,.018,2.4,.4+side*.3)
    hand=loft(('Left' if side<0 else 'Right')+' hand · simplified',[
        (side*.53,-.02,1.27,.045,.05),(side*.54,-.035,1.30,.072,.067),
        (side*.55,-.02,1.42,.075,.07),(side*.53,-.01,1.52,.065,.06)],skin)
    leg=loft(('Left' if side<0 else 'Right')+' trouser leg',[
        (side*.20,.015,.19,.10,.115),(side*.20,.015,.23,.12,.13),
        (side*.18,.015,.49,.125,.14),(side*.19,0,.78,.15,.155),
        (side*.20,0,1.13,.17,.16)],pants)
    shoe=ellipsoid(('Left' if side<0 else 'Right')+' shoe',(side*.20,-.085,.13),(.135,.245,.125),shoes)

neck=loft('Neck · no anatomical detail',[(0,0,2.4,.13,.12),(0,0,2.72,.13,.12)],skin)
face=loft('Face · abstract front-facing form',[
    (0,-.015,2.69,.075,.10),(0,-.005,2.72,.16,.15),(0,0,2.83,.25,.21),
    (0,0,3.02,.315,.25),(0,0,3.23,.33,.255),(0,0,3.43,.29,.225),
    (0,0,3.55,.17,.14),(0,0,3.58,.04,.04)],skin,parent=head_pivot)
for side in (-1,1):
    ellipsoid('Ear '+str(side),(side*.316,-.005,3.045),(.052,.07,.10),skin,head_pivot)
    eye=ellipsoid('Eye mark '+str(side),(side*.117,-.252,3.135),(.018,.011,.027),eye_mat,head_pivot)
    for axis in range(3):driver(eye,'scale','e',axis,{'e':'Eye presence'})

# Hair cap uses an uneven hem rather than a sphere or helmet.
verts=[]; faces=[]; seg=48; rows=14
for j in range(rows):
    t=(j+.03)/(rows-1+.03)
    for k in range(seg):
        a=2*math.pi*k/seg
        rr=math.sin(t*math.pi/2)
        lower=3.15-.22*math.sin(a)+.035*math.sin(3*a)
        z=3.68+(lower-3.68)*(1-math.cos(t*math.pi/2))
        verts.append((.365*rr*math.cos(a)+.015*rr,.29*rr*math.sin(a)+.035,z))
for j in range(rows-1):
    for k in range(seg):
        a=j*seg+k; b=j*seg+(k+1)%seg
        faces.append((a,b,b+seg,a+seg))
faces.append(tuple(reversed(range(seg))))
cap=mesh('Hair · swept charcoal cap',verts,faces,hair,head_pivot,2)
wind_shape(cap,.02,3.65,.8)

def ribbon(name,points,width,mat,parent=head_pivot,amp=.035):
    p=[Vector(v) for v in points]; vs=[]; fs=[]; count=24
    for j in range(count):
        t=j/(count-1)
        center=(1-t)**3*p[0]+3*(1-t)**2*t*p[1]+3*(1-t)*t*t*p[2]+t**3*p[3]
        tangent=3*(1-t)**2*(p[1]-p[0])+6*(1-t)*t*(p[2]-p[1])+3*t*t*(p[3]-p[2])
        right=Vector((tangent.z,0,-tangent.x)).normalized()
        w=width*(math.sin(math.pi*t)**.55+.035)
        for k in range(5):
            u=(k-2)/2
            v=center+right*w*u
            v.y-=.035*(1-u*u)*math.sin(math.pi*t)
            vs.append(v)
    for j in range(count-1):
        for k in range(4):
            a=j*5+k; fs.append((a,a+1,a+6,a+5))
    o=mesh(name,vs,fs,mat,parent,2)
    solid=o.modifiers.new('Thin fabric or hair volume','SOLIDIFY'); solid.thickness=.012
    wind_shape(o,amp,points[0][2],.9)
    return o

ribbon('Hair · broad swept fringe',[(-.29,-.19,3.43),(-.12,-.32,3.62),(.17,-.32,3.45),(.32,-.27,3.28)],.105,hair)
ribbon('Hair · soft left fringe',[(-.25,-.19,3.47),(-.35,-.23,3.40),(-.30,-.27,3.32),(-.19,-.27,3.25)],.07,hair,amp=.022)
# Folded collar and one quiet trailing cloth edge, with no insignia.
ribbon('Collar · left fold',[(-.15,-.13,2.58),(-.28,-.23,2.51),(-.15,-.28,2.39),(.06,-.26,2.35)],.072,scarf,root,.008)
ribbon('Collar · right fold',[(.15,-.13,2.58),(.23,-.22,2.49),(.13,-.29,2.41),(-.07,-.27,2.33)],.06,scarf,root,.008)
ribbon('Cloth · small trailing edge',[(-.15,.11,2.44),(-.50,.19,2.38),(-.66,.15,2.12),(-.86,.11,2.16)],.065,scarf,root,.055)
curve('Garment seam',[(.06,-.225,2.28),(.035,-.238,1.9),(-.015,-.238,1.5),(-.045,-.24,1.03)],seam_mat,.0035)
curve('Hem ink',[(-.36,-.10,.955),(-.21,-.21,.936),(0,-.237,.932),(.24,-.20,.942),(.40,-.10,.967)],seam_mat,.004)

# Infinite paper field. Both the large tonal drift and fine texture are cyclic.
bpy.ops.mesh.primitive_plane_add(size=2,location=(0,2,1.8),rotation=(math.pi/2,0,0))
bg=bpy.context.object; bg.name='Paper atmosphere · slowly changing'; bg.scale=(10,7,1); relink(bg,air)
m=bpy.data.materials.new('Paper / drifting tonal wash / fine grain'); m.use_nodes=True
n,l=m.node_tree.nodes,m.node_tree.links; n.clear()
out=n.new('ShaderNodeOutputMaterial'); em=n.new('ShaderNodeEmission'); l.new(em.outputs[0],out.inputs[0])
tc=n.new('ShaderNodeTexCoord')
mapping=n.new('ShaderNodeVectorMath'); mapping.operation='ADD'; l.new(tc.outputs['UV'],mapping.inputs[0])
driver(mapping.inputs[1],'default_value',f'a*.018*sin({TAU})',0,{'a':'Atmosphere'})
driver(mapping.inputs[1],'default_value',f'a*.018*cos({TAU})',1,{'a':'Atmosphere'})
noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=7; noise.inputs['Detail'].default_value=1.3
l.new(mapping.outputs[0],noise.inputs[0])
ramp=n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=gray(.79); ramp.color_ramp.elements[1].color=gray(.845)
l.new(noise.outputs['Fac'],ramp.inputs[0])
gm=n.new('ShaderNodeVectorMath'); gm.operation='ADD'; l.new(tc.outputs['UV'],gm.inputs[0])
driver(gm.inputs[1],'default_value',f'.05*sin({TAU})',0)
driver(gm.inputs[1],'default_value',f'.05*cos({TAU})',1)
fine=n.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value=1900; fine.inputs['Detail'].default_value=0
l.new(gm.outputs[0],fine.inputs[0])
mix=n.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'
driver(mix.inputs[0],'default_value','g*.12',variables={'g':'Grain'})
l.new(ramp.outputs[0],mix.inputs[1]); l.new(fine.outputs['Fac'],mix.inputs[2]); l.new(mix.outputs[0],em.inputs[0])
bg.data.materials.append(m)

# Soft elliptical contact mark, blending into the paper without a horizon line.
bpy.ops.mesh.primitive_plane_add(size=2,location=(0,.30,.075),rotation=(math.pi/2,0,0))
shadow=bpy.context.object; shadow.name='Soft contact shadow'; shadow.scale=(.66,.115,1); relink(shadow,air)
sm=bpy.data.materials.new('Contact / soft graphite wash'); sm.use_nodes=True
sn,sl=sm.node_tree.nodes,sm.node_tree.links; sn.clear()
so=sn.new('ShaderNodeOutputMaterial'); se=sn.new('ShaderNodeEmission'); se.inputs[0].default_value=gray(.46)
st=sn.new('ShaderNodeBsdfTransparent'); mixs=sn.new('ShaderNodeMixShader')
uv=sn.new('ShaderNodeTexCoord'); sub=sn.new('ShaderNodeVectorMath'); sub.operation='DISTANCE'; sub.inputs[1].default_value=(.5,.5,0)
sl.new(uv.outputs['UV'],sub.inputs[0])
ra=sn.new('ShaderNodeValToRGB'); ra.color_ramp.elements[0].position=.05; ra.color_ramp.elements[0].color=(.24,.24,.24,1); ra.color_ramp.elements[1].position=.5; ra.color_ramp.elements[1].color=(0,0,0,1)
sl.new(sub.outputs['Value'],ra.inputs[0]); sl.new(ra.outputs[0],mixs.inputs[0]); sl.new(st.outputs[0],mixs.inputs[1]); sl.new(se.outputs[0],mixs.inputs[2]); sl.new(mixs.outputs[0],so.inputs[0])
shadow.data.materials.append(sm)
driver(shadow,'scale',f'.66*(1+.018*sin({TAU}+.35))',0)

def area(name,loc,power,size,target):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    o=bpy.data.objects.new(name,data); studio.objects.link(o); o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o
key=area('Large soft key',(-3,-4,6),650,5,(0,0,2))
fill=area('Quiet fill',(4,-2,3),180,4,(0,0,2))
driver(key,'location',f'-3+.08*sin({TAU}+.5)',0)
bpy.ops.object.camera_add(location=(0,-10,3.0))
cam=bpy.context.object; cam.name='CAMERA · calm frontal view'; relink(cam,studio)
cam.rotation_euler=(Vector((0,0,1.85))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'; cam.data.ortho_scale=6.8; cam.data.lens=55
cam.data.passepartout_alpha=1; scene.camera=cam
scene['About']='π: First personhood motion study. Five seconds, 24 fps. Geometry, materials, camera and all motion are editable.'
scene['Playback']='Press Space or the timeline play button. Personhood sidebar contains the artistic controls.'
scene['Loop']='Frames 1–120. Frame 121 equals frame 1; do not include frame 121 in the export.'

readme=bpy.data.texts.new('START HERE · Personhood')
readme.write('PERSONHOOD / first motion study\n\nPlay: Space, or the timeline play button.\nFive seconds at 24 fps, frames 1–120.\n\nUse the Personhood sidebar to adjust the motion and finish.\nThe same controls are custom properties on the CONTROLS object.\n\nThe camera is fixed. Objects, materials and motion are editable.\nMotion uses cyclic expressions, not a simulation.\n\nπ: A quiet grayscale figure looking toward the viewer; minimal eye marks, broad gray shapes, slight breath and breeze.\n')
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
ctrl.select_set(True); bpy.context.view_layer.objects.active=ctrl
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            sp=ar.spaces.active; sp.region_3d.view_perspective='CAMERA'
            sp.region_3d.view_camera_zoom=0
            sp.overlay.show_overlays=False
            sp.shading.type='RENDERED'
            sp.show_region_ui=True
        elif ar.type=='PROPERTIES':
            ar.spaces.active.context='OBJECT'
bpy.context.preferences.filepaths.save_version=0
ASSETS.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT),compress=True)
print('PERSONHOOD_SAVED',str(OUT))
if os.environ.get('PERSONHOOD_RENDER_STILL')=='1':
    bpy.ops.render.render(write_still=True)
    print('PERSONHOOD_RENDERED',scene.render.filepath)
