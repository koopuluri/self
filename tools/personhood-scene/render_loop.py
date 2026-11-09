"""Validate cyclic geometry and render a fixed 120-frame preview sequence."""
import bpy
import json
import os
from pathlib import Path

scene=bpy.context.scene
frames=Path('/private/tmp/ghost-personhood-frames-v1')
frames.mkdir(exist_ok=True)

def snapshot(frame):
    scene.frame_set(frame)
    graph=bpy.context.evaluated_depsgraph_get()
    out={}
    for ob in scene.objects:
        ev=ob.evaluated_get(graph)
        if ob.type=='MESH':
            me=ev.to_mesh()
            stride=max(1,len(me.vertices)//100)
            vals=[]
            for v in list(me.vertices)[::stride]:
                vals.extend(ev.matrix_world @ v.co)
            out[ob.name]=vals
            ev.to_mesh_clear()
        else:
            out[ob.name]=[x for row in ev.matrix_world for x in row]
    return out

start=snapshot(1)
end=snapshot(121)
middle=snapshot(37)
seam=max(abs(x-y) for key in start for x,y in zip(start[key],end[key]))
movement=max(abs(x-y) for key in start for x,y in zip(start[key],middle[key]))
invalid=[]
for owner in list(bpy.data.objects)+list(bpy.data.shape_keys)+[m.node_tree for m in bpy.data.materials if m.node_tree]:
    if owner.animation_data:
        invalid += [owner.name+': '+fc.data_path for fc in owner.animation_data.drivers if not fc.driver.is_valid]
result={'fps':scene.render.fps,'frames':[1,120],'seconds':120/scene.render.fps,
        'loop_geometry_max_error':seam,'motion_max_delta':movement,'invalid_drivers':invalid}
print('LOOP_VALIDATION',json.dumps(result),flush=True)
assert seam<1e-5, 'Geometry does not return to the start of the loop'
assert movement>.001, 'No measurable movement'
assert not invalid, 'Invalid scene drivers'
Path('/private/tmp/ghost-personhood-validation.json').write_text(json.dumps(result,indent=2)+'\n')
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGB'
scene.render.filepath=str(frames/'frame_')
scene.frame_start=1
scene.frame_end=120
scene.frame_set(1)
bpy.ops.render.render(animation=True)
print('LOOP_FRAMES_COMPLETE',str(frames),flush=True)
