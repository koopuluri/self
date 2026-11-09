"""Validate every animated shader input, then render the loaded drawing loop."""
import bpy
import json
from pathlib import Path

scene=bpy.context.scene
stem=Path(bpy.data.filepath).stem
revision=stem.rsplit('-',1)[-1]
frames=Path('/private/tmp/ghost-personhood-frames-'+revision)
frames.mkdir(exist_ok=True)
assets=Path(bpy.data.filepath).parent
owners=list(bpy.data.objects)+[m.node_tree for m in bpy.data.materials if m.node_tree]

def snapshot(frame):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    result={}
    for owner in owners:
        if not owner.animation_data: continue
        for fc in owner.animation_data.drivers:
            v=owner.path_resolve(fc.data_path)
            if not isinstance(v,(float,int)): v=v[fc.array_index]
            result[owner.name+':'+fc.data_path+':'+str(fc.array_index)]=float(v)
    return result

a=snapshot(1); b=snapshot(121); c=snapshot(37)
seam=max(abs(a[k]-b[k]) for k in a if 'Loop phase' not in k)
change=max(abs(a[k]-c[k]) for k in a if 'Loop phase' not in k)
invalid=[owner.name+':'+fc.data_path for owner in owners if owner.animation_data
         for fc in owner.animation_data.drivers if not fc.driver.is_valid]
assert scene.render.resolution_x*3==scene.render.resolution_y*4
assert seam<1e-5, seam
assert change>.01, change
assert not invalid, invalid
result={'resolution':[scene.render.resolution_x,scene.render.resolution_y],
        'aspect_ratio':'4:3','fps':24,'frames':[1,120],'seconds':5,
        'animated_shader_values':len(a),'loop_driver_max_error':seam,
        'motion_driver_max_delta':change,'invalid_drivers':invalid}
(assets/(stem+'.validation.json')).write_text(json.dumps(result,indent=2)+'\n')
print('LOOP_VALIDATION',json.dumps(result),flush=True)
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(frames/'frame_')
scene.frame_start=1;scene.frame_end=120
scene.frame_set(1)
bpy.ops.render.render(animation=True)
scene.frame_set(121)
scene.render.filepath=str(frames/'seam_0121.png')
bpy.ops.render.render(write_still=True)
print('LOOP_FRAMES_COMPLETE',str(frames),flush=True)
