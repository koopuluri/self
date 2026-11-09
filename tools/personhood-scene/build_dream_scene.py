"""Personhood v2: an editable, animated graphite field on paper, inside Blender.

The drawing is procedural: no baked images, external textures, or frame handlers.
Run with Blender Python. All manifesto cameras use the shared 4:3 format.
"""
import bpy
import json
import math
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent.parent / '<3/assets'
FORMAT = json.loads((HERE / 'manifesto_format.json').read_text())
TAU = '(frame-1)*0.05235987755982988'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = '01 · Personhood · graphite in motion'
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = FORMAT['width'], FORMAT['height']
scene.render.resolution_percentage = 100
scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
scene.render.fps = FORMAT['fps']
scene.frame_start, scene.frame_end = FORMAT['frame_start'], FORMAT['frame_end']
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.filepath = str(ASSETS / 'personhood-v2.png')
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.world = bpy.data.worlds.new('Paper studio')
scene.world.color = (.8, .8, .8)
scene.sync_mode = 'FRAME_DROP'
scene['Composition ratio'] = '4:3 — shared by all three manifesto compositions'
scene['Technique'] = 'Editable procedural 2.5D graphite drawing; orthographic camera'

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

art = collection('01 · Drawing')
forms = collection('02 · Editable figure forms')
studio = collection('03 · Camera')
controls = collection('00 · Controls')

def empty(name, coll):
    o = bpy.data.objects.new(name, None)
    coll.objects.link(o)
    o.empty_display_type = 'CIRCLE'
    o.empty_display_size = 1
    return o

ctrl = empty('CONTROLS', controls)
ctrl.empty_display_size = .1
for key, val, lo, hi, desc in [
    ('Motion', 1., 0., 2., 'Slow whole-body sway and breathing.'),
    ('Flow', 1., 0., 2., 'Strength of the flowing deformation and pigment movement.'),
    ('Dispersion', 1., 0., 2., 'Softness and scattered graphite around the contours.'),
    ('Grain', 1., 0., 2., 'Visible grain within the pigment and paper.'),
    ('Ink', 1., .2, 1.5, 'Overall graphite density.'),
    ('Atmosphere', 1., 0., 2., 'Drifting pale washes across the entire page.'),
    ('Paper warmth', .55, 0., 1., 'Zero is neutral gray; one is warm notebook paper.'),
    ('Figure size', 1., .7, 1.25, 'Scale of the person within the fixed 4:3 frame.'),
]:
    ctrl[key] = val
    ctrl.id_properties_ui(key).update(min=lo,max=hi,soft_min=lo,soft_max=hi,description=desc)
ctrl['Loop seconds'] = 5.

mat = bpy.data.materials.new('Graphite · living pigment on paper')
mat.use_nodes = True
N, L = mat.node_tree.nodes, mat.node_tree.links
N.clear()
current_frame = None
node_count = 0

def section(name, x, y):
    global current_frame, node_count
    f = N.new('NodeFrame'); f.label = name; f.name = name
    f.location = (x, y)
    current_frame = f; node_count = 0

def node(kind, label=''):
    global node_count
    n = N.new(kind)
    n.label = label
    if current_frame:
        n.parent = current_frame
        n.location = ((node_count % 5)*205, -(node_count // 5)*210)
    node_count += 1
    return n

def put(socket, value):
    if isinstance(value, bpy.types.NodeSocket):
        L.new(value, socket)
    else:
        socket.default_value = value

def math_node(op, *values, label=''):
    n = node('ShaderNodeMath', label); n.operation = op
    for i, v in enumerate(values): put(n.inputs[i], v)
    return n.outputs[0]

def vec(op, *values, label=''):
    n = node('ShaderNodeVectorMath', label); n.operation = op
    for i, v in enumerate(values): put(n.inputs[i], v)
    return n.outputs['Value' if op in ('LENGTH','DISTANCE','DOT_PRODUCT') else 'Vector']

def combine(x, y, z=0):
    n = node('ShaderNodeCombineXYZ')
    for i,v in enumerate((x,y,z)): put(n.inputs[i],v)
    return n.outputs[0]

def split(p):
    n = node('ShaderNodeSeparateXYZ'); put(n.inputs[0],p)
    return n.outputs

def drive(target, prop, expression, index=None, variables=None):
    f = target.driver_add(prop) if index is None else target.driver_add(prop,index)
    d = f.driver; d.type = 'SCRIPTED'
    for name, (ob, path) in (variables or {}).items():
        v = d.variables.new(); v.name = name; v.type='SINGLE_PROP'
        v.targets[0].id = ob; v.targets[0].data_path = path
    d.expression = expression

def value(label, expression=None, keys=None):
    n = node('ShaderNodeValue',label); n.name = label
    if expression:
        drive(n.outputs[0], 'default_value', expression,
              variables={k:(ctrl, '["'+v+'"]') for k,v in (keys or {}).items()})
    return n.outputs[0]

def control(key): return value(key, 'v', {'v':key})

def noise(p, scale, detail=2, label=''):
    n = node('ShaderNodeTexNoise',label)
    put(n.inputs['Vector'],p)
    n.inputs['Scale'].default_value=scale
    n.inputs['Detail'].default_value=detail
    n.inputs['Roughness'].default_value=.65
    return n.outputs

def remap(v, lo, hi, a=0, b=1, clamp=True):
    n=node('ShaderNodeMapRange'); n.clamp=clamp; n.interpolation_type='SMOOTHERSTEP'
    for key,val in [('Value',v),('From Min',lo),('From Max',hi),('To Min',a),('To Max',b)]:
        put(n.inputs[key],val)
    return n.outputs[0]

section('01 / A five-second circle in time', -3500, 1500)
t = value('Loop phase',TAU)
sn = math_node('SINE',t); cs=math_node('COSINE',t)
flow = control('Flow'); motion = control('Motion'); size = control('Figure size')
drift = combine(math_node('MULTIPLY',sn,flow), math_node('MULTIPLY',cs,flow), .731)
geom = node('ShaderNodeNewGeometry')
P = vec('DIVIDE',geom.outputs['Position'],combine(size,size,1))
x,y,z=split(P)
air_coords=vec('ADD',P,drift)
flow_noise=noise(air_coords,2.4,2.5,'Slow, continuous pigment currents')
warp=vec('SUBTRACT',flow_noise['Color'],(.5,.5,.5))
warp=vec('MULTIPLY',warp,combine(math_node('MULTIPLY',flow,.20),math_node('MULTIPLY',flow,.12),0))
P=vec('ADD',P,warp)
wave=math_node('SINE',math_node('ADD',math_node('MULTIPLY',y,2.6),t))
wave=math_node('MULTIPLY',wave,math_node('MULTIPLY',flow,.035))
sway=math_node('MULTIPLY',math_node('MULTIPLY',sn,motion),.042)
P=vec('SUBTRACT',P,combine(math_node('ADD',wave,sway),0,0))

section('02 / Move or scale the named form guides to redraw the person', -2000, 1500)

def ellipse(name, center, radii, phase=0, amplitude=0):
    o=empty(name,forms); o.location=(center[0],center[1],0); o.scale=(radii[0],radii[1],1)
    # The native object transforms remain editable; shader nodes read them directly.
    cn=node('ShaderNodeCombineXYZ',name+' / center')
    rn=node('ShaderNodeCombineXYZ',name+' / radii')
    for i in range(2):
        drive(cn.inputs[i],'default_value','v',variables={'v':(o,f'location[{i}]')})
        drive(rn.inputs[i],'default_value','v',variables={'v':(o,f'scale[{i}]')})
    rn.inputs[2].default_value=1
    cp=cn.outputs[0]
    if amplitude:
        a=value(name+' / breath',f'{amplitude}*m*sin({TAU}+{phase})',{'m':'Motion'})
        cp=vec('ADD',cp,combine(a,math_node('MULTIPLY',a,.25),0))
    q=vec('DIVIDE',vec('SUBTRACT',P,cp),rn.outputs[0])
    return math_node('MULTIPLY',math_node('SUBTRACT',vec('LENGTH',q),1),min(radii))

parts=[
    ('Head',(-.008,1.13),(.185,.245),.4,.022),
    ('Neck',(0,.855),(.074,.17),.4,.015),
    ('Chest',(0,.57),(.245,.255),0,.012),
    ('Rib cage',(.012,.365),(.199,.25),0,.009),
    ('Waist',(.020,.17),(.166,.20),.1,.008),
    ('Pelvis',(.013,-.025),(.22,.205),.2,.006),
    ('Left shoulder',(-.25,.60),(.13,.135),.4,.016),
    ('Right shoulder',(.25,.57),(.128,.14),.7,.018),
    ('Left upper arm',(-.337,.36),(.088,.235),.7,.024),
    ('Right upper arm',(.337,.34),(.087,.238),1.2,.025),
    ('Left forearm',(-.396,.015),(.060,.228),1.1,.032),
    ('Right forearm',(.407,.005),(.064,.233),1.5,.032),
    ('Left hand',(-.412,-.205),(.055,.107),1.3,.038),
    ('Right hand',(.419,-.224),(.056,.109),1.7,.038),
    ('Left thigh',(-.127,-.34),(.116,.32),.3,.006),
    ('Right thigh',(.14,-.34),(.115,.32),.6,.008),
    ('Left lower leg',(-.155,-.81),(.077,.32),0,.003),
    ('Right lower leg',(.18,-.80),(.079,.32),.2,.003),
    ('Left foot',(-.173,-1.12),(.106,.075),0,0),
    ('Right foot',(.193,-1.11),(.108,.075),0,0),
]
d=None
for spec in parts:
    e=ellipse(*spec)
    d=e if d is None else math_node('SMOOTH_MIN',d,e,.068)

section('03 / Lost edges, soft graphite, suspended dust', -2000, -2300)
dispersion=control('Dispersion')
rough=noise(air_coords,22,2,'Broken contour')
roughness=math_node('MULTIPLY',math_node('SUBTRACT',rough['Fac'],.5),.075)
d=math_node('ADD',d,math_node('MULTIPLY',roughness,dispersion))
softness=math_node('ADD',.04,math_node('MULTIPLY',dispersion,.060))
body=remap(d,-.055,softness,1,0)
outer=remap(d,-.04,math_node('ADD',.15,math_node('MULTIPLY',dispersion,.17)),1,0)
rim=remap(d,-.18,-.015,.48,1)
body=math_node('MULTIPLY',body,rim)
mottle=noise(air_coords,5.3,3,'Uneven graphite coverage')['Fac']
body=math_node('MULTIPLY',body,remap(mottle,.15,.8,.45,1))
halo=math_node('MULTIPLY',outer,remap(mottle,.2,.8,.01,.12))
pigment=math_node('ADD',math_node('MULTIPLY',body,.83),halo)

section('04 / Paper tooth and moving grain at several scales', 0, 1500)
grain=control('Grain')
grain_offset=combine(math_node('MULTIPLY',sn,.057),math_node('MULTIPLY',cs,.057),.16)
grain_coords=vec('ADD',geom.outputs['Position'],grain_offset)
fine=noise(grain_coords,220,1,'Graphite grains')['Fac']
grain_variation=math_node('MULTIPLY',math_node('SUBTRACT',fine,.5),math_node('MULTIPLY',grain,2.0))
pigment=math_node('MULTIPLY',pigment,math_node('ADD',.85,grain_variation))
# Very pale currents fill the whole page. No aura or additional subject in scene one.
atmos=control('Atmosphere')
cloud=noise(vec('MULTIPLY',air_coords,(.8,1.8,1)),1.5,3,'Drifting page washes')['Fac']
wash=math_node('MULTIPLY',remap(cloud,.28,.74,.005,.055),atmos)
pigment=math_node('ADD',pigment,wash)
pigment=math_node('MULTIPLY',pigment,control('Ink'))
paper_noise=noise(geom.outputs['Position'],380,1,'Fine paper fibers')['Fac']
paper_tooth=math_node('MULTIPLY',math_node('SUBTRACT',paper_noise,.5),math_node('MULTIPLY',grain,.08))
pigment=math_node('ADD',pigment,paper_tooth)

section('05 / Quiet warm paper and gray graphite', 1500, 1500)
warmth=control('Paper warmth')
base=math_node('SUBTRACT',.94,math_node('MULTIPLY',pigment,.64))
r=base
g=math_node('SUBTRACT',base,math_node('MULTIPLY',warmth,.012))
b=math_node('SUBTRACT',base,math_node('MULTIPLY',warmth,.045))
# Work in perceptual values, then invert the Standard sRGB display transfer.
rgb=combine(*[math_node('POWER',math_node('MAXIMUM',math_node('DIVIDE',math_node('ADD',v,.055),1.055),0),2.4) for v in (r,g,b)])
em=node('ShaderNodeEmission'); put(em.inputs['Color'],rgb)
out=node('ShaderNodeOutputMaterial'); L.new(em.outputs[0],out.inputs['Surface'])

me=bpy.data.meshes.new('Drawing surface')
me.from_pydata([(-3.2,-2.4,0),(3.2,-2.4,0),(3.2,2.4,0),(-3.2,2.4,0)],[],[(0,1,2,3)])
me.update()
sheet=bpy.data.objects.new('Personhood · procedural drawing',me); art.objects.link(sheet)
me.materials.append(mat)
camera_data=bpy.data.cameras.new('All manifesto compositions · 4:3')
camera=bpy.data.objects.new('Camera · fixed 4:3',camera_data); studio.objects.link(camera)
camera.location=(0,.055,10); camera_data.type='ORTHO'; camera_data.ortho_scale=5.15
camera_data.passepartout_alpha=1
scene.camera=camera
scene.frame_set(1)
bpy.context.view_layer.objects.active=ctrl
ctrl.select_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            s=area.spaces.active
            s.region_3d.view_perspective='CAMERA'
            s.region_3d.view_camera_zoom=15
            s.overlay.show_overlays=False
            s.shading.type='RENDERED'
            s.show_region_ui=True
text=bpy.data.texts.new('START HERE · Personhood v2')
text.write('''π: Personhood v2 — graphite in motion\n\nA 5-second, 4:3 drawing study responding to “my visual taste.”\n\nSpace: play/pause. N: controls.\nLaunch with controls.py for the Personhood sidebar.\n\nThe drawing uses native Blender shader nodes, not a baked image.\nMove/scale named empty guides in “Editable figure forms” to change the anatomy.\nMotion, Flow, Dispersion, Grain, Ink, Atmosphere, Paper warmth and Figure size\nare editable properties on CONTROLS. Frame 121 exactly repeats frame 1;\nexport frames 1–120 at 24 fps. The camera is fixed at 4:3.\n\nThis is an intentionally flat, camera-facing artwork, not a turntable-ready 3D character.\nSave a separate copy to preserve personal changes between generated revisions.\n''')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS/'personhood-v2.blend'),compress=True)
if os.environ.get('PERSONHOOD_RENDER_STILL')=='1':
    bpy.ops.render.render(write_still=True)
print('PERSONHOOD_V2_READY',flush=True)
