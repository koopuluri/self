"""Session-only UI for the Personhood scene. No add-on installation required."""
import bpy

class PERSONHOOD_PT_controls(bpy.types.Panel):
    bl_label='Personhood · 5 second study'
    bl_idname='PERSONHOOD_PT_controls'
    bl_space_type='VIEW_3D'
    bl_region_type='UI'
    bl_category='Personhood'

    def draw(self,context):
        l=self.layout
        c=bpy.data.objects.get('CONTROLS')
        if c is None:
            l.label(text='Open a Personhood scene'); return
        l.label(text='Graphite in motion · 4:3' if 'Flow' in c else 'A quiet encounter · 120 frames')
        row=l.row(align=True)
        row.operator('screen.animation_play',text='Play / Pause',icon='PLAY')
        row.operator('screen.frame_jump',text='Start',icon='REW').end=False
        l.separator()
        if 'Paper motion' in c:
            keys = ('Motion','Flow','Dispersion','Grain','Ink','Paper motion','Paper warmth','Figure size')
        else:
            keys = ('Motion','Flow','Dispersion','Grain','Ink','Atmosphere','Paper warmth','Figure size') if 'Flow' in c else ('Motion','Wind','Atmosphere','Grain','Contrast','Edge ink','Eye presence','Figure size')
        for key in keys:
            label='Pigment motion' if key=='Flow' and 'Paper motion' in c else key
            l.prop(c,'["'+key+'"]',text=label,slider=True)
        l.separator()
        l.label(text='Space: play or pause',icon='INFO')
        l.label(text='N: hide or show this panel')
        l.label(text='Save a copy to preserve your edits.')

old=getattr(bpy.types,'PERSONHOOD_PT_controls',None)
if old:
    bpy.utils.unregister_class(old)
bpy.utils.register_class(PERSONHOOD_PT_controls)

def prepare():
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.show_region_ui=True
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.overlay.show_overlays=False
                area.spaces.active.shading.type='RENDERED'
                try:
                    for region in area.regions:
                        if region.type=='UI': region.active_panel_category='Personhood'
                except (AttributeError,TypeError):
                    pass
    return None
bpy.app.timers.register(prepare,first_interval=1.0)
