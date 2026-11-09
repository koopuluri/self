// Keep the original paths and use the same rendered SVG for preview and export.
export function createStackStyle(image){
  let template='',weight=135,size=100,renderedWeight=null;
  function render(){
    image.style.width=(13*size/100)+'%';
    if(!template||renderedWeight===weight)return;
    const svg=template.replace(/stroke-width="[^"]+"/,'stroke-width="'+(1.8*weight/100).toFixed(3)+'"');
    image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    renderedWeight=weight;
  }
  const ready=fetch('./stack-icons.svg').then(response=>{
    if(!response.ok)throw new Error('The icon artwork could not load.');
    return response.text();
  }).then(text=>{template=text;render();});
  return {ready,set(settings){weight=settings.iconWeight;size=settings.iconSize;render();}};
}
