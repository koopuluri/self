"""Personhood v3: continuous human form and locally evolving graphite on paper.

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
scene.name = '01 · Personhood · a continuous presence'
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = FORMAT['width'], FORMAT['height']
scene.render.resolution_percentage = 100
scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
scene.render.fps = FORMAT['fps']
scene.frame_start, scene.frame_end = FORMAT['frame_start'], FORMAT['frame_end']
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.filepath = str(ASSETS / 'personhood-v3.png')
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.world = bpy.data.worlds.new('Paper studio')
scene.world.color = (.8, .8, .8)
scene.sync_mode = 'FRAME_DROP'
scene['Composition ratio'] = '4:3 — shared by all three manifesto compositions'
scene['Technique'] = 'Editable procedural 2.5D graphite drawing; orthographic camera'
scene['Revision'] = 3
scene['Paper reference'] = 'Outer border of Screenshot 2026-11-02 at 2.14.23 PM.png; median RGB 244,237,213'
scene['Motion approach'] = 'Fixed spatial coordinates; noise evolves in two hidden dimensions. No translated cloud wash.'

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
    ('Flow', 1., 0., 2., 'Local evolution of graphite. Zero freezes pigment evolution.'),
    ('Dispersion', 1., 0., 2., 'Softness and scattered graphite around the contours.'),
    ('Grain', 1., 0., 2., 'Visible grain within the pigment and paper.'),
    ('Ink', 1., .2, 1.5, 'Overall graphite density.'),
    ('Paper motion', .45, 0., 1., 'Tiny changes in the paper tooth, without a cloud overlay.'),
    ('Paper warmth', 1., 0., 1.3, 'One matches the sampled outer paper border; zero is neutral gray.'),
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

section('01 / Local evolution with fixed spatial coordinates', -3500, 1500)
t = value('Loop phase',TAU)
sn = math_node('SINE',t); cs=math_node('COSINE',t)
flow = control('Flow'); motion = control('Motion'); size = control('Figure size')
geom = node('ShaderNodeNewGeometry')
P = vec('DIVIDE',geom.outputs['Position'],combine(size,size,1))
x,y,z=split(P)

def living_noise(p, scale, radius=.34, phase=0., harmonic=1, detail=2, label=''):
    # Screen x/y never orbit. Only the unused noise dimensions describe a loop,
    # so the material changes locally instead of moving as a rigid image.
    px,py,_=split(p)
    zz=value(label+' / depth',f'{radius}*f*cos({TAU}*{harmonic}+{phase})',{'f':'Flow'})
    ww=value(label+' / fourth dimension',f'{radius}*f*sin({TAU}*{harmonic}+{phase})',{'f':'Flow'})
    n=node('ShaderNodeTexNoise',label); n.noise_dimensions='4D'
    put(n.inputs['Vector'],combine(px,py,math_node('DIVIDE',zz,scale)))
    put(n.inputs['W'],math_node('DIVIDE',ww,scale))
    n.inputs['Scale'].default_value=scale
    n.inputs['Detail'].default_value=detail
    n.inputs['Roughness'].default_value=.62
    return n.outputs

# Breathing bends the complete form, with the feet almost still.
upper=remap(y,-1.38,1.15,0,1)
sway=math_node('MULTIPLY',math_node('MULTIPLY',sn,motion),math_node('MULTIPLY',upper,.045))
breath=math_node('MULTIPLY',math_node('MULTIPLY',cs,motion),math_node('MULTIPLY',upper,.009))
P=vec('SUBTRACT',P,combine(sway,breath,0))
stable_P=P
flow_noise=living_noise(P,3.2,.52,.2,1,2,'Local contour change')
warp=vec('SUBTRACT',flow_noise['Color'],(.5,.5,.5))
warp=vec('MULTIPLY',warp,combine(math_node('MULTIPLY',flow,.08),math_node('MULTIPLY',flow,.04),0))
P=vec('ADD',P,warp)

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
    ('Head',(-.008,1.335),(.154,.206)),
    ('Jaw',(-.004,1.206),(.119,.124)),
    ('Neck',(0,1.020),(.071,.220)),
    ('Shoulder slope',(.002,.758),(.202,.145)),
    ('Chest',(.002,.613),(.241,.259)),
    ('Torso',(.012,.354),(.202,.330)),
    ('Waist',(.018,.173),(.180,.255)),
    ('Hips',(.006,-.032),(.223,.215)),
    ('Left shoulder',(-.247,.704),(.096,.149)),
    ('Right shoulder',(.245,.687),(.095,.149)),
    ('Left upper arm',(-.304,.491),(.078,.265)),
    ('Right upper arm',(.306,.469),(.077,.270)),
    ('Left elbow',(-.332,.255),(.063,.12)),
    ('Right elbow',(.342,.234),(.064,.12)),
    ('Left forearm',(-.358,.075),(.065,.250)),
    ('Right forearm',(.363,.048),(.065,.258)),
    ('Left wrist',(-.377,-.143),(.044,.115)),
    ('Right wrist',(.380,-.174),(.045,.115)),
    ('Left hand',(-.385,-.256),(.051,.132)),
    ('Right hand',(.387,-.284),(.051,.133)),
    ('Left thigh',(-.121,-.329),(.114,.387)),
    ('Right thigh',(.133,-.332),(.112,.389)),
    ('Left knee',(-.134,-.656),(.076,.155)),
    ('Right knee',(.151,-.663),(.077,.154)),
    ('Left calf',(-.148,-.873),(.080,.257)),
    ('Right calf',(.165,-.872),(.081,.258)),
    ('Left ankle',(-.159,-1.159),(.051,.188)),
    ('Right ankle',(.178,-1.156),(.052,.187)),
    ('Left foot',(-.166,-1.324),(.075,.063)),
    ('Right foot',(.187,-1.323),(.077,.063)),
]
d=None
for spec in parts:
    e=ellipse(*spec)
    d=e if d is None else math_node('SMOOTH_MIN',d,e,.087)

section('03 / Lost edges, soft graphite, suspended dust', -2000, -2300)
dispersion=control('Dispersion')
rough=living_noise(stable_P,24,.65,.9,2,2,'Pigment at the edge')
roughness=math_node('MULTIPLY',math_node('SUBTRACT',rough['Fac'],.5),.041)
d=math_node('ADD',d,math_node('MULTIPLY',roughness,dispersion))
softness=math_node('ADD',.025,math_node('MULTIPLY',dispersion,.035))
body=remap(d,-.052,softness,1,0)
outer=remap(d,-.045,math_node('ADD',.08,math_node('MULTIPLY',dispersion,.095)),1,0)
# A single density field covers the union. No per-part contour rims or hollow cores.
mottle=living_noise(stable_P,6.8,.8,1.1,1,2.5,'Pigment growing and receding in place')['Fac']
coverage=remap(mottle,.13,.86,.64,.96)
body=math_node('MULTIPLY',body,coverage)
halo=math_node('MULTIPLY',outer,remap(mottle,.2,.8,.012,.065))
pigment=math_node('ADD',math_node('MULTIPLY',body,.86),halo)

section('04 / Paper tooth and moving grain at several scales', 0, 1500)
grain=control('Grain')
fine=living_noise(stable_P,220,.95,2.3,2,1,'Graphite grains evolving locally')['Fac']
grain_variation=math_node('MULTIPLY',math_node('SUBTRACT',fine,.5),math_node('MULTIPLY',grain,2.0))
pigment=math_node('MULTIPLY',pigment,math_node('ADD',.85,grain_variation))
pigment=math_node('MULTIPLY',pigment,control('Ink'))
paper_noise=noise(geom.outputs['Position'],380,1,'Fine paper fibers')['Fac']
paper_tooth=math_node('MULTIPLY',math_node('SUBTRACT',paper_noise,.5),math_node('MULTIPLY',grain,.085))
paper_living=living_noise(geom.outputs['Position'],260,.55,.8,1,1,'Paper microtexture')['Fac']
paper_change=math_node('MULTIPLY',math_node('SUBTRACT',paper_living,.5),math_node('MULTIPLY',control('Paper motion'),.020))
paper_tooth=math_node('ADD',paper_tooth,paper_change)

section('05 / Quiet warm paper and gray graphite', 1500, 1500)
warmth=control('Paper warmth')
base=math_node('SUBTRACT',244/255,math_node('MULTIPLY',pigment,.64))
base=math_node('SUBTRACT',base,paper_tooth)
r=base
paper_share=math_node('MAXIMUM',math_node('SUBTRACT',1,pigment),0)
tint=math_node('MULTIPLY',warmth,paper_share)
g=math_node('SUBTRACT',base,math_node('MULTIPLY',tint,7/255))
b=math_node('SUBTRACT',base,math_node('MULTIPLY',tint,31/255))
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
camera.location=(0,.075,10); camera_data.type='ORTHO'; camera_data.ortho_scale=5.5
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
text=bpy.data.texts.new('START HERE · Personhood v3')
text.write('''π: Personhood v3 — a continuous presence\n\nFive seconds, 4:3, editable graphite on cream paper.\nPaper: sampled outer border, RGB 244,237,213 (#F4EDD5).\n\nSpace: play/pause. N: controls. Launch with controls.py for the sidebar.\n\nThe full-page cloud wash has been removed. Spatial noise coordinates stay\nfixed while two hidden dimensions change: pigment forms and dissolves\nlocally without the circling overlay. Flow=0 freezes pigment evolution.\nPaper motion=0 freezes the tiny changes within the paper tooth.\nMotion controls the figure's continuous, foot-anchored sway.\n\nThe anatomy uses a smoothly joined field with one pigment density, longer\nneck, sloping shoulders, and connected limbs. No part-specific shading rings.\nMove/scale named empty guides to adjust the figure.\n\nNative Blender shader nodes; no external textures or frame handlers.\nFrame 121 repeats frame 1. Export 1–120 at 24 fps.\nThis is a camera-facing drawing. Save personal edits in a separate copy.\n''')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS/'personhood-v3.blend'),compress=True)
if os.environ.get('PERSONHOOD_RENDER_STILL')=='1':
    bpy.ops.render.render(write_still=True)
print('PERSONHOOD_V3_READY',flush=True)
